import {
  AppSettings,
  BATCH_MAX,
  CreateDomainInput,
  DEFAULT_SETTINGS,
  DomainInputError,
  DomainRecord,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  PatchDomainInput,
  applyPatch,
  assertTimeZone,
  buildRecordFromCreate,
  effectiveBillingDate,
  etagFor,
  inDueWindow,
  nextPayment,
  parseCreateInput,
  parsePatchInput,
  qualifiesForExpectedSpending,
  settingsSchema,
  stableStringify,
  summarizeSpending,
  toPublicDomain,
} from '../shared/domain';
import { contentHash as hashValue, parseImport, publicFieldsOf, serializeBackup, type BackupFormat, type ConflictPolicy } from '../shared/backup';
import { ApiError } from '../shared/errors';
import type { Actor } from './auth';
import { requireScope, requireSession } from './auth';
import { randomId, sha256Hex } from './crypto';
import type { DocStore, Tx } from './store';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const COLLECTION_CAP = 5000;

interface IdemRecord {
  bodyHash: string;
  status: number;
  response: unknown;
  createdAt: string;
}

interface NameIndex {
  domainId: string;
}

interface PreviewDoc {
  uid: string;
  contentHash: string;
  policy: ConflictPolicy;
  acknowledgeCurrencyChanges: boolean;
  includeSettings: boolean;
  expiresAt: string;
  settings?: AppSettings;
  rows: PreviewRow[];
}

interface PreviewRow {
  name: string;
  action: 'create' | 'skip' | 'replace' | 'merge' | 'blocked';
  domainId?: string;
  revision?: number;
  issues: string[];
  currencyClearsCosts: boolean;
  incoming: CreateDomainInput;
}

export interface HandlerResult {
  status: number;
  body: unknown;
  etag?: string;
  empty?: boolean;
}

function domainPath(uid: string, id: string): string {
  return `users/${uid}/domains/${id}`;
}
function indexPath(uid: string, normalized: string): string {
  return `users/${uid}/domainNames/${sha256Hex(normalized)}`;
}
function settingsPath(uid: string): string {
  return `users/${uid}/settings/app`;
}
function idemPath(actor: Actor, method: string, route: string, key: string): string {
  return `idempotency/${sha256Hex(`${actor.uid}|${method}|${route}|${key}`)}`;
}
function domainsPrefix(uid: string): string {
  return `users/${uid}/domains/`;
}

async function loadSettings(store: DocStore, uid: string): Promise<AppSettings> {
  const stored = await store.get<AppSettings>(settingsPath(uid));
  return stored ?? structuredClone(DEFAULT_SETTINGS);
}

function present(actor: Actor, record: DomainRecord) {
  if (!actor.scopes.includes('domains:read')) {
    return { id: record.id, revision: record.revision, normalizedName: record.normalizedName };
  }
  return toPublicDomain(record);
}

function asDomainError(error: unknown): never {
  if (error instanceof DomainInputError) {
    throw new ApiError(422, 'invalid_domain', error.message, { issues: error.issues });
  }
  throw error;
}

async function withIdempotency(
  store: DocStore,
  actor: Actor,
  method: string,
  route: string,
  key: string | undefined,
  body: unknown,
  fn: (tx: Tx) => Promise<HandlerResult>,
): Promise<HandlerResult> {
  if (!key || key.length > 200) throw new ApiError(400, 'idempotency_key_required', 'Send an Idempotency-Key header');
  const bodyHash = sha256Hex(stableStringify(body));
  const path = idemPath(actor, method, route, key);
  return store.transaction(async (tx) => {
    const existing = await tx.get<IdemRecord>(path);
    if (existing && Date.now() - Date.parse(existing.createdAt) < IDEMPOTENCY_TTL_MS) {
      if (existing.bodyHash !== bodyHash) {
        throw new ApiError(409, 'idempotency_conflict', 'This idempotency key was already used with a different request');
      }
      return { status: existing.status, body: existing.response, replay: true } as HandlerResult;
    }
    const result = await fn(tx);
    tx.set(path, { bodyHash, status: result.status, response: result.body ?? null, createdAt: new Date().toISOString() } satisfies IdemRecord);
    return result;
  });
}

async function claimCreate(tx: Tx, actor: Actor, input: CreateDomainInput, settings: AppSettings, nowIso: string): Promise<DomainRecord> {
  let record: DomainRecord;
  try {
    record = buildRecordFromCreate(input, settings, randomId('dom'), nowIso);
  } catch (error) {
    asDomainError(error);
  }
  const existing = await tx.get<NameIndex>(indexPath(actor.uid, record!.normalizedName));
  if (existing) {
    throw new ApiError(409, 'duplicate_name', 'You already have this domain', { extra: { existingId: existing.domainId } });
  }
  tx.set(domainPath(actor.uid, record!.id), record!);
  tx.set(indexPath(actor.uid, record!.normalizedName), { domainId: record!.id } satisfies NameIndex);
  return record!;
}

export async function createDomain(store: DocStore, actor: Actor, body: unknown, key: string | undefined, nowIso: string): Promise<HandlerResult> {
  requireScope(actor, 'domains:write');
  const settings = await loadSettings(store, actor.uid);
  let input: CreateDomainInput;
  try {
    input = parseCreateInput(body);
  } catch (error) {
    asDomainError(error);
  }
  return withIdempotency(store, actor, 'POST', '/api/v1/domains', key, body, async (tx) => {
    const record = await claimCreate(tx, actor, input!, settings, nowIso);
    return { status: 201, body: present(actor, record), etag: etagFor(record.revision) };
  });
}

export async function batchCreate(store: DocStore, actor: Actor, body: unknown, key: string | undefined, nowIso: string, limit = BATCH_MAX): Promise<HandlerResult> {
  requireScope(actor, 'domains:write');
  const settings = await loadSettings(store, actor.uid);
  const records = Array.isArray((body as { records?: unknown })?.records) ? (body as { records: unknown[] }).records : null;
  if (!records) throw new ApiError(400, 'invalid_body', 'Expected records');
  if (records.length === 0 || records.length > limit) {
    throw new ApiError(413, 'payload_limit', `A batch contains 1 to ${limit} records`);
  }
  const inputs = records.map((item) => {
    try {
      return parseCreateInput(item);
    } catch (error) {
      asDomainError(error);
    }
  }) as CreateDomainInput[];
  return withIdempotency(store, actor, 'POST', '/api/v1/domains/batch', key, body, async (tx) => {
    const prepared: DomainRecord[] = [];
    const seen = new Set<string>();
    for (const input of inputs) {
      let record: DomainRecord;
      try {
        record = buildRecordFromCreate(input, settings, randomId('dom'), nowIso);
      } catch (error) {
        asDomainError(error);
      }
      if (seen.has(record!.normalizedName)) throw new ApiError(409, 'duplicate_name', 'The batch contains the same domain more than once');
      const existing = await tx.get<NameIndex>(indexPath(actor.uid, record!.normalizedName));
      if (existing) throw new ApiError(409, 'duplicate_name', 'You already have this domain', { extra: { existingId: existing.domainId } });
      seen.add(record!.normalizedName);
      prepared.push(record!);
    }
    for (const record of prepared) {
      tx.set(domainPath(actor.uid, record.id), record);
      tx.set(indexPath(actor.uid, record.normalizedName), { domainId: record.id } satisfies NameIndex);
    }
    return { status: 201, body: { records: prepared.map((record) => present(actor, record)) } };
  });
}

export async function patchDomain(store: DocStore, actor: Actor, id: string, body: unknown, ifMatch: string | undefined, nowIso: string): Promise<HandlerResult> {
  requireScope(actor, 'domains:write');
  let patch: PatchDomainInput;
  try {
    patch = parsePatchInput(body);
  } catch (error) {
    asDomainError(error);
  }
  const revision = parseRevision(ifMatch);
  return store.transaction(async (tx) => {
    const current = await tx.get<DomainRecord>(domainPath(actor.uid, id));
    if (!current) throw new ApiError(404, 'not_found', 'Not found');
    if (revision === null) throw new ApiError(428, 'precondition_required', 'Send If-Match with the record revision');
    if (current.revision !== revision) throw new ApiError(412, 'stale_revision', 'This record changed. Reload it and try again');
    let next: DomainRecord;
    try {
      next = applyPatch(current, patch!, nowIso);
    } catch (error) {
      asDomainError(error);
    }
    if (next!.normalizedName !== current.normalizedName) {
      const taken = await tx.get<NameIndex>(indexPath(actor.uid, next!.normalizedName));
      if (taken && taken.domainId !== current.id) {
        throw new ApiError(409, 'duplicate_name', 'You already have this domain', { extra: { existingId: taken.domainId } });
      }
    }
    tx.set(domainPath(actor.uid, id), next!);
    if (next!.normalizedName !== current.normalizedName) {
      tx.delete(indexPath(actor.uid, current.normalizedName));
      tx.set(indexPath(actor.uid, next!.normalizedName), { domainId: id });
    }
    return { status: 200, body: present(actor, next!), etag: etagFor(next!.revision) };
  });
}

export async function deleteDomain(store: DocStore, actor: Actor, id: string, ifMatch: string | undefined): Promise<HandlerResult> {
  requireScope(actor, 'domains:delete');
  const revision = parseRevision(ifMatch);
  return store.transaction(async (tx) => {
    const current = await tx.get<DomainRecord>(domainPath(actor.uid, id));
    if (!current) throw new ApiError(404, 'not_found', 'Not found');
    if (revision === null) throw new ApiError(428, 'precondition_required', 'Send If-Match with the record revision');
    if (current.revision !== revision) throw new ApiError(412, 'stale_revision', 'This record changed. Reload it and try again');
    tx.delete(domainPath(actor.uid, id));
    tx.delete(indexPath(actor.uid, current.normalizedName));
    return { status: 204, body: null, empty: true };
  });
}

export async function getDomain(store: DocStore, actor: Actor, id: string): Promise<HandlerResult> {
  requireScope(actor, 'domains:read');
  const record = await store.get<DomainRecord>(domainPath(actor.uid, id));
  if (!record) throw new ApiError(404, 'not_found', 'Not found');
  return { status: 200, body: toPublicDomain(record), etag: etagFor(record.revision) };
}

export async function listDomains(store: DocStore, actor: Actor, query: URLSearchParams, cursorSecret: string, today: string): Promise<HandlerResult> {
  requireScope(actor, 'domains:read');
  const allowed = new Set(['q', 'lifecycle', 'ownership', 'renewalIntent', 'registrar', 'dnsProvider', 'currency', 'archived', 'due', 'sort', 'direction', 'limit', 'cursor']);
  for (const key of query.keys()) {
    if (!allowed.has(key)) throw new ApiError(400, 'invalid_query', `Unknown query parameter ${key}`);
  }
  const limit = Number(query.get('limit') ?? PAGE_SIZE_DEFAULT);
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE_MAX) throw new ApiError(400, 'invalid_query', 'limit must be 1 to 100');
  const sort = query.get('sort') ?? 'name';
  if (!['name', 'effectiveDate', 'cost', 'updatedAt'].includes(sort)) throw new ApiError(400, 'invalid_query', 'Unsupported sort');
  const direction = query.get('direction') ?? 'asc';
  if (direction !== 'asc' && direction !== 'desc') throw new ApiError(400, 'invalid_query', 'Unsupported direction');
  const filters = query.toString().replace(/(&)?cursor=[^&]*/g, '').replace(/(&)?limit=[^&]*/g, '');
  let offset = 0;
  const cursor = query.get('cursor');
  if (cursor) {
    const parsed = readCursor(cursor, cursorSecret);
    if (parsed.uid !== actor.uid || parsed.filters !== filters || parsed.sort !== sort || parsed.direction !== direction) {
      throw new ApiError(400, 'invalid_cursor', 'This cursor does not match the request');
    }
    offset = parsed.offset;
  }
  const all = await store.list<DomainRecord>(domainsPrefix(actor.uid));
  if (all.length > COLLECTION_CAP) throw new ApiError(413, 'payload_limit', 'This portfolio is too large for one scan. Narrow the request.');
  let rows = all.map((item) => item.data);
  const q = query.get('q')?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((record) => [record.name, record.registrar, record.dnsProvider, record.notes].some((value) => (value ?? '').toLowerCase().includes(q)));
  }
  const lifecycle = query.get('lifecycle');
  if (lifecycle) rows = rows.filter((record) => record.lifecycle === lifecycle);
  const ownership = query.get('ownership');
  if (ownership) rows = rows.filter((record) => record.ownership === ownership);
  const intent = query.get('renewalIntent');
  if (intent) rows = rows.filter((record) => record.renewalIntent === intent);
  const registrar = query.get('registrar');
  if (registrar) rows = rows.filter((record) => (record.registrar ?? '').toLowerCase() === registrar.toLowerCase());
  const dns = query.get('dnsProvider');
  if (dns) rows = rows.filter((record) => (record.dnsProvider ?? '').toLowerCase() === dns.toLowerCase());
  const currency = query.get('currency');
  if (currency) rows = rows.filter((record) => record.currency === currency);
  const archived = query.get('archived') ?? 'false';
  if (archived === 'false') rows = rows.filter((record) => !record.isArchived);
  else if (archived === 'true') rows = rows.filter((record) => record.isArchived);
  else if (archived !== 'all') throw new ApiError(400, 'invalid_query', 'archived must be true, false, or all');
  const due = query.get('due');
  if (due) {
    if (!['overdue', '30', '90', 'next12'].includes(due)) throw new ApiError(400, 'invalid_query', 'Unsupported due window');
    rows = rows.filter((record) => inDueWindow(record, today, due as 'overdue' | '30' | '90' | 'next12'));
  }
  rows.sort((a, b) => compareDomains(a, b, sort) * (direction === 'asc' ? 1 : -1) || a.id.localeCompare(b.id));
  const page = rows.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const nextCursor = nextOffset < rows.length ? writeCursor({ uid: actor.uid, filters, sort, direction, offset: nextOffset }, cursorSecret) : null;
  return { status: 200, body: { records: page.map((record) => toPublicDomain(record)), nextCursor } };
}

function compareDomains(a: DomainRecord, b: DomainRecord, sort: string): number {
  if (sort === 'name') return a.normalizedName.localeCompare(b.normalizedName);
  if (sort === 'updatedAt') return a.updatedAt.localeCompare(b.updatedAt);
  if (sort === 'cost') return (a.renewalCostMinor ?? Number.MAX_SAFE_INTEGER) - (b.renewalCostMinor ?? Number.MAX_SAFE_INTEGER);
  return (effectiveBillingDate(a) ?? '9999-99-99').localeCompare(effectiveBillingDate(b) ?? '9999-99-99');
}

export async function summarize(store: DocStore, actor: Actor, today: string): Promise<HandlerResult> {
  requireScope(actor, 'domains:read');
  const rows = (await store.list<DomainRecord>(domainsPrefix(actor.uid))).map((item) => item.data);
  const next = nextPayment(rows, today);
  const upcoming = rows
    .filter((record) => !record.isArchived && record.lifecycle === 'active')
    .sort((a, b) => (effectiveBillingDate(a) ?? '9999').localeCompare(effectiveBillingDate(b) ?? '9999') || a.normalizedName.localeCompare(b.normalizedName))
    .slice(0, 8);
  return {
    status: 200,
    body: {
      today,
      nextPayment: next
        ? {
            id: next.id,
            name: next.name,
            effectiveBillingDate: effectiveBillingDate(next),
            renewalCostMinor: next.renewalCostMinor,
            currency: next.currency,
            costLabel: next.renewalCostMinor === null ? 'Not entered' : undefined,
          }
        : null,
      spending: summarizeSpending(rows, today),
      windows: {
        days30: summarizeSpending(rows.filter((record) => inDueWindow(record, today, '30') && qualifiesForExpectedSpending(record, today) || false), today),
      },
      upcoming: upcoming.map((record) => toPublicDomain(record)),
    },
  };
}

export async function getSettings(store: DocStore, actor: Actor): Promise<HandlerResult> {
  requireScope(actor, 'domains:read');
  requireSession(actor);
  return { status: 200, body: await loadSettings(store, actor.uid) };
}

export async function putSettings(store: DocStore, actor: Actor, body: unknown): Promise<HandlerResult> {
  requireScope(actor, 'domains:write');
  requireSession(actor);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, 'invalid_settings', 'Settings are invalid');
  try {
    assertTimeZone(parsed.data.timezone);
  } catch (error) {
    asDomainError(error);
  }
  await store.transaction(async (tx) => {
    tx.set(settingsPath(actor.uid), parsed.data);
  });
  return { status: 200, body: parsed.data };
}

export async function updateIntegration(store: DocStore, actor: Actor, id: string, body: unknown, ifMatch: string | undefined, nowIso: string): Promise<HandlerResult> {
  requireSession(actor);
  requireScope(actor, 'domains:write');
  const revision = parseRevision(ifMatch);
  const patch = body as Partial<DomainRecord['integration']>;
  const allowed = ['calendarEventId', 'tasksTaskId', 'calendarReconcileKey', 'tasksReconcileKey'] as const;
  if (!patch || typeof patch !== 'object') throw new ApiError(400, 'invalid_body', 'Expected integration fields');
  for (const key of Object.keys(patch)) {
    if (!(allowed as readonly string[]).includes(key)) throw new ApiError(400, 'invalid_body', 'Unknown integration field');
  }
  return store.transaction(async (tx) => {
    const current = await tx.get<DomainRecord>(domainPath(actor.uid, id));
    if (!current) throw new ApiError(404, 'not_found', 'Not found');
    if (revision === null) throw new ApiError(428, 'precondition_required', 'Send If-Match with the record revision');
    if (current.revision !== revision) throw new ApiError(412, 'stale_revision', 'This record changed. Reload it and try again');
    const next: DomainRecord = {
      ...current,
      revision: current.revision + 1,
      updatedAt: nowIso,
      integration: { ...current.integration, ...cleanIntegration(patch) },
    };
    tx.set(domainPath(actor.uid, id), next);
    return { status: 200, body: toPublicDomain(next), etag: etagFor(next.revision) };
  });
}

function cleanIntegration(patch: Partial<DomainRecord['integration']>): Partial<DomainRecord['integration']> {
  const cleaned: Partial<DomainRecord['integration']> = {};
  for (const key of ['calendarEventId', 'tasksTaskId', 'calendarReconcileKey', 'tasksReconcileKey'] as const) {
    if (Object.hasOwn(patch, key)) {
      const value = patch[key];
      if (value !== null && (typeof value !== 'string' || value.length > 300)) {
        throw new ApiError(422, 'invalid_integration', `${key} must be a string or null`);
      }
      cleaned[key] = value === '' ? null : value;
    }
  }
  return cleaned;
}

export async function previewImport(store: DocStore, actor: Actor, body: unknown, now: Date): Promise<HandlerResult> {
  requireScope(actor, 'domains:write');
  const parsedBody = readImportBody(body);
  let parsed;
  try {
    parsed = parseImport(parsedBody.format, parsedBody.bytes);
  } catch (error) {
    asDomainError(error);
  }
  const policy = parsedBody.policy;
  const existing = (await store.list<DomainRecord>(domainsPrefix(actor.uid))).map((item) => item.data);
  const byName = new Map(existing.map((record) => [record.normalizedName, record]));
  const rows: PreviewRow[] = [];
  for (const incoming of parsed!.domains) {
    let normalized = incoming.name;
    try {
      const draft = buildRecordFromCreate({ ...incoming, expirationDate: incoming.expirationDate ?? incoming.billingDate ?? '2000-01-01' }, DEFAULT_SETTINGS, 'preview', now.toISOString());
      normalized = draft.normalizedName;
    } catch (error) {
      const message = error instanceof DomainInputError ? error.message : 'Invalid domain';
      rows.push({ name: incoming.name, action: 'blocked', issues: [message], currencyClearsCosts: false, incoming });
      continue;
    }
    const current = byName.get(normalized);
    if (!current) {
      if (!incoming.billingDate && !incoming.expirationDate) {
        rows.push({ name: normalized, action: 'blocked', issues: ['Enter a renewal or billing date'], currencyClearsCosts: false, incoming });
      } else rows.push({ name: normalized, action: 'create', issues: [], currencyClearsCosts: false, incoming });
      continue;
    }
    const currencyClearsCosts = Boolean(incoming.currency && incoming.currency !== current.currency && (current.registrationCostMinor !== null || current.renewalCostMinor !== null));
    const action = policy === 'skip' ? 'skip' : policy;
    rows.push({
      name: normalized,
      action,
      domainId: current.id,
      revision: current.revision,
      issues: [],
      currencyClearsCosts,
      incoming,
    });
  }
  if (rows.some((row) => row.action === 'blocked')) {
    return { status: 422, body: { rows: rows.map(publicRow), blocked: true } };
  }
  const hash = hashValue({ domains: parsed!.domains, settings: parsed!.settings ?? null, policy, includeSettings: parsedBody.includeSettings });
  const id = randomId('preview');
  const doc: PreviewDoc = {
    uid: actor.uid,
    contentHash: hash,
    policy,
    acknowledgeCurrencyChanges: parsedBody.acknowledgeCurrencyChanges,
    includeSettings: parsedBody.includeSettings,
    expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS).toISOString(),
    settings: parsed!.settings,
    rows,
  };
  await store.transaction(async (tx) => {
    tx.set(`importPreviews/${id}`, doc);
  });
  return {
    status: 200,
    body: {
      previewId: id,
      expiresAt: doc.expiresAt,
      contentHash: hash,
      fullFidelity: parsed!.fullFidelity,
      warnings: parsed!.warnings,
      currencyAcknowledgementRequired: rows.some((row) => row.currencyClearsCosts),
      rows: rows.map(publicRow),
    },
  };
}

function publicRow(row: PreviewRow) {
  return {
    name: row.name,
    action: row.action,
    domainId: row.domainId ?? null,
    revision: row.revision ?? null,
    issues: row.issues,
    currencyClearsCosts: row.currencyClearsCosts,
  };
}

export async function commitImport(store: DocStore, actor: Actor, body: unknown, key: string | undefined, now: Date): Promise<HandlerResult> {
  requireScope(actor, 'domains:write');
  const previewId = String((body as { previewId?: string })?.previewId || '');
  const suppliedHash = String((body as { contentHash?: string })?.contentHash || '');
  if (!previewId) throw new ApiError(400, 'invalid_body', 'previewId is required');
  const settings = await loadSettings(store, actor.uid);
  return withIdempotency(store, actor, 'POST', '/api/v1/import/commit', key, body, async (tx) => {
    const preview = await tx.get<PreviewDoc>(`importPreviews/${previewId}`);
    if (!preview || preview.uid !== actor.uid) throw new ApiError(404, 'not_found', 'Not found');
    if (preview.contentHash !== suppliedHash) throw new ApiError(409, 'stale_preview', 'The preview no longer matches this import');
    if (Date.parse(preview.expiresAt) <= now.getTime()) throw new ApiError(409, 'preview_expired', 'This preview expired. Preview the file again');
    if (preview.rows.some((row) => row.currencyClearsCosts) && !preview.acknowledgeCurrencyChanges) {
      throw new ApiError(422, 'currency_change_unacknowledged', 'Confirm that changing currency clears stored amounts');
    }
    const creates: DomainRecord[] = [];
    const updates: DomainRecord[] = [];
    const seen = new Set<string>();
    for (const row of preview.rows) {
      if (row.action === 'skip' || row.action === 'blocked') continue;
      if (row.action === 'create') {
        let record: DomainRecord;
        try {
          record = buildRecordFromCreate(row.incoming, settings, randomId('dom'), now.toISOString());
        } catch (error) {
          asDomainError(error);
        }
        if (seen.has(record!.normalizedName)) throw new ApiError(409, 'duplicate_name', 'The import contains the same domain more than once');
        const existing = await tx.get<NameIndex>(indexPath(actor.uid, record!.normalizedName));
        if (existing) throw new ApiError(409, 'duplicate_name', 'You already have this domain', { extra: { existingId: existing.domainId } });
        seen.add(record!.normalizedName);
        creates.push(record!);
        continue;
      }
      const current = await tx.get<DomainRecord>(domainPath(actor.uid, row.domainId!));
      if (!current || current.revision !== row.revision) throw new ApiError(412, 'stale_revision', 'A matching record changed. Preview the import again');
      const merged = row.action === 'replace' ? replaceRecord(current, row.incoming, now.toISOString()) : mergeRecord(current, row.incoming, now.toISOString());
      updates.push(merged);
    }
    const touched = [...creates, ...updates];
    for (const record of creates) {
      tx.set(domainPath(actor.uid, record.id), record);
      tx.set(indexPath(actor.uid, record.normalizedName), { domainId: record.id } satisfies NameIndex);
    }
    for (const record of updates) tx.set(domainPath(actor.uid, record.id), record);
    if (preview.includeSettings) {
      if (actor.authKind !== 'session') throw new ApiError(403, 'forbidden', 'Settings restore requires a browser session');
      if (preview.settings) tx.set(settingsPath(actor.uid), preview.settings);
    }
    tx.delete(`importPreviews/${previewId}`);
    return { status: 200, body: { applied: touched.map((record) => present(actor, record)), skipped: preview.rows.filter((row) => row.action === 'skip').length } };
  });
}

function replaceRecord(current: DomainRecord, incoming: CreateDomainInput, nowIso: string): DomainRecord {
  const built = buildRecordFromCreate({ ...publicFieldsOf(current), ...incoming, name: current.name }, DEFAULT_SETTINGS, current.id, nowIso);
  return { ...built, id: current.id, createdAt: current.createdAt, revision: current.revision + 1, integration: current.integration, updatedAt: nowIso };
}

function mergeRecord(current: DomainRecord, incoming: CreateDomainInput, nowIso: string): DomainRecord {
  const patch: PatchDomainInput = {};
  const assign = (key: keyof CreateDomainInput) => {
    const value = incoming[key];
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '' && key !== 'notes') return;
    if (key === 'notes' && value === '') return;
    (patch as Record<string, unknown>)[key] = value;
  };
  (Object.keys(incoming) as (keyof CreateDomainInput)[]).forEach(assign);
  if (incoming.currency && incoming.currency !== current.currency) patch.clearCostsOnCurrencyChange = true;
  return applyPatch(current, patch, nowIso);
}

export async function exportData(store: DocStore, actor: Actor, query: URLSearchParams): Promise<HandlerResult> {
  requireScope(actor, 'domains:read');
  const format = (query.get('format') ?? 'json') as BackupFormat;
  if (!['json', 'yaml', 'xlsx', 'csv', 'sql'].includes(format)) throw new ApiError(400, 'invalid_query', 'Unsupported export format');
  const includeSettings = query.get('includeSettings') === 'true';
  if (includeSettings && actor.authKind !== 'session') throw new ApiError(403, 'forbidden', 'Settings export requires a browser session');
  const rows = (await store.list<DomainRecord>(domainsPrefix(actor.uid))).map((item) => item.data);
  const settings = includeSettings ? await loadSettings(store, actor.uid) : undefined;
  const file = serializeBackup(rows, format, settings);
  const body = typeof file.body === 'string' ? file.body : Buffer.from(file.body).toString('base64');
  return {
    status: 200,
    body: {
      filename: file.filename,
      contentType: file.contentType,
      encoding: typeof file.body === 'string' ? 'utf8' : 'base64',
      fullFidelity: format === 'json' || format === 'yaml' || format === 'xlsx',
      domainTableOnly: format === 'csv' || format === 'sql',
      content: body,
    },
  };
}

function readImportBody(body: unknown): { format: BackupFormat; bytes: string | Uint8Array; policy: ConflictPolicy; includeSettings: boolean; acknowledgeCurrencyChanges: boolean } {
  const input = body as { format?: BackupFormat; content?: string; encoding?: string; policy?: ConflictPolicy; includeSettings?: boolean; acknowledgeCurrencyChanges?: boolean };
  if (!input || !input.format || typeof input.content !== 'string') throw new ApiError(400, 'invalid_body', 'format and content are required');
  if (!['json', 'yaml', 'xlsx', 'csv', 'sql'].includes(input.format)) throw new ApiError(400, 'invalid_body', 'Unsupported import format');
  if (input.policy && !['skip', 'replace', 'merge'].includes(input.policy)) throw new ApiError(400, 'invalid_body', 'Unsupported conflict policy');
  const bytes = input.encoding === 'base64' ? Buffer.from(input.content, 'base64') : input.content;
  return {
    format: input.format,
    bytes,
    policy: input.policy ?? 'skip',
    includeSettings: input.includeSettings === true,
    acknowledgeCurrencyChanges: input.acknowledgeCurrencyChanges === true,
  };
}

function parseRevision(header: string | undefined): number | null {
  if (!header) return null;
  const match = header.trim().match(/^W\/"(\d+)"$|^"(\d+)"$|^(\d+)$/);
  if (!match) return null;
  return Number(match[1] || match[2] || match[3]);
}

function writeCursor(payload: { uid: string; filters: string; sort: string; direction: string; offset: number }, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sha256Hex(`${secret}:${body}`);
  return `${body}.${sig}`;
}

function readCursor(token: string, secret: string): { uid: string; filters: string; sort: string; direction: string; offset: number } {
  const [body, sig] = token.split('.');
  if (!body || sig !== sha256Hex(`${secret}:${body}`)) throw new ApiError(400, 'invalid_cursor', 'This cursor is not valid');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

export async function userToday(store: DocStore, actor: Actor, now: Date): Promise<string> {
  const settings = await loadSettings(store, actor.uid);
  const { localDateInTimeZone } = await import('../shared/domain');
  return localDateInTimeZone(settings.timezone, now);
}

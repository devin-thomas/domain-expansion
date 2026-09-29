import { z } from 'zod';

export const SCHEMA_VERSION = 2 as const;

export const CURRENCIES = ['USD', 'GBP', 'EUR', 'INR', 'CNY', 'JPY', 'CAD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const OWNERSHIPS = ['owned', 'managed'] as const;
export type Ownership = (typeof OWNERSHIPS)[number];

export const LIFECYCLES = ['active', 'inactive', 'transferred'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const RENEWAL_INTENTS = ['renew', 'let_expire'] as const;
export type RenewalIntent = (typeof RENEWAL_INTENTS)[number];

export const REMINDER_TARGETS = ['default', 'billing', 'expiration'] as const;
export type ReminderTarget = (typeof REMINDER_TARGETS)[number];

export const SCOPES = ['domains:read', 'domains:write', 'domains:delete'] as const;
export type Scope = (typeof SCOPES)[number];

export const DEFAULT_REMINDER_OFFSETS = [30, 14, 7, 1] as const;
export const MAX_NOTES_BYTES = 8 * 1024;
export const MAX_NAME_LENGTH = 253;
export const MAX_TEXT = 200;
export const MAX_PAYMENT_METHOD_LENGTH = 2000;
export const MAX_REMINDER_OFFSETS = 16;
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;
export const BATCH_MAX = 100;
export const AI_BATCH_MAX = 25;
export const IMPORT_MAX_RECORDS = 100;
export const MAX_INPUT_BYTES = 2 * 1024 * 1024;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const currencySchema = z.enum(CURRENCIES);
export const ownershipSchema = z.enum(OWNERSHIPS);
export const lifecycleSchema = z.enum(LIFECYCLES);
export const renewalIntentSchema = z.enum(RENEWAL_INTENTS);

export const reminderSchema = z
  .object({
    enabled: z.boolean(),
    target: z.enum(REMINDER_TARGETS),
    offsets: z.array(z.number().int().min(1).max(365)).max(MAX_REMINDER_OFFSETS),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.offsets).size !== value.offsets.length) {
      ctx.addIssue({ code: 'custom', path: ['offsets'], message: 'Reminder offsets must be unique' });
    }
  });

export type ReminderConfig = z.infer<typeof reminderSchema>;

export const DEFAULT_REMINDERS: ReminderConfig = {
  enabled: true,
  target: 'default',
  offsets: [...DEFAULT_REMINDER_OFFSETS],
};

export const settingsSchema = z
  .object({
    defaultCurrency: currencySchema,
    timezone: z.string().min(1).max(100),
    reminders: reminderSchema,
  })
  .strict();

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCurrency: 'USD',
  timezone: 'UTC',
  reminders: DEFAULT_REMINDERS,
};

const moneySchema = z.number().int().nonnegative().safe();
const purchaseEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address')
    .nullable()
    .default(null),
);
const paymentMethodSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().max(MAX_PAYMENT_METHOD_LENGTH).nullable().default(null),
);

export const publicDomainFields = {
  name: z.string().min(1).max(2000),
  registrar: z.string().max(MAX_TEXT).nullable(),
  dnsProvider: z.string().max(MAX_TEXT).nullable(),
  ownership: ownershipSchema,
  lifecycle: lifecycleSchema,
  renewalIntent: renewalIntentSchema,
  autoRenew: z.boolean().nullable(),
  registrationDate: dateOnly.nullable(),
  billingDate: dateOnly.nullable(),
  expirationDate: dateOnly.nullable(),
  registrationCostMinor: moneySchema.nullable(),
  renewalCostMinor: moneySchema.nullable(),
  purchaseEmail: purchaseEmailSchema,
  paymentMethod: paymentMethodSchema,
  currency: currencySchema,
  notes: z.string(),
  isArchived: z.boolean(),
  reminders: reminderSchema,
};

export const createDomainInputSchema = z
  .object({
    name: z.string().min(1),
    registrar: z.string().max(MAX_TEXT).nullable().optional(),
    dnsProvider: z.string().max(MAX_TEXT).nullable().optional(),
    ownership: ownershipSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    renewalIntent: renewalIntentSchema.optional(),
    autoRenew: z.boolean().nullable().optional(),
    registrationDate: dateOnly.nullable().optional(),
    billingDate: dateOnly.nullable().optional(),
    expirationDate: dateOnly.nullable().optional(),
    registrationCostMinor: moneySchema.nullable().optional(),
    renewalCostMinor: moneySchema.nullable().optional(),
    purchaseEmail: purchaseEmailSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    currency: currencySchema.optional(),
    notes: z.string().optional(),
    isArchived: z.boolean().optional(),
    reminders: reminderSchema.optional(),
  })
  .strict();

export type CreateDomainInput = z.infer<typeof createDomainInputSchema>;

export const patchDomainInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    registrar: z.string().max(MAX_TEXT).nullable().optional(),
    dnsProvider: z.string().max(MAX_TEXT).nullable().optional(),
    ownership: ownershipSchema.optional(),
    lifecycle: lifecycleSchema.optional(),
    renewalIntent: renewalIntentSchema.optional(),
    autoRenew: z.boolean().nullable().optional(),
    registrationDate: dateOnly.nullable().optional(),
    billingDate: dateOnly.nullable().optional(),
    expirationDate: dateOnly.nullable().optional(),
    registrationCostMinor: moneySchema.nullable().optional(),
    renewalCostMinor: moneySchema.nullable().optional(),
    purchaseEmail: purchaseEmailSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    currency: currencySchema.optional(),
    notes: z.string().optional(),
    isArchived: z.boolean().optional(),
    reminders: reminderSchema.optional(),
    clearCostsOnCurrencyChange: z.literal(true).optional(),
  })
  .strict();

export type PatchDomainInput = z.infer<typeof patchDomainInputSchema>;

export const SERVER_OWNED_FIELDS = [
  'id',
  'normalizedName',
  'schemaVersion',
  'revision',
  'createdAt',
  'updatedAt',
  'uid',
  'ownerId',
  'role',
  'integration',
] as const;

export interface IntegrationMeta {
  calendarEventId: string | null;
  tasksTaskId: string | null;
  calendarReconcileKey: string | null;
  tasksReconcileKey: string | null;
}

export interface DomainRecord {
  id: string;
  name: string;
  normalizedName: string;
  registrar: string | null;
  dnsProvider: string | null;
  ownership: Ownership;
  lifecycle: Lifecycle;
  renewalIntent: RenewalIntent;
  autoRenew: boolean | null;
  registrationDate: string | null;
  billingDate: string | null;
  expirationDate: string | null;
  registrationCostMinor: number | null;
  renewalCostMinor: number | null;
  purchaseEmail: string | null;
  paymentMethod: string | null;
  currency: Currency;
  notes: string;
  isArchived: boolean;
  reminders: ReminderConfig;
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  createdAt: string;
  updatedAt: string;
  integration: IntegrationMeta;
}

export interface PublicDomain {
  name: string;
  registrar: string | null;
  dnsProvider: string | null;
  ownership: Ownership;
  lifecycle: Lifecycle;
  renewalIntent: RenewalIntent;
  autoRenew: boolean | null;
  registrationDate: string | null;
  billingDate: string | null;
  expirationDate: string | null;
  registrationCostMinor: number | null;
  renewalCostMinor: number | null;
  purchaseEmail: string | null;
  paymentMethod: string | null;
  currency: Currency;
  notes: string;
  isArchived: boolean;
  reminders: ReminderConfig;
}

export function emptyIntegration(): IntegrationMeta {
  return {
    calendarEventId: null,
    tasksTaskId: null,
    calendarReconcileKey: null,
    tasksReconcileKey: null,
  };
}

export function toPublicDomain(record: DomainRecord): PublicDomain & { id: string; revision: number; normalizedName: string; schemaVersion: number; createdAt: string; updatedAt: string; integration: IntegrationMeta } {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    schemaVersion: record.schemaVersion,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    registrar: record.registrar,
    dnsProvider: record.dnsProvider,
    ownership: record.ownership,
    lifecycle: record.lifecycle,
    renewalIntent: record.renewalIntent,
    autoRenew: record.autoRenew,
    registrationDate: record.registrationDate,
    billingDate: record.billingDate,
    expirationDate: record.expirationDate,
    registrationCostMinor: record.registrationCostMinor,
    renewalCostMinor: record.renewalCostMinor,
    purchaseEmail: record.purchaseEmail ?? null,
    paymentMethod: record.paymentMethod ?? null,
    currency: record.currency,
    notes: record.notes,
    isArchived: record.isArchived,
    reminders: record.reminders,
    integration: record.integration,
  };
}

export class DomainInputError extends Error {
  issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(issues.map((issue) => issue.message).join('; ') || 'Invalid domain');
    this.name = 'DomainInputError';
    this.issues = issues;
  }
}

export function minorUnitScale(currency: Currency): number {
  return currency === 'JPY' ? 0 : 2;
}

export function parseMoneyInput(raw: string, currency: Currency): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new DomainInputError([{ path: 'cost', message: 'Enter a non-negative amount or leave it blank' }]);
  }
  const decimals = minorUnitScale(currency);
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) {
    throw new DomainInputError([
      { path: 'cost', message: decimals === 0 ? `${currency} does not use fractional units` : `Use at most ${decimals} decimal places` },
    ]);
  }
  const scale = 10 ** decimals;
  const minor = Number(whole) * scale + Number(frac.padEnd(decimals, '0') || '0');
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new DomainInputError([{ path: 'cost', message: 'Amount is out of range' }]);
  }
  return minor;
}

export function formatMinor(minor: number | null, currency: Currency): string {
  if (minor === null) return 'Not entered';
  const decimals = minorUnitScale(currency);
  const scale = 10 ** decimals;
  const whole = Math.floor(minor / scale);
  if (decimals === 0) return `${whole} ${currency}`;
  const frac = String(minor % scale).padStart(decimals, '0');
  return `${whole}.${frac} ${currency}`;
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function assertDateOnly(value: string | null | undefined, path: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isValidDateOnly(value)) {
    throw new DomainInputError([{ path, message: 'Use a real calendar date as YYYY-MM-DD' }]);
  }
  return value;
}

export function addCalendarMonths(isoDate: string, months: number): string {
  if (!isValidDateOnly(isoDate)) {
    throw new DomainInputError([{ path: 'date', message: 'Invalid date' }]);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonthIndex = index % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonthIndex + 1, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDay);
  return formatIsoDate(nextYear, nextMonthIndex + 1, nextDay);
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function localDateInTimeZone(timeZone: string, now = new Date()): string {
  assertTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function assertTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new DomainInputError([{ path: 'timezone', message: 'Use a valid IANA time zone' }]);
  }
}

export function effectiveBillingDate(record: Pick<DomainRecord, 'billingDate' | 'expirationDate'>): string | null {
  return record.billingDate ?? record.expirationDate;
}

export function effectiveExpirationDate(record: Pick<DomainRecord, 'billingDate' | 'expirationDate'>): string | null {
  return record.expirationDate ?? record.billingDate;
}

export function resolveReminderTarget(reminders: ReminderConfig, intent: RenewalIntent): 'billing' | 'expiration' {
  if (reminders.target === 'billing' || reminders.target === 'expiration') return reminders.target;
  return intent === 'let_expire' ? 'expiration' : 'billing';
}

export function reminderAnchor(record: Pick<DomainRecord, 'billingDate' | 'expirationDate' | 'reminders' | 'renewalIntent'>): string | null {
  const target = resolveReminderTarget(record.reminders, record.renewalIntent);
  return target === 'billing' ? effectiveBillingDate(record) : effectiveExpirationDate(record);
}

export type Urgency = 'none' | 'later' | 'soon' | 'due' | 'overdue';

export function urgencyFor(
  record: Pick<DomainRecord, 'billingDate' | 'expirationDate' | 'reminders' | 'renewalIntent' | 'lifecycle' | 'isArchived'>,
  today: string,
): Urgency {
  if (record.isArchived || record.lifecycle !== 'active') return 'none';
  const anchor = reminderAnchor(record);
  if (!anchor) return 'none';
  const days = daysBetween(today, anchor);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due';
  if (record.reminders.enabled && record.reminders.offsets.some((offset) => days <= offset)) return 'soon';
  return 'later';
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function normalizeDomainName(input: string): string {
  const trimmed = input.normalize('NFKC').trim();
  if (!trimmed) {
    throw new DomainInputError([{ path: 'name', message: 'Enter a domain name' }]);
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed) || trimmed.includes('*') || /\s/.test(trimmed)) {
    throw new DomainInputError([{ path: 'name', message: 'That domain name is not valid' }]);
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `http://${trimmed}`);
  } catch {
    throw new DomainInputError([{ path: 'name', message: 'That domain name is not valid' }]);
  }
  if (url.username || url.password) {
    throw new DomainInputError([{ path: 'name', message: 'Remove credentials from the domain' }]);
  }
  if (hasScheme && url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DomainInputError([{ path: 'name', message: 'Only a host name or an http(s) URL can be saved' }]);
  }
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname.includes('*') || hostname.includes(':') || IPV4.test(hostname)) {
    throw new DomainInputError([{ path: 'name', message: 'Enter a domain name, not an IP address or wildcard' }]);
  }
  if (hostname.length > MAX_NAME_LENGTH) {
    throw new DomainInputError([{ path: 'name', message: 'Domain name is too long' }]);
  }
  const labels = hostname.split('.');
  if (labels.length < 2) {
    throw new DomainInputError([{ path: 'name', message: 'Enter a full domain name' }]);
  }
  for (const label of labels) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      throw new DomainInputError([{ path: 'name', message: 'That domain name is not valid' }]);
    }
  }
  return hostname;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function assertNotes(notes: string): void {
  if (byteLength(notes) > MAX_NOTES_BYTES) {
    throw new DomainInputError([{ path: 'notes', message: 'Notes are limited to 8 KiB' }]);
  }
}

export function rejectForbiddenFields(input: Record<string, unknown>): void {
  const issues = Object.keys(input)
    .filter((key) => (SERVER_OWNED_FIELDS as readonly string[]).includes(key))
    .map((key) => ({ path: key, message: `${key} is set by the server` }));
  if (issues.length) throw new DomainInputError(issues);
}

export function parseCreateInput(input: unknown): CreateDomainInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DomainInputError([{ path: '', message: 'Expected a domain object' }]);
  }
  rejectForbiddenFields(input as Record<string, unknown>);
  const parsed = createDomainInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainInputError(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  }
  return parsed.data;
}

export function parsePatchInput(input: unknown): PatchDomainInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DomainInputError([{ path: '', message: 'Expected a domain patch' }]);
  }
  rejectForbiddenFields(input as Record<string, unknown>);
  const parsed = patchDomainInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainInputError(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  }
  return parsed.data;
}

export function buildRecordFromCreate(input: CreateDomainInput, settings: AppSettings, id: string, nowIso: string): DomainRecord {
  const normalizedName = normalizeDomainName(input.name);
  const currency = input.currency ?? settings.defaultCurrency;
  const record: DomainRecord = {
    id,
    name: normalizedName,
    normalizedName,
    registrar: input.registrar ?? null,
    dnsProvider: input.dnsProvider ?? null,
    ownership: input.ownership ?? 'owned',
    lifecycle: input.lifecycle ?? 'active',
    renewalIntent: input.renewalIntent ?? 'renew',
    autoRenew: input.autoRenew === undefined ? null : input.autoRenew,
    registrationDate: assertDateOnly(input.registrationDate, 'registrationDate'),
    billingDate: assertDateOnly(input.billingDate, 'billingDate'),
    expirationDate: assertDateOnly(input.expirationDate, 'expirationDate'),
    registrationCostMinor: input.registrationCostMinor ?? null,
    renewalCostMinor: input.renewalCostMinor ?? null,
    purchaseEmail: input.purchaseEmail?.trim() || null,
    paymentMethod: input.paymentMethod ?? null,
    currency,
    notes: input.notes ?? '',
    isArchived: input.isArchived ?? false,
    reminders: input.reminders ?? structuredClone(settings.reminders),
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    integration: emptyIntegration(),
  };
  assertCompleteRecord(record);
  return record;
}

export function applyPatch(current: DomainRecord, patch: PatchDomainInput, nowIso: string): DomainRecord {
  const next: DomainRecord = {
    ...current,
    purchaseEmail: current.purchaseEmail ?? null,
    paymentMethod: current.paymentMethod ?? null,
    reminders: { ...current.reminders, offsets: [...current.reminders.offsets] },
    integration: { ...current.integration },
  };
  const currencyChanging = patch.currency !== undefined && patch.currency !== current.currency;
  const hasStoredCosts = current.registrationCostMinor !== null || current.renewalCostMinor !== null;
  if (currencyChanging && hasStoredCosts && patch.clearCostsOnCurrencyChange !== true) {
    throw new DomainInputError([
      {
        path: 'currency',
        message: 'Changing currency clears stored amounts. Send clearCostsOnCurrencyChange and enter the new amounts.',
      },
    ]);
  }
  if (currencyChanging && patch.clearCostsOnCurrencyChange === true) {
    next.registrationCostMinor = null;
    next.renewalCostMinor = null;
    next.currency = patch.currency!;
  }
  const assign = <K extends keyof PatchDomainInput>(key: K) => {
    if (patch[key] !== undefined && key !== 'clearCostsOnCurrencyChange') {
      (next as unknown as Record<string, unknown>)[key] = patch[key];
    }
  };
  if (patch.name !== undefined) {
    next.normalizedName = normalizeDomainName(patch.name);
    next.name = next.normalizedName;
  }
  assign('registrar');
  assign('dnsProvider');
  assign('ownership');
  assign('lifecycle');
  assign('renewalIntent');
  assign('autoRenew');
  assign('paymentMethod');
  if (patch.purchaseEmail !== undefined) next.purchaseEmail = patch.purchaseEmail?.trim() || null;
  if (patch.registrationDate !== undefined) next.registrationDate = assertDateOnly(patch.registrationDate, 'registrationDate');
  if (patch.billingDate !== undefined) next.billingDate = assertDateOnly(patch.billingDate, 'billingDate');
  if (patch.expirationDate !== undefined) next.expirationDate = assertDateOnly(patch.expirationDate, 'expirationDate');
  if (patch.registrationCostMinor !== undefined) next.registrationCostMinor = patch.registrationCostMinor;
  if (patch.renewalCostMinor !== undefined) next.renewalCostMinor = patch.renewalCostMinor;
  if (patch.currency !== undefined) next.currency = patch.currency;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.isArchived !== undefined) next.isArchived = patch.isArchived;
  if (patch.reminders !== undefined) next.reminders = patch.reminders;
  next.revision = current.revision + 1;
  next.updatedAt = nowIso;
  next.schemaVersion = SCHEMA_VERSION;
  next.id = current.id;
  next.createdAt = current.createdAt;
  assertCompleteRecord(next);
  return next;
}

export function assertCompleteRecord(record: DomainRecord): void {
  const issues: { path: string; message: string }[] = [];
  if (!record.billingDate && !record.expirationDate) {
    issues.push({ path: 'expirationDate', message: 'Enter a renewal or billing date' });
  }
  for (const field of ['registrationDate', 'billingDate', 'expirationDate'] as const) {
    if (record[field] && !isValidDateOnly(record[field]!)) {
      issues.push({ path: field, message: 'Use a real calendar date as YYYY-MM-DD' });
    }
  }
  try {
    assertNotes(record.notes);
  } catch (error) {
    if (error instanceof DomainInputError) issues.push(...error.issues);
  }
  if (!purchaseEmailSchema.safeParse(record.purchaseEmail).success) {
    issues.push({ path: 'purchaseEmail', message: 'Enter a valid email address' });
  }
  if (!paymentMethodSchema.safeParse(record.paymentMethod).success) {
    issues.push({ path: 'paymentMethod', message: `Payment method description is limited to ${MAX_PAYMENT_METHOD_LENGTH} characters` });
  }
  const reminders = reminderSchema.safeParse(record.reminders);
  if (!reminders.success) {
    issues.push({ path: 'reminders', message: 'Reminder configuration is invalid' });
  }
  if (issues.length) throw new DomainInputError(issues);
}

export interface SpendingSummary {
  byCurrency: { currency: Currency; minor: number; count: number }[];
  unknownCostCount: number;
  qualifyingCount: number;
}

export function qualifiesForExpectedSpending(record: DomainRecord, today: string): boolean {
  if (record.isArchived || record.lifecycle !== 'active' || record.renewalIntent !== 'renew') return false;
  const billing = effectiveBillingDate(record);
  if (!billing) return false;
  const end = addCalendarMonths(today, 12);
  return billing >= today && billing < end;
}

export function summarizeSpending(records: DomainRecord[], today: string): SpendingSummary {
  const totals = new Map<Currency, { minor: number; count: number }>();
  let unknownCostCount = 0;
  let qualifyingCount = 0;
  for (const record of records) {
    if (!qualifiesForExpectedSpending(record, today)) continue;
    qualifyingCount += 1;
    if (record.renewalCostMinor === null) {
      unknownCostCount += 1;
      continue;
    }
    const current = totals.get(record.currency) ?? { minor: 0, count: 0 };
    current.minor += record.renewalCostMinor;
    current.count += 1;
    totals.set(record.currency, current);
  }
  return {
    byCurrency: [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, value]) => ({ currency, ...value })),
    unknownCostCount,
    qualifyingCount,
  };
}

export function nextPayment(records: DomainRecord[], today: string): DomainRecord | null {
  const candidates = records.filter((record) => {
    if (record.isArchived || record.lifecycle !== 'active' || record.renewalIntent !== 'renew') return false;
    const billing = effectiveBillingDate(record);
    return Boolean(billing && billing >= today);
  });
  candidates.sort((a, b) => {
    const date = (effectiveBillingDate(a) ?? '').localeCompare(effectiveBillingDate(b) ?? '');
    if (date !== 0) return date;
    return a.normalizedName.localeCompare(b.normalizedName);
  });
  return candidates[0] ?? null;
}

export function windowEnd(today: string, days: number): string {
  const [year, month, day] = today.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day + days));
  return probe.toISOString().slice(0, 10);
}

export function inDueWindow(record: DomainRecord, today: string, window: 'overdue' | '30' | '90' | 'next12'): boolean {
  const billing = effectiveBillingDate(record);
  if (!billing || record.isArchived) return false;
  if (window === 'overdue') return billing < today;
  if (window === 'next12') return billing >= today && billing < addCalendarMonths(today, 12);
  const days = window === '30' ? 30 : 90;
  return billing >= today && billing < windowEnd(today, days);
}

export function nextOccurrence(month: number, day: number, today: string): string | null {
  const [year] = today.split('-').map(Number);
  const candidate = formatIsoDate(year, month, day);
  if (!isValidDateOnly(candidate)) return null;
  if (candidate >= today) return candidate;
  const rolled = formatIsoDate(year + 1, month, day);
  return isValidDateOnly(rolled) ? rolled : null;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function etagFor(revision: number): string {
  return `"${revision}"`;
}

export function revisionFromEtag(header: string | undefined): number | null {
  if (!header) return null;
  const match = header.trim().match(/^W\/"(\d+)"$|^"(\d+)"$|^(\d+)$/);
  if (!match) return null;
  return Number(match[1] || match[2] || match[3]);
}

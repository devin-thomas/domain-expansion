import { JSON_SCHEMA, dump, load } from 'js-yaml';
import * as XLSX from 'xlsx';
import {
  AppSettings,
  CreateDomainInput,
  DEFAULT_SETTINGS,
  DomainInputError,
  DomainRecord,
  IMPORT_MAX_RECORDS,
  MAX_INPUT_BYTES,
  PublicDomain,
  SCHEMA_VERSION,
  assertTimeZone,
  parseCreateInput,
  reminderSchema,
  settingsSchema,
  stableStringify,
} from './domain.js';

export type BackupFormat = 'json' | 'yaml' | 'xlsx' | 'csv' | 'sql';
export type ConflictPolicy = 'skip' | 'replace' | 'merge';

export interface BackupDocument {
  format: 'domain-expansion-backup';
  schemaVersion: number;
  domains: CreateDomainInput[];
  settings?: AppSettings;
}

export interface ParsedImport {
  format: BackupFormat;
  fullFidelity: boolean;
  schemaVersion: number | null;
  domains: CreateDomainInput[];
  settings?: AppSettings;
  warnings: string[];
}

const PUBLIC_KEYS = [
  'name',
  'registrar',
  'dnsProvider',
  'ownership',
  'lifecycle',
  'renewalIntent',
  'autoRenew',
  'registrationDate',
  'billingDate',
  'expirationDate',
  'registrationCostMinor',
  'renewalCostMinor',
  'purchaseEmail',
  'paymentMethod',
  'currency',
  'notes',
  'isArchived',
  'reminders',
] as const;

const XLSX_DOMAIN_COLUMNS = 17;
const XLSX_REMINDER_COLUMNS = 4;
const XLSX_SETTINGS_COLUMNS = 2;
const XLSX_SETTINGS_MAX_ROWS = 9;

export function publicFieldsOf(record: DomainRecord | PublicDomain): CreateDomainInput {
  return {
    name: record.name,
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
  };
}

export function backupDocument(records: DomainRecord[], settings?: AppSettings): BackupDocument {
  return {
    format: 'domain-expansion-backup',
    schemaVersion: SCHEMA_VERSION,
    domains: records.map(publicFieldsOf),
    ...(settings ? { settings } : {}),
  };
}

export function serializeBackup(records: DomainRecord[], format: BackupFormat, settings?: AppSettings): { body: string | Uint8Array; contentType: string; filename: string } {
  const doc = backupDocument(records, settings);
  if (format === 'json') {
    return { body: JSON.stringify(doc, null, 2), contentType: 'application/json', filename: 'domain-expansion-backup.json' };
  }
  if (format === 'yaml') {
    return { body: dump(doc, { noRefs: true, lineWidth: 120 }), contentType: 'application/yaml', filename: 'domain-expansion-backup.yaml' };
  }
  if (format === 'csv') {
    return { body: toCsv(records), contentType: 'text/csv; charset=utf-8', filename: 'domains.csv' };
  }
  if (format === 'sql') {
    return { body: toSql(records), contentType: 'application/sql; charset=utf-8', filename: 'domains.sql' };
  }
  return { body: toXlsx(records, settings), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'domain-expansion-backup.xlsx' };
}

function neutralizeSpreadsheet(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
}

function toCsv(records: DomainRecord[]): string {
  const headers = [
    'name',
    'registrar',
    'dnsProvider',
    'ownership',
    'lifecycle',
    'renewalIntent',
    'autoRenew',
    'registrationDate',
    'billingDate',
    'expirationDate',
    'registrationCostMinor',
    'renewalCostMinor',
    'purchaseEmail',
    'paymentMethod',
    'currency',
    'notes',
    'isArchived',
  ];
  const lines = [headers.join(',')];
  for (const record of records) {
    const values = headers.map((header) => csvCell((record as unknown as Record<string, unknown>)[header]));
    lines.push(values.join(','));
  }
  return `${lines.join('\n')}\n# domain-table export, not a full backup\n`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(neutralizeSpreadsheet(value) ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toSql(records: DomainRecord[]): string {
  const lines = [
    '-- Domain Expansion domain-table export. Not a full backup. Do not execute untrusted SQL; this file is data, not a script the app runs.',
    'CREATE TABLE domains (name TEXT, registrar TEXT, ownership TEXT, lifecycle TEXT, renewal_intent TEXT, expiration_date TEXT, renewal_cost_minor INTEGER, currency TEXT, auto_renew INTEGER, notes TEXT, is_archived INTEGER, purchase_email TEXT, payment_method TEXT);',
  ];
  for (const record of records) {
    const values = [
      record.name,
      record.registrar,
      record.ownership,
      record.lifecycle,
      record.renewalIntent,
      record.expirationDate,
      record.renewalCostMinor,
      record.currency,
      record.autoRenew === null ? null : record.autoRenew ? 1 : 0,
      record.notes,
      record.isArchived ? 1 : 0,
      record.purchaseEmail,
      record.paymentMethod,
    ].map(sqlLiteral);
    lines.push(`INSERT INTO domains VALUES (${values.join(', ')});`);
  }
  return `${lines.join('\n')}\n`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toXlsx(records: DomainRecord[], settings?: AppSettings): Uint8Array {
  const domainRows = records.map((record) => ({
    name: neutralizeSpreadsheet(record.name),
    registrar: neutralizeSpreadsheet(record.registrar),
    dnsProvider: neutralizeSpreadsheet(record.dnsProvider),
    ownership: record.ownership,
    lifecycle: record.lifecycle,
    renewalIntent: record.renewalIntent,
    autoRenew: record.autoRenew === null ? null : record.autoRenew,
    registrationDate: record.registrationDate,
    billingDate: record.billingDate,
    expirationDate: record.expirationDate,
    registrationCostMinor: record.registrationCostMinor,
    renewalCostMinor: record.renewalCostMinor,
    purchaseEmail: neutralizeSpreadsheet(record.purchaseEmail),
    paymentMethod: neutralizeSpreadsheet(record.paymentMethod),
    currency: record.currency,
    notes: neutralizeSpreadsheet(record.notes),
    isArchived: record.isArchived,
  }));
  const reminderRows = records.map((record) => ({
    name: record.name,
    enabled: record.reminders.enabled,
    target: record.reminders.target,
    offsets: record.reminders.offsets.join(' '),
  }));
  const metaRows = [
    { key: 'format', value: 'domain-expansion-backup' },
    { key: 'schemaVersion', value: SCHEMA_VERSION },
    { key: 'fidelity', value: 'full-non-secret' },
    ...(settings
      ? [
          { key: 'defaultCurrency', value: settings.defaultCurrency },
          { key: 'timezone', value: settings.timezone },
          { key: 'reminderEnabled', value: String(settings.reminders.enabled) },
          { key: 'reminderTarget', value: settings.reminders.target },
          { key: 'reminderOffsets', value: settings.reminders.offsets.join(' ') },
        ]
      : []),
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(domainRows), 'Domains');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(reminderRows), 'Reminders');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(metaRows), 'Settings');
  const out = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Uint8Array(out);
}

export function assertInputSize(bytes: number): void {
  if (bytes > MAX_INPUT_BYTES) {
    throw new DomainInputError([{ path: 'file', message: 'File exceeds the 2 MiB limit' }]);
  }
}

export function zipDeclaredUncompressedSize(buffer: Uint8Array): number {
  let offset = 0;
  let total = 0;
  const view = buffer;
  while (offset + 30 <= view.length) {
    const sig = view[offset] | (view[offset + 1] << 8) | (view[offset + 2] << 16) | (view[offset + 3] << 24);
    if (sig !== 0x04034b50) break;
    const compSize = readU32(view, offset + 18);
    const uncomp = readU32(view, offset + 22);
    const nameLen = view[offset + 26] | (view[offset + 27] << 8);
    const extraLen = view[offset + 28] | (view[offset + 29] << 8);
    total += uncomp;
    if (total > 8 * 1024 * 1024) return total;
    offset += 30 + nameLen + extraLen + compSize;
    if (offset < 0) break;
  }
  return total;
}

function readU32(view: Uint8Array, offset: number): number {
  return (view[offset] | (view[offset + 1] << 8) | (view[offset + 2] << 16) | (view[offset + 3] << 24)) >>> 0;
}

export function parseImport(format: BackupFormat, payload: string | Uint8Array): ParsedImport {
  if (format === 'sql') {
    throw new DomainInputError([{ path: 'file', message: 'SQL exports are domain tables only and are never executed or imported' }]);
  }
  const byteSize = typeof payload === 'string' ? new TextEncoder().encode(payload).length : payload.byteLength;
  assertInputSize(byteSize);
  if (format === 'json') return parseStructured(JSON.parse(typeof payload === 'string' ? payload : new TextDecoder().decode(payload)), 'json');
  if (format === 'yaml') {
    const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    const loaded = load(text, { schema: JSON_SCHEMA });
    return parseStructured(loaded, 'yaml');
  }
  if (format === 'csv') {
    const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    return parseCsv(text);
  }
  const bytes = payload instanceof Uint8Array ? payload : new TextEncoder().encode(payload);
  if (zipDeclaredUncompressedSize(bytes) > 8 * 1024 * 1024) {
    throw new DomainInputError([{ path: 'file', message: 'Spreadsheet expands beyond the safe size limit' }]);
  }
  return parseXlsx(bytes);
}

function parseStructured(value: unknown, format: 'json' | 'yaml'): ParsedImport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainInputError([{ path: 'file', message: 'Backup must be an object' }]);
  }
  const doc = value as Record<string, unknown>;
  if (doc.format !== 'domain-expansion-backup') {
    throw new DomainInputError([{ path: 'format', message: 'Unsupported backup format' }]);
  }
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    throw new DomainInputError([{ path: 'schemaVersion', message: `Unsupported schema version ${String(doc.schemaVersion)}` }]);
  }
  if (!Array.isArray(doc.domains)) {
    throw new DomainInputError([{ path: 'domains', message: 'Backup is missing domains' }]);
  }
  if (doc.domains.length > IMPORT_MAX_RECORDS) {
    throw new DomainInputError([{ path: 'domains', message: `Imports are limited to ${IMPORT_MAX_RECORDS} records` }]);
  }
  const domains = doc.domains.map((item, index) => coerceDomain(item, `domains.${index}`));
  let settings: AppSettings | undefined;
  if (doc.settings !== undefined) {
    const parsed = settingsSchema.safeParse(doc.settings);
    if (!parsed.success) throw new DomainInputError([{ path: 'settings', message: 'Settings in the backup are invalid' }]);
    assertTimeZone(parsed.data.timezone);
    settings = parsed.data;
  }
  return { format, fullFidelity: true, schemaVersion: SCHEMA_VERSION, domains, settings, warnings: [] };
}

function coerceDomain(item: unknown, path: string): CreateDomainInput {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new DomainInputError([{ path, message: 'Each domain must be an object' }]);
  }
  const source = item as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!(PUBLIC_KEYS as readonly string[]).includes(key)) {
      throw new DomainInputError([{ path: `${path}.${key}`, message: 'Backups cannot include server or secret fields' }]);
    }
  }
  try {
    return parseCreateInput(source);
  } catch (error) {
    if (error instanceof DomainInputError) {
      throw new DomainInputError(error.issues.map((issue) => ({ path: `${path}.${issue.path}`, message: issue.message })));
    }
    throw error;
  }
}

function parseCsv(text: string): ParsedImport {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim() && !cell.trim().startsWith('#')));
  if (rows.length < 2) throw new DomainInputError([{ path: 'file', message: 'CSV needs a header and at least one row' }]);
  const headers = rows[0].map((cell) => cell.trim());
  const domains: CreateDomainInput[] = [];
  const warnings = ['CSV is a domain-table export, not a full backup.'];
  for (const row of rows.slice(1)) {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    domains.push(coerceTabular(record));
  }
  if (domains.length > IMPORT_MAX_RECORDS) {
    throw new DomainInputError([{ path: 'domains', message: `Imports are limited to ${IMPORT_MAX_RECORDS} records` }]);
  }
  return { format: 'csv', fullFidelity: false, schemaVersion: null, domains, warnings };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function coerceTabular(row: Record<string, unknown>): CreateDomainInput {
  const bool = (value: unknown): boolean | null | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    if (['true', 'yes', '1'].includes(text)) return true;
    if (['false', 'no', '0'].includes(text)) return false;
    if (text === 'null' || text === 'unknown') return null;
    throw new DomainInputError([{ path: 'autoRenew', message: 'Could not read a boolean value' }]);
  };
  const nullableText = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text === '' ? null : text.replace(/^'/, '');
  };
  const nullableFreeText = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const text = String(value);
    return text === '' ? null : text.replace(/^'/, '');
  };
  const money = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new DomainInputError([{ path: 'renewalCostMinor', message: 'Costs must be non-negative integers in minor units' }]);
      }
      return value;
    }
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) {
      throw new DomainInputError([{ path: 'renewalCostMinor', message: 'Tabular costs must be integer minor units, not guessed decimals' }]);
    }
    return Number(text);
  };
  const date = (value: unknown): string | null => {
    const text = nullableText(value);
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new DomainInputError([{ path: 'expirationDate', message: 'Dates must be YYYY-MM-DD. Missing dates are not invented.' }]);
    }
    return text;
  };
  const autoRenew = bool(row.autoRenew);
  const input = {
    name: String(row.name ?? '').replace(/^'/, ''),
    registrar: nullableText(row.registrar),
    dnsProvider: nullableText(row.dnsProvider),
    ownership: emptyToUndefined(row.ownership),
    lifecycle: emptyToUndefined(row.lifecycle),
    renewalIntent: emptyToUndefined(row.renewalIntent),
    autoRenew: autoRenew === undefined ? undefined : autoRenew,
    registrationDate: date(row.registrationDate),
    billingDate: date(row.billingDate),
    expirationDate: date(row.expirationDate),
    registrationCostMinor: money(row.registrationCostMinor),
    renewalCostMinor: money(row.renewalCostMinor),
    currency: emptyToUndefined(row.currency),
    purchaseEmail: nullableText(row.purchaseEmail ?? row.purchase_email),
    paymentMethod: nullableFreeText(row.paymentMethod ?? row.payment_method),
    notes: nullableText(row.notes) ?? '',
    isArchived: bool(row.isArchived) === true,
  };
  return parseCreateInput(input);
}

function emptyToUndefined(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function parseXlsx(bytes: Uint8Array): ParsedImport {
  const book = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: false });
  if (!book.SheetNames.includes('Domains') || !book.SheetNames.includes('Reminders') || !book.SheetNames.includes('Settings')) {
    throw new DomainInputError([{ path: 'file', message: 'Workbook must contain Domains, Reminders, and Settings sheets' }]);
  }
  assertWorksheetDimensions(book.Sheets.Domains, 'Domains', IMPORT_MAX_RECORDS + 1, XLSX_DOMAIN_COLUMNS);
  assertWorksheetDimensions(book.Sheets.Reminders, 'Reminders', IMPORT_MAX_RECORDS * 16 + 1, XLSX_REMINDER_COLUMNS);
  assertWorksheetDimensions(book.Sheets.Settings, 'Settings', XLSX_SETTINGS_MAX_ROWS, XLSX_SETTINGS_COLUMNS);
  rejectWorksheetFormulas(book.Sheets.Domains);
  rejectWorksheetFormulas(book.Sheets.Reminders);
  rejectWorksheetFormulas(book.Sheets.Settings);
  const domainsSheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.Domains, { raw: true, defval: null });
  const reminders = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.Reminders, { raw: true, defval: null });
  const meta = XLSX.utils.sheet_to_json<{ key: string; value: unknown }>(book.Sheets.Settings, { raw: true, defval: null });
  const version = meta.find((row) => row.key === 'schemaVersion')?.value;
  if (Number(version) !== SCHEMA_VERSION) {
    throw new DomainInputError([{ path: 'schemaVersion', message: 'Unsupported spreadsheet schema version' }]);
  }
  const reminderByName = new Map(reminders.map((row) => [String(row.name), row]));
  const domains = domainsSheet.map((row) => {
    rejectFormulaRow(row);
    const base = coerceTabular(row);
    const reminder = reminderByName.get(String(row.name));
    if (!reminder) return base;
    rejectFormulaRow(reminder);
    const offsets = String(reminder.offsets ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    const parsed = reminderSchema.safeParse({
      enabled: reminder.enabled === true || reminder.enabled === 'true',
      target: reminder.target,
      offsets,
    });
    if (!parsed.success) throw new DomainInputError([{ path: 'reminders', message: `Invalid reminders for ${String(row.name)}` }]);
    return parseCreateInput({ ...base, reminders: parsed.data });
  });
  if (domains.length > IMPORT_MAX_RECORDS) {
    throw new DomainInputError([{ path: 'domains', message: `Imports are limited to ${IMPORT_MAX_RECORDS} records` }]);
  }
  const settings = settingsFromMeta(meta);
  return { format: 'xlsx', fullFidelity: true, schemaVersion: SCHEMA_VERSION, domains, settings, warnings: [] };
}

function assertWorksheetDimensions(sheet: XLSX.WorkSheet, name: string, maxRows: number, maxColumns: number): void {
  const reference = sheet['!ref'];
  if (!reference) return;
  const range = XLSX.utils.decode_range(reference);
  const coordinates = [range.s.r, range.s.c, range.e.r, range.e.c];
  if (
    coordinates.some((coordinate) => !Number.isSafeInteger(coordinate) || coordinate < 0) ||
    range.s.r !== 0 || range.s.c !== 0 || range.e.r < range.s.r || range.e.c < range.s.c
  ) {
    throw new DomainInputError([{ path: name, message: 'Worksheet range is invalid' }]);
  }
  if (range.e.r + 1 > maxRows || range.e.c + 1 > maxColumns) {
    throw new DomainInputError([{ path: name, message: 'Worksheet dimensions exceed supported limits' }]);
  }
}

function rejectWorksheetFormulas(sheet: XLSX.WorkSheet): void {
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!') || !cell || typeof cell !== 'object') continue;
    if ('f' in cell && cell.f !== undefined) {
      throw new DomainInputError([{ path: address, message: 'Spreadsheet formulas are not imported' }]);
    }
  }
}

function rejectFormulaRow(row: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value === 'object') {
      throw new DomainInputError([{ path: key, message: 'Spreadsheet formulas are not imported' }]);
    }
  }
}

function settingsFromMeta(meta: { key: string; value: unknown }[]): AppSettings | undefined {
  const map = new Map(meta.map((row) => [row.key, row.value]));
  if (!map.has('defaultCurrency')) return undefined;
  const parsed = settingsSchema.safeParse({
    defaultCurrency: map.get('defaultCurrency'),
    timezone: map.get('timezone') ?? DEFAULT_SETTINGS.timezone,
    reminders: {
      enabled: String(map.get('reminderEnabled')) === 'true',
      target: map.get('reminderTarget') ?? 'default',
      offsets: String(map.get('reminderOffsets') ?? '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number),
    },
  });
  if (!parsed.success) throw new DomainInputError([{ path: 'settings', message: 'Settings sheet is invalid' }]);
  assertTimeZone(parsed.data.timezone);
  return parsed.data;
}

export function contentHash(value: unknown): string {
  return stableStringify(value);
}

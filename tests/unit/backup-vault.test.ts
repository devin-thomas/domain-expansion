import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseImport, serializeBackup, zipDeclaredUncompressedSize } from '../../shared/backup';
import { buildRecordFromCreate, DEFAULT_SETTINGS, type DomainRecord } from '../../shared/domain';
import { credentialAad, open, seal } from '../../server/crypto';
import { reencryptCredentials } from '../../server/credentials';
import { loadConfig } from '../../server/config';
import { MemoryStore } from '../../server/store';

const record = buildRecordFromCreate(
  {
    name: 'round.example',
    registrar: 'Porkbun',
    dnsProvider: 'Cloudflare',
    ownership: 'owned',
    lifecycle: 'active',
    renewalIntent: 'renew',
    autoRenew: false,
    registrationDate: '2020-02-29',
    billingDate: null,
    expirationDate: '2027-03-04',
    registrationCostMinor: 0,
    renewalCostMinor: 1299,
    currency: 'USD',
    notes: '=cmd',
    isArchived: false,
    reminders: { enabled: true, target: 'billing', offsets: [30, 1] },
  },
  DEFAULT_SETTINGS,
  'dom_round',
  '2026-03-01T00:00:00.000Z',
);

describe('portability and vault', () => {
  it('round-trips a rich record through JSON, YAML, and XLSX without executing SQL', () => {
    for (const format of ['json', 'yaml', 'xlsx'] as const) {
      const file = serializeBackup([record], format, DEFAULT_SETTINGS);
      const parsed = parseImport(format, format === 'xlsx' ? file.body : String(file.body));
      expect(parsed.fullFidelity).toBe(true);
      expect(parsed.domains[0]).toMatchObject({
        name: 'round.example',
        autoRenew: false,
        registrationCostMinor: 0,
        renewalCostMinor: 1299,
        notes: '=cmd',
        billingDate: null,
        reminders: { enabled: true, target: 'billing', offsets: [30, 1] },
      });
    }
    expect(() => parseImport('sql', 'DROP TABLE domains;')).toThrow(/never executed/);
    expect(() => parseImport('json', JSON.stringify({ format: 'domain-expansion-backup', schemaVersion: 1, domains: [] }))).toThrow(/schema/);
  });

  it('neutralizes spreadsheet formulas in CSV exports and rejects actual XLSX formulas', () => {
    const csv = serializeBackup([record], 'csv');
    expect(String(csv.body)).toContain("'=cmd");

    const original = serializeBackup([record], 'xlsx', DEFAULT_SETTINGS);
    const workbook = XLSX.read(original.body, { type: 'array', cellFormula: true });
    workbook.Sheets.Domains.P2 = { t: 'n', f: '1+1', v: 2 };
    const crafted = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const reloaded = XLSX.read(crafted, { type: 'array', cellFormula: true });
    expect(reloaded.Sheets.Domains.P2.f).toBe('1+1');

    expect(() => parseImport('xlsx', new Uint8Array(crafted))).toThrow(/formulas are not imported/i);
  });

  it('rejects sparse XLSX ranges beyond supported worksheet dimensions', () => {
    const original = serializeBackup([record], 'xlsx', DEFAULT_SETTINGS);
    const workbook = XLSX.read(original.body, { type: 'array' });
    workbook.Sheets.Domains['!ref'] = 'A1:R102';
    const crafted = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const reloaded = XLSX.read(crafted, { type: 'array' });
    expect(reloaded.Sheets.Domains['!ref']).toBe('A1:R102');

    expect(() => parseImport('xlsx', new Uint8Array(crafted))).toThrow(/dimensions exceed supported limits/i);
  });

  it('rejects spreadsheet expansion bombs', () => {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt32LE(50_000_000, 22);
    expect(zipDeclaredUncompressedSize(header)).toBeGreaterThan(8 * 1024 * 1024);
    expect(() => parseImport('xlsx', header)).toThrow(/safe size/);
  });

  it('fails closed on ciphertext tampering and can rotate keys', async () => {
    const key = randomBytes(32);
    const aad = credentialAad('test', 'demo', 'user-a');
    const sealed = seal('gemini-user-key', key, 'v1', aad);
    expect(open(sealed, key, aad)).toBe('gemini-user-key');
    expect(() => open(sealed, key, credentialAad('test', 'demo', 'user-b'))).toThrow();
    expect(() => open({ ...sealed, tag: Buffer.from('nope').toString('base64') }, key, aad)).toThrow();
    expect(() => open({ ...sealed, tag: Buffer.from(sealed.tag, 'base64').subarray(0, 4).toString('base64') }, key, aad)).toThrow();

    const store = new MemoryStore();
    const config = loadConfig({
      APP_ENV: 'test',
      BYOK_KEYRING: JSON.stringify({ v1: randomBytes(32).toString('base64'), v2: randomBytes(32).toString('base64') }),
      BYOK_KEY_ID: 'v2',
      FIREBASE_PROJECT_ID: 'demo',
    });
    const original = seal('rotate-me', config.byokKeys.v1, 'v1', credentialAad('test', 'demo', 'user-a'));
    await store.transaction(async (tx) => {
      tx.set('users/user-a/privateCredentials/gemini', { ...original, provider: 'gemini', revision: 1, updatedAt: '2026-01-01T00:00:00.000Z', consentVersion: '2026-09-26', consentAt: '2026-01-01T00:00:00.000Z' });
    });
    expect(await reencryptCredentials(store, config, 'v1')).toBe(1);
    const stored = await store.get<typeof original & { keyId: string }>('users/user-a/privateCredentials/gemini');
    expect(stored?.keyId).toBe('v2');
    expect(open(stored!, config.byokKeys.v2, credentialAad('test', 'demo', 'user-a'))).toBe('rotate-me');
    expect(JSON.stringify(stored)).not.toContain('rotate-me');
  });
});

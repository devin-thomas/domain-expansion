import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseImport, publicFieldsOf, serializeBackup } from '../../shared/backup';
import {
  applyPatch,
  buildRecordFromCreate,
  DEFAULT_SETTINGS,
  parseCreateInput,
  parsePatchInput,
  toPublicDomain,
  type DomainRecord,
} from '../../shared/domain';

const now = '2026-09-28T00:00:00.000Z';

function record(overrides: Partial<DomainRecord> = {}): DomainRecord {
  return buildRecordFromCreate(
    {
      name: 'payment.example',
      expirationDate: '2027-09-28',
      purchaseEmail: ' billing@example.com ',
      paymentMethod: 'Card ending 4242, personal account',
      ...overrides,
    },
    DEFAULT_SETTINGS,
    overrides.id ?? 'payment-record',
    now,
  );
}

describe('purchase contact fields', () => {
  it('normalizes optional email and defaults absent values to null', () => {
    expect(record().purchaseEmail).toBe('billing@example.com');
    expect(record({ purchaseEmail: null, paymentMethod: null })).toMatchObject({
      purchaseEmail: null,
      paymentMethod: null,
    });
    expect(
      buildRecordFromCreate({ name: 'empty.example', expirationDate: '2027-09-28', purchaseEmail: '  ' }, DEFAULT_SETTINGS, 'empty', now),
    ).toMatchObject({ purchaseEmail: null, paymentMethod: null });
  });

  it('rejects invalid nonempty emails on create and patch while allowing numeric payment text', () => {
    expect(() => parseCreateInput({ name: 'bad.example', expirationDate: '2027-09-28', purchaseEmail: 'not-an-email' })).toThrow(/email/i);
    expect(() => parsePatchInput({ purchaseEmail: 'missing-domain@' })).toThrow(/email/i);
    expect(parseCreateInput({ name: 'numeric.example', expirationDate: '2027-09-28', paymentMethod: '4111111111111111' }).paymentMethod)
      .toBe('4111111111111111');
    expect(() => parseCreateInput({ name: 'long.example', expirationDate: '2027-09-28', paymentMethod: 'x'.repeat(2001) })).toThrow();
  });

  it('preserves omitted patch fields and supports explicit clearing', () => {
    const original = record();
    const changed = applyPatch(original, parsePatchInput({ paymentMethod: 'Bank transfer 0017' }), now);
    expect(changed.purchaseEmail).toBe(original.purchaseEmail);
    expect(changed.paymentMethod).toBe('Bank transfer 0017');
    const cleared = applyPatch(changed, parsePatchInput({ purchaseEmail: null, paymentMethod: null }), now);
    expect(cleared.purchaseEmail).toBeNull();
    expect(cleared.paymentMethod).toBeNull();
  });

  it('fills nulls when projecting or patching an older v2 record without payment fields', () => {
    const { purchaseEmail: _purchaseEmail, paymentMethod: _paymentMethod, ...oldShape } = record();
    const legacy = oldShape as DomainRecord;

    expect(toPublicDomain(legacy)).toMatchObject({ purchaseEmail: null, paymentMethod: null });
    expect(publicFieldsOf(legacy)).toMatchObject({ purchaseEmail: null, paymentMethod: null });
    expect(applyPatch(legacy, parsePatchInput({ registrar: 'Porkbun' }), now)).toMatchObject({
      purchaseEmail: null,
      paymentMethod: null,
    });
    const restored = parseImport('json', String(serializeBackup([legacy], 'json').body));
    expect(restored.domains[0]).toMatchObject({ purchaseEmail: null, paymentMethod: null });
  });

  it('round-trips both fields through every supported importable export format', () => {
    for (const format of ['json', 'yaml', 'csv', 'xlsx'] as const) {
      const exported = serializeBackup([record()], format, DEFAULT_SETTINGS);
      const parsed = parseImport(format, exported.body);
      expect(parsed.domains[0]).toMatchObject({
        purchaseEmail: 'billing@example.com',
        paymentMethod: 'Card ending 4242, personal account',
      });
    }
  });

  it('preserves a literal leading apostrophe in XLSX without weakening spreadsheet formula escaping', () => {
    const records = [
      record({ name: 'apostrophe.example', paymentMethod: "'Bank transfer" }),
      record({ name: 'formula.example', paymentMethod: '=1+1' }),
    ];
    const csv = String(serializeBackup(records, 'csv').body);
    expect(csv).toContain("''Bank transfer");
    expect(csv).toContain("'=1+1");
    expect(parseImport('csv', csv).domains.map((domain) => domain.paymentMethod)).toEqual(["'Bank transfer", '=1+1']);

    const exported = serializeBackup(records, 'xlsx', DEFAULT_SETTINGS);
    const workbook = XLSX.read(exported.body, { type: 'array', cellFormula: true });
    expect(workbook.Sheets.Domains.N2).toMatchObject({ t: 's', v: "''Bank transfer" });
    expect(workbook.Sheets.Domains.N3).toMatchObject({ t: 's', v: "'=1+1" });
    expect(workbook.Sheets.Domains.N2.f).toBeUndefined();
    expect(workbook.Sheets.Domains.N3.f).toBeUndefined();

    const parsed = parseImport('xlsx', exported.body);
    expect(parsed.fullFidelity).toBe(true);
    expect(parsed.domains.map((domain) => domain.paymentMethod)).toEqual(["'Bank transfer", '=1+1']);
  });

  it('accepts snake_case aliases in tabular imports', () => {
    const parsed = parseImport(
      'csv',
      'name,expirationDate,purchase_email,payment_method\nalias.example,2027-09-28,billing@example.com,4111111111111111\n',
    );
    expect(parsed.domains[0]).toMatchObject({
      purchaseEmail: 'billing@example.com',
      paymentMethod: '4111111111111111',
    });
  });

  it('rejects malformed imported emails across JSON, YAML, CSV, and XLSX', () => {
    const badDomain = { name: 'bad.example', expirationDate: '2027-09-28', purchaseEmail: 'bad-address' };
    const structured = {
      format: 'domain-expansion-backup',
      schemaVersion: 2,
      domains: [badDomain],
    };
    expect(() => parseImport('json', JSON.stringify(structured))).toThrow(/email/i);
    expect(() => parseImport('yaml', `format: domain-expansion-backup\nschemaVersion: 2\ndomains:\n  - name: bad.example\n    expirationDate: '2027-09-28'\n    purchaseEmail: bad-address\n`)).toThrow(/email/i);
    expect(() => parseImport('csv', 'name,expirationDate,purchaseEmail\nbad.example,2027-09-28,bad-address\n')).toThrow(/email/i);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ ...badDomain }]), 'Domains');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), 'Reminders');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { key: 'schemaVersion', value: 2 },
      { key: 'defaultCurrency', value: 'USD' },
      { key: 'timezone', value: 'UTC' },
      { key: 'reminderEnabled', value: true },
      { key: 'reminderTarget', value: 'default' },
      { key: 'reminderOffsets', value: '30 14 7 1' },
    ]), 'Settings');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    expect(() => parseImport('xlsx', new Uint8Array(bytes))).toThrow(/email/i);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addCalendarMonths,
  applyPatch,
  buildRecordFromCreate,
  DEFAULT_SETTINGS,
  DomainInputError,
  effectiveBillingDate,
  localDateInTimeZone,
  nextPayment,
  normalizeDomainName,
  parseCreateInput,
  parseMoneyInput,
  parsePatchInput,
  qualifiesForExpectedSpending,
  summarizeSpending,
  urgencyFor,
  type DomainRecord,
} from '../../shared/domain';

const now = '2026-03-01T00:00:00.000Z';

function record(overrides: Partial<DomainRecord> = {}): DomainRecord {
  return buildRecordFromCreate(
    {
      name: 'example.com',
      expirationDate: '2026-06-01',
      renewalCostMinor: 1200,
      currency: 'USD',
      ...overrides,
    },
    DEFAULT_SETTINGS,
    overrides.id ?? 'dom_1',
    now,
  );
}

describe('domain contract', () => {
  it('normalizes hosts without stripping subdomains or calling DNS', () => {
    expect(normalizeDomainName(' https://www.Example.com/path ')).toBe('www.example.com');
    expect(normalizeDomainName('bücher.example')).toMatch(/^xn--/);
    expect(() => normalizeDomainName('https://user:pass@example.com')).toThrow(DomainInputError);
    expect(() => normalizeDomainName('192.168.0.1')).toThrow(DomainInputError);
    expect(() => normalizeDomainName('*.example.com')).toThrow(DomainInputError);
    expect(normalizeDomainName('www.example.com')).toBe('www.example.com');
  });

  it('parses money exactly and rejects extra precision', () => {
    expect(parseMoneyInput('12.99', 'USD')).toBe(1299);
    expect(parseMoneyInput('12.9', 'USD')).toBe(1290);
    expect(parseMoneyInput('', 'USD')).toBeNull();
    expect(parseMoneyInput('0', 'USD')).toBe(0);
    expect(parseMoneyInput('1500', 'JPY')).toBe(1500);
    expect(() => parseMoneyInput('12.999', 'USD')).toThrow(/decimal/);
    expect(() => parseMoneyInput('1500.0', 'JPY')).toThrow(/fractional/);
  });

  it('rejects impossible dates and handles month arithmetic', () => {
    expect(() => buildRecordFromCreate({ name: 'a.com', expirationDate: '2023-02-29' }, DEFAULT_SETTINGS, 'id', now)).toThrow(DomainInputError);
    expect(buildRecordFromCreate({ name: 'a.com', expirationDate: '2024-02-29' }, DEFAULT_SETTINGS, 'id', now).expirationDate).toBe('2024-02-29');
    expect(addCalendarMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addCalendarMonths('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('requires at least one effective date and resolves local dates across UTC and DST boundaries', () => {
    expect(() => buildRecordFromCreate({ name: 'date-missing.example', billingDate: null, expirationDate: null }, DEFAULT_SETTINGS, 'missing', now)).toThrow(DomainInputError);

    expect(localDateInTimeZone('America/Chicago', new Date('2026-01-01T05:30:00.000Z'))).toBe('2025-12-31');
    expect(localDateInTimeZone('America/Chicago', new Date('2026-01-01T06:30:00.000Z'))).toBe('2026-01-01');
    expect(localDateInTimeZone('America/Chicago', new Date('2026-03-08T07:59:00.000Z'))).toBe('2026-03-08');
    expect(localDateInTimeZone('America/Chicago', new Date('2026-03-08T08:01:00.000Z'))).toBe('2026-03-08');
    expect(localDateInTimeZone('America/Chicago', new Date('2026-03-09T04:30:00.000Z'))).toBe('2026-03-08');
    expect(localDateInTimeZone('America/Chicago', new Date('2026-03-09T05:30:00.000Z'))).toBe('2026-03-09');
  });

  it('maps quick add onto expiration and derives billing', () => {
    const created = buildRecordFromCreate({ name: 'foo.dev', expirationDate: '2027-03-04', renewalIntent: 'renew' }, DEFAULT_SETTINGS, 'id', now);
    expect(created.billingDate).toBeNull();
    expect(created.autoRenew).toBeNull();
    expect(effectiveBillingDate(created)).toBe('2027-03-04');
  });

  it('rejects server-owned fields and distinguishes patch nulls', () => {
    expect(() => parseCreateInput({ name: 'a.com', expirationDate: '2027-01-01', id: 'nope' })).toThrow(/server/);
    const current = record();
    const cleared = applyPatch(current, parsePatchInput({ registrar: null }), now);
    expect(cleared.registrar).toBeNull();
    expect(cleared.notes).toBe(current.notes);
    const zero = applyPatch(current, parsePatchInput({ renewalCostMinor: 0, autoRenew: false }), now);
    expect(zero.renewalCostMinor).toBe(0);
    expect(zero.autoRenew).toBe(false);
    expect(() => applyPatch(record({ renewalCostMinor: 100 }), parsePatchInput({ currency: 'EUR' }), now)).toThrow(/currency/);
    const changed = applyPatch(record({ renewalCostMinor: 100 }), parsePatchInput({ currency: 'EUR', clearCostsOnCurrencyChange: true, renewalCostMinor: 50 }), now);
    expect(changed.currency).toBe('EUR');
    expect(changed.renewalCostMinor).toBe(50);
    expect(changed.registrationCostMinor).toBeNull();
  });

  it('keeps lifecycle, intention, archive, and currency totals independent', () => {
    const rows = [
      record({ id: 'a', name: 'a.com', renewalCostMinor: 1000, currency: 'USD' }),
      record({ id: 'b', name: 'b.com', renewalCostMinor: 500, currency: 'JPY', expirationDate: '2026-04-01' }),
      record({ id: 'c', name: 'c.com', renewalCostMinor: null, expirationDate: '2026-05-01' }),
      record({ id: 'd', name: 'd.com', renewalIntent: 'let_expire', expirationDate: '2026-04-02' }),
      record({ id: 'e', name: 'e.com', isArchived: true, expirationDate: '2026-04-03' }),
      record({ id: 'f', name: 'f.com', lifecycle: 'inactive', expirationDate: '2026-04-04' }),
      record({ id: 'g', name: 'g.com', expirationDate: '2026-01-01' }),
    ];
    const summary = summarizeSpending(rows, '2026-03-01');
    expect(summary.byCurrency).toEqual([
      { currency: 'JPY', minor: 500, count: 1 },
      { currency: 'USD', minor: 1000, count: 1 },
    ]);
    expect(summary.unknownCostCount).toBe(1);
    expect(nextPayment(rows, '2026-03-01')?.normalizedName).toBe('b.com');
    expect(qualifiesForExpectedSpending(rows[6], '2026-03-01')).toBe(false);
    const archived = applyPatch(rows[0], parsePatchInput({ isArchived: true }), now);
    expect(archived.lifecycle).toBe('active');
    expect(urgencyFor(rows[6], '2026-03-01')).toBe('overdue');
  });

  it('evaluates every lifecycle and renewal-intention combination independently', () => {
    const lifecycles = ['active', 'inactive', 'transferred'] as const;
    const intentions = ['renew', 'let_expire'] as const;
    const combinations = lifecycles.flatMap((lifecycle) => intentions.map((renewalIntent) => ({ lifecycle, renewalIntent })));
    const rows = combinations.map(({ lifecycle, renewalIntent }, index) => record({
      id: `combination-${index}`,
      name: `combination-${index}.example`,
      lifecycle,
      renewalIntent,
      expirationDate: '2026-04-01',
    }));

    expect(rows.map(({ lifecycle, renewalIntent }) => [lifecycle, renewalIntent])).toEqual(combinations.map(({ lifecycle, renewalIntent }) => [lifecycle, renewalIntent]));
    expect(rows.map((row) => qualifiesForExpectedSpending(row, '2026-03-01'))).toEqual([true, false, false, false, false, false]);
    expect(qualifiesForExpectedSpending(record({ isArchived: true }), '2026-03-01')).toBe(false);
  });

  it('preserves hidden advanced fields through a quick patch', () => {
    const full = buildRecordFromCreate(
      {
        name: 'full.example',
        registrar: 'Porkbun',
        dnsProvider: 'Cloudflare',
        ownership: 'managed',
        lifecycle: 'inactive',
        renewalIntent: 'let_expire',
        autoRenew: false,
        registrationDate: '2020-01-02',
        billingDate: '2026-08-01',
        expirationDate: '2026-08-15',
        registrationCostMinor: 0,
        renewalCostMinor: 2500,
        currency: 'GBP',
        notes: 'keep me',
        isArchived: false,
        reminders: { enabled: false, target: 'expiration', offsets: [] },
      },
      DEFAULT_SETTINGS,
      'full',
      now,
    );
    const patched = applyPatch(full, parsePatchInput({ registrar: 'Namecheap' }), now);
    expect(patched.dnsProvider).toBe('Cloudflare');
    expect(patched.billingDate).toBe('2026-08-01');
    expect(patched.registrationCostMinor).toBe(0);
    expect(patched.autoRenew).toBe(false);
    expect(patched.notes).toBe('keep me');
    expect(patched.reminders.offsets).toEqual([]);
    expect(patched.revision).toBe(2);
  });
});

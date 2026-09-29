import { describe, expect, it } from 'vitest';
import { call, session, startHarness } from '../helpers';

describe('required data and ownership fixtures', () => {
  it('binds pagination cursors to the caller, filters, and ordering', async () => {
    const harness = await startHarness();
    try {
      const alpha = await session(harness.base, { uid: 'cursor-alpha', email: 'alpha@example.com' });
      const beta = await session(harness.base, { uid: 'cursor-beta', email: 'beta@example.com' });
      const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
      for (const name of ['a.example', 'b.example']) {
        expect((await call(harness.base, alpha, 'POST', '/api/v1/domains', {
          headers: { 'idempotency-key': name }, body: { name, expirationDate: '2027-04-01' },
        })).status).toBe(201);
      }
      const first = await call(harness.base, alpha, 'GET', '/api/v1/domains?limit=1&sort=name');
      expect(first.status).toBe(200);
      expect(first.body.records.map((record: { name: string }) => record.name)).toEqual(['a.example']);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const cursor = encodeURIComponent(first.body.nextCursor);
      const continuation = `/api/v1/domains?limit=1&sort=name&cursor=${cursor}`;
      const next = await call(harness.base, alpha, 'GET', continuation);
      expect(next.status).toBe(200);
      expect(next.body.records.map((record: { name: string }) => record.name)).toEqual(['b.example']);
      expect(next.body.nextCursor).toBeNull();
      for (const caller of [beta, admin]) {
        const foreign = await call(harness.base, caller, 'GET', continuation);
        expect(foreign.status).toBe(400);
        expect(foreign.body.error.code).toBe('invalid_cursor');
        expect(foreign.body).not.toHaveProperty('records');
      }
      for (const query of [
        `limit=1&sort=effectiveDate&cursor=${cursor}`,
        `limit=1&sort=name&q=a&cursor=${cursor}`,
        `limit=1&sort=name&direction=desc&cursor=${cursor}`,
      ]) {
        const changed = await call(harness.base, alpha, 'GET', `/api/v1/domains?${query}`);
        expect(changed.status).toBe(400);
        expect(changed.body.error.code).toBe('invalid_cursor');
      }
    } finally {
      await harness.close();
    }
  });

  it('exports only the caller portfolio, including for an application admin', async () => {
    const harness = await startHarness();
    try {
      const alpha = await session(harness.base, { uid: 'export-alpha', email: 'alpha@example.com' });
      const beta = await session(harness.base, { uid: 'export-beta', email: 'beta@example.com' });
      const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
      for (const [caller, name, purchaseEmail] of [
        [alpha, 'alpha-private.example', 'alpha-purchase@example.com'],
        [beta, 'beta-private.example', 'beta-purchase@example.com'],
      ]) {
        expect((await call(harness.base, caller, 'POST', '/api/v1/domains', {
          headers: { 'idempotency-key': name }, body: { name, expirationDate: '2027-04-01', purchaseEmail },
        })).status).toBe(201);
      }
      for (const [caller, names] of [
        [alpha, ['alpha-private.example']], [beta, ['beta-private.example']], [admin, []],
      ] as const) {
        const exported = await call(harness.base, caller, 'GET', '/api/v1/export?format=json');
        expect(exported.status).toBe(200);
        const document = JSON.parse(exported.body.content);
        expect(document.domains.map((record: { name: string }) => record.name)).toEqual(names);
        const excludedEmail = caller === alpha ? 'beta-purchase@example.com' : 'alpha-purchase@example.com';
        expect(exported.body.content).not.toContain(excludedEmail);
      }
    } finally {
      await harness.close();
    }
  });

  it('rejects missing effective dates on create and patch without losing the saved date', async () => {
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'missing-date', email: 'date@example.com' });
      const invalid = await call(harness.base, member, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'missing-dates' }, body: { name: 'missing.example', billingDate: null, expirationDate: null },
      });
      expect(invalid.status).toBe(422);
      expect((await call(harness.base, member, 'GET', '/api/v1/domains')).body.records).toEqual([]);
      const created = await call(harness.base, member, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'valid-date' }, body: { name: 'dated.example', billingDate: '2027-04-01', expirationDate: null },
      });
      expect(created.status).toBe(201);
      const cleared = await call(harness.base, member, 'PATCH', `/api/v1/domains/${created.body.id}`, {
        headers: { 'if-match': '"1"' }, body: { billingDate: null, expirationDate: null },
      });
      expect(cleared.status).toBe(422);
      const saved = await call(harness.base, member, 'GET', `/api/v1/domains/${created.body.id}`);
      expect(saved.body).toMatchObject({ billingDate: '2027-04-01', expirationDate: null, revision: 1 });
    } finally {
      await harness.close();
    }
  });

  it('persists explicit false, zero, empty offsets, and distinct dates after import commit', async () => {
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'import-false-zero', email: 'import@example.com' });
      const record = {
        name: 'zero-false.example', billingDate: '2027-04-01', expirationDate: '2027-04-15',
        renewalCostMinor: 0, registrationCostMinor: 0, currency: 'JPY', autoRenew: false,
        isArchived: true, reminders: { enabled: false, target: 'expiration', offsets: [] },
        purchaseEmail: 'purchase@example.com', paymentMethod: 'Synthetic plain text payment description',
      };
      const preview = await call(harness.base, member, 'POST', '/api/v1/import/preview', {
        body: { format: 'json', policy: 'skip', content: JSON.stringify({ format: 'domain-expansion-backup', schemaVersion: 2, domains: [record] }) },
      });
      expect(preview.status).toBe(200);
      expect((await call(harness.base, member, 'GET', '/api/v1/domains?archived=all')).body.records).toEqual([]);
      const committed = await call(harness.base, member, 'POST', '/api/v1/import/commit', {
        headers: { 'idempotency-key': 'false-zero-import' }, body: { previewId: preview.body.previewId, contentHash: preview.body.contentHash },
      });
      expect(committed.status).toBe(200);
      const listed = await call(harness.base, member, 'GET', '/api/v1/domains?archived=all');
      expect(listed.body.records).toHaveLength(1);
      expect(listed.body.records[0]).toMatchObject(record);
      expect((await call(harness.base, member, 'GET', '/api/v1/domains')).body.records).toEqual([]);
      const exported = await call(harness.base, member, 'GET', '/api/v1/export?format=json');
      expect(JSON.parse(exported.body.content).domains).toEqual([expect.objectContaining(record)]);
    } finally {
      await harness.close();
    }
  });
});

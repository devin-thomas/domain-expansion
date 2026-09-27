import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/config';
import { call, session, startHarness } from '../helpers';

describe('production boundaries and connected integrations', () => {
  it('refuses test authentication and transient storage on a deployed process', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', APP_ENV: 'development', DOMAIN_EXPANSION_TEST_AUTH: '1', DATA_STORE: 'firestore' })).toThrow(/TEST_AUTH/);
    expect(() => loadConfig({ NODE_ENV: 'production', APP_ENV: 'development', DATA_STORE: 'memory' })).toThrow(/DATA_STORE=firestore/);
    expect(() => loadConfig({ VERCEL_ENV: 'preview', DATA_STORE: 'memory' })).toThrow(/DATA_STORE=firestore/);
  });

  it('keeps Calendar metadata when Tasks is added and validates integration values', async () => {
    const harness = await startHarness();
    try {
      const token = await session(harness.base, { uid: 'member', email: 'member@example.com' });
      const created = await call(harness.base, token, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'integration-create' },
        body: { name: 'connected.example', expirationDate: '2027-01-01' },
      });
      const path = `/api/v1/domains/${created.body.id}/integrations`;
      const calendar = await call(harness.base, token, 'POST', path, {
        headers: { 'if-match': '"1"' },
        body: { calendarEventId: 'event-1', calendarReconcileKey: 'calendar-1' },
      });
      expect(calendar.status).toBe(200);
      const task = await call(harness.base, token, 'POST', path, {
        headers: { 'if-match': '"2"' },
        body: { tasksTaskId: 'task-1', tasksReconcileKey: 'task-key-1' },
      });
      expect(task.status).toBe(200);
      expect(task.body.integration).toMatchObject({ calendarEventId: 'event-1', calendarReconcileKey: 'calendar-1', tasksTaskId: 'task-1', tasksReconcileKey: 'task-key-1' });
      const invalid = await call(harness.base, token, 'POST', path, {
        headers: { 'if-match': '"3"' },
        body: { calendarEventId: { unexpected: true } },
      });
      expect(invalid.status).toBe(422);
    } finally {
      await harness.close();
    }
  });

  it('shares the authenticated read limit across requests', async () => {
    const harness = await startHarness();
    try {
      const token = await session(harness.base, { uid: 'limited', email: 'limited@example.com' });
      for (let index = 0; index < 120; index += 1) {
        expect((await call(harness.base, token, 'GET', '/api/session')).status).toBe(200);
      }
      const blocked = await call(harness.base, token, 'GET', '/api/session');
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBe('60');
    } finally {
      await harness.close();
    }
  });

  it('previews exact import field changes before committing', async () => {
    const harness = await startHarness();
    try {
      const token = await session(harness.base, { uid: 'importer', email: 'importer@example.com' });
      await call(harness.base, token, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'import-original' },
        body: { name: 'change.example', expirationDate: '2027-01-01', renewalCostMinor: 1200, currency: 'USD' },
      });
      const content = JSON.stringify({ format: 'domain-expansion-backup', schemaVersion: 2, domains: [{ name: 'change.example', expirationDate: '2027-02-01', renewalCostMinor: 1500, currency: 'USD' }] });
      const preview = await call(harness.base, token, 'POST', '/api/v1/import/preview', { body: { format: 'json', content, policy: 'merge' } });
      expect(preview.status).toBe(200);
      expect(preview.body.rows[0].changes).toContainEqual({ field: 'expirationDate', before: '2027-01-01', after: '2027-02-01' });
      expect(preview.body.rows[0].changes).toContainEqual({ field: 'renewalCostMinor', before: 1200, after: 1500 });
      expect(preview.body.rows[0].changes).not.toEqual(expect.arrayContaining([{ field: 'currency', before: 'USD', after: 'USD' }]));
      const skipped = await call(harness.base, token, 'POST', '/api/v1/import/preview', { body: { format: 'json', content, policy: 'skip' } });
      expect(skipped.body.rows[0].changes).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});

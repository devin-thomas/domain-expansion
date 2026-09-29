import { describe, expect, it, vi } from 'vitest';
import { submitAccessRequest } from '../../server/admission';
import type { RetryRun } from '../../server/retry-audit';
import { call, startHarness } from '../helpers';

const path = '/api/internal/notifications/retry';
const providerHeaders = { 'user-agent': 'vercel-cron/1.0', 'x-vercel-cron-schedule': '0 12 * * *' };

describe('bounded retry run evidence', () => {
  it('bounds the combined two-queue scan and reaches overflow entries on later runs', async () => {
    const harness = await startHarness();
    try {
      await harness.deps.store.transaction(async (tx) => {
        for (let index = 0; index < 70; index += 1) {
          const id = `queued-${String(index).padStart(2, '0')}`;
          tx.set(`notifications/${id}`, { status: 'suppressed' });
          tx.set(`signInMail/${id}`, { status: 'suppressed' });
        }
      });
      for (const [scanned, lastId] of [[64, 'queued-31'], [64, 'queued-63'], [12, null]] as const) {
        const response = await call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ scanned, retried: 0 });
        expect(await harness.deps.store.get('mailRetryRuns/vercel')).toMatchObject({ scanned, retried: 0, status: 'succeeded' });
        expect(await harness.deps.store.get('mailQueueCursors/notifications')).toMatchObject({ afterPath: lastId ? `notifications/${lastId}` : null });
        expect(await harness.deps.store.get('mailQueueCursors/sign-ins')).toMatchObject({ afterPath: lastId ? `signInMail/${lastId}` : null });
      }
    } finally { await harness.close(); }
  });

  it('does not create evidence for an unauthenticated forged provider request', async () => {
    const harness = await startHarness();
    try {
      expect((await call(harness.base, undefined, 'GET', path, { headers: providerHeaders })).status).toBe(401);
      expect(await harness.deps.store.list('mailRetryRuns/')).toEqual([]);
    } finally { await harness.close(); }
  });

  it('records authenticated provider delivery counters and keeps operator runs separate', async () => {
    const harness = await startHarness();
    try {
      await submitAccessRequest(harness.deps.store, harness.config, harness.mail, { email: 'queued@example.com' }, 'test-ip', harness.deps.now());
      const response = await call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ retried: 1, scanned: 1 });
      const run = await harness.deps.store.get<RetryRun>('mailRetryRuns/vercel');
      expect(run).toMatchObject({ requestId: response.headers.get('x-request-id'), source: 'vercel', schedule: '0 12 * * *', status: 'succeeded', retried: 1, scanned: 1, startedAt: '2026-03-01T15:00:00.000Z', completedAt: '2026-03-01T15:00:00.000Z' });
      expect(run?.durationMs).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(run)).not.toMatch(/retry-secret|queued@example.com/);

      await call(harness.base, 'retry-secret', 'POST', path, { headers: providerHeaders });
      expect(await harness.deps.store.get('mailRetryRuns/vercel')).toEqual(run);
      expect(await harness.deps.store.get('mailRetryRuns/operator')).toMatchObject({ source: 'operator', schedule: null, status: 'succeeded' });
    } finally { await harness.close(); }
  });

  it('records failure without persisting provider error details or claiming success', async () => {
    const harness = await startHarness();
    const failure = vi.spyOn(harness.deps.store, 'list').mockRejectedValueOnce(new Error('private-provider-token-and-email@example.com'));
    try {
      const response = await call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
      expect(response.status).toBe(500);
      const run = await harness.deps.store.get<RetryRun>('mailRetryRuns/vercel');
      expect(run).toMatchObject({ status: 'failed', errorCode: 'retry_failed', requestId: response.headers.get('x-request-id') });
      expect(run).not.toHaveProperty('scanned');
      expect(JSON.stringify(run)).not.toMatch(/private-provider|email@example.com|retry-secret/);
    } finally { failure.mockRestore(); await harness.close(); }
  });

  it('treats missing or incorrect schedule headers as operator runs', async () => {
    const harness = await startHarness();
    try {
      await call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
      const provider = await harness.deps.store.get('mailRetryRuns/vercel');
      for (const headers of [{ 'user-agent': 'vercel-cron/1.0' }, { ...providerHeaders, 'x-vercel-cron-schedule': '* * * * *' }]) {
        expect((await call(harness.base, 'retry-secret', 'GET', path, { headers })).status).toBe(200);
        expect(await harness.deps.store.get('mailRetryRuns/operator')).toMatchObject({ source: 'operator', schedule: null });
        expect(await harness.deps.store.get('mailRetryRuns/vercel')).toEqual(provider);
      }
    } finally { await harness.close(); }
  });

  it('preserves a newer run when an earlier start transaction is delayed', async () => {
    const harness = await startHarness();
    const transaction = harness.deps.store.transaction.bind(harness.deps.store);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    const delayed = vi.spyOn(harness.deps.store, 'transaction').mockImplementationOnce(async (fn) => {
      started();
      await gate;
      return transaction(fn);
    });
    const older = call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
    try {
      await waiting;
      harness.deps.now = () => new Date('2026-03-01T15:00:01Z');
      const newer = await call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
      release();
      expect((await older).status).toBe(200);
      expect(await harness.deps.store.get('mailRetryRuns/vercel')).toMatchObject({ requestId: newer.headers.get('x-request-id'), startedAt: '2026-03-01T15:00:01.000Z', status: 'succeeded' });
    } finally { release(); await older; delayed.mockRestore(); await harness.close(); }
  });

  it('does not let an older worker overwrite the latest provider run', async () => {
    const harness = await startHarness();
    const original = harness.deps.store.list.bind(harness.deps.store);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    const list = vi.spyOn(harness.deps.store, 'list').mockImplementationOnce(async (...args) => {
      started();
      await gate;
      return original(...args);
    });
    const older = call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
    try {
      await waiting;
      const newer = await call(harness.base, 'retry-secret', 'GET', path, { headers: providerHeaders });
      release();
      expect((await older).status).toBe(200);
      expect(await harness.deps.store.get('mailRetryRuns/vercel')).toMatchObject({ requestId: newer.headers.get('x-request-id'), status: 'succeeded' });
      expect(await harness.deps.store.list('mailRetryRuns/')).toHaveLength(1);
    } finally { release(); await older; list.mockRestore(); await harness.close(); }
  });
});

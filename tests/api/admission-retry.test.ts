import { describe, expect, it } from 'vitest';
import { createGeminiPort, resolveFirebaseUser } from '../../server/adapters';
import { retryDueNotifications, submitAccessRequest } from '../../server/admission';
import { bootstrapOwner } from '../../server/auth';
import { sha256Hex } from '../../server/crypto';
import { call, session, startHarness } from '../helpers';

describe('durable public mail work', () => {
  it('sends the configured owner a link after first bootstrap and repeated initialization', async () => {
    const harness = await startHarness();
    try {
      await bootstrapOwner(harness.deps.store, harness.config, '2026-03-01T15:00:00Z');
      await harness.deps.store.transaction(async (tx) => {
        tx.delete(`memberEmails/${sha256Hex('owner@example.com')}`);
      });
      await bootstrapOwner(harness.deps.store, harness.config, '2026-03-01T15:00:00Z');
      const requested = await call(harness.base, undefined, 'POST', '/api/auth/email-link', { body: { email: 'owner@example.com' } });
      expect(requested.status).toBe(202);
      const drained = await call(harness.base, 'retry-secret', 'POST', '/api/internal/notifications/retry', { body: {} });
      expect(drained.status).toBe(200);
      expect(harness.mail.signIns).toEqual(['owner@example.com']);
    } finally {
      await harness.close();
    }
  });

  it('returns the same access response before delivery and drains its durable outbox later', async () => {
    const harness = await startHarness();
    try {
      const first = await call(harness.base, undefined, 'POST', '/api/access/request', {
        body: { email: 'pending@example.com', reason: 'Please approve access' },
      });
      const duplicate = await call(harness.base, undefined, 'POST', '/api/access/request', {
        body: { email: 'pending@example.com', reason: 'Repeat request' },
      });

      expect(first.status).toBe(202);
      expect(first.body).toEqual(duplicate.body);

      const drained = await call(harness.base, 'retry-secret', 'POST', '/api/internal/notifications/retry', { body: {} });
      expect(drained.status).toBe(200);
      expect(harness.mail.alerts).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('queues every valid sign-in email and only sends after the worker verifies approved membership', async () => {
    const harness = await startHarness();
    try {
      await call(harness.base, undefined, 'POST', '/api/access/request', { body: { email: 'approved@example.com' } });
      const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
      const requests = await call(harness.base, admin, 'GET', '/api/admin/requests');
      await call(harness.base, admin, 'POST', `/api/admin/requests/${requests.body.requests[0].id}/approve`, { body: {} });
      harness.mail.signIns.length = 0;

      const approved = await call(harness.base, undefined, 'POST', '/api/auth/email-link', { body: { email: 'approved@example.com' } });
      const unknown = await call(harness.base, undefined, 'POST', '/api/auth/email-link', { body: { email: 'unknown@example.com' } });
      expect(approved.status).toBe(202);
      expect(approved.body).toEqual(unknown.body);

      const drained = await call(harness.base, 'retry-secret', 'POST', '/api/internal/notifications/retry', { body: {} });
      expect(drained.status).toBe(200);
      expect(harness.mail.signIns).toEqual(['approved@example.com']);
    } finally {
      await harness.close();
    }
  });

  it('sends one approval email under repeated and concurrent approval requests', async () => {
    const harness = await startHarness();
    try {
      await call(harness.base, undefined, 'POST', '/api/access/request', { body: { email: 'once@example.com' } });
      const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
      const requests = await call(harness.base, admin, 'GET', '/api/admin/requests');
      const path = `/api/admin/requests/${requests.body.requests[0].id}/approve`;

      const results = await Promise.all([
        call(harness.base, admin, 'POST', path, { body: {} }),
        call(harness.base, admin, 'POST', path, { body: {} }),
      ]);
      expect(results.map((result) => result.status)).toEqual([200, 200]);
      expect(harness.mail.signIns).toEqual(['once@example.com']);

      await call(harness.base, admin, 'POST', path, { body: {} });
      expect(harness.mail.signIns).toEqual(['once@example.com']);
    } finally {
      await harness.close();
    }
  });

  it('skips leased outbox entries and drains later entries with a bounded per-worker claim count', async () => {
    const harness = await startHarness();
    try {
      const now = new Date('2026-03-01T15:00:00Z');
      for (let index = 0; index < 18; index += 1) {
        await submitAccessRequest(
          harness.deps.store,
          harness.config,
          harness.mail,
          { email: `queued-${index}@example.com`, reason: 'Please approve access' },
          `test-ip-${index}`,
          now,
        );
      }

      let release!: () => void;
      let markStarted!: () => void;
      const allStarted = new Promise<void>((resolve) => { markStarted = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let started = 0;
      harness.mail.sendAdminAlert = async (input) => {
        started += 1;
        if (started === 10) markStarted();
        await gate;
        harness.mail.alerts.push(input);
        return { ok: true, retryable: false, id: `email_${started}` };
      };

      const drains = Array.from({ length: 10 }, () => retryDueNotifications(harness.deps.store, harness.config, harness.mail, now));
      await Promise.race([
        allStarted,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Concurrent workers did not claim distinct jobs')), 3000)),
      ]);
      release();
      const results = await Promise.all(drains);

      expect(results.every((result) => (result.body as { retried: number }).retried <= 8)).toBe(true);
      expect(harness.mail.alerts).toHaveLength(18);
    } finally {
      await harness.close();
    }
  });
});

describe('bounded AI retry behavior', () => {
  it('parses HTTP-date Retry-After headers from Gemini', async () => {
    const original = global.fetch;
    const retryAt = new Date(Date.now() + 5_000).toUTCString();
    global.fetch = (async () => new Response('', { status: 429, headers: { 'retry-after': retryAt } })) as typeof fetch;
    try {
      const result = await createGeminiPort().generate({
        model: 'gemini-3.5-flash-lite',
        apiKey: 'test-gemini-key',
        system: 'Return JSON.',
        user: 'example.com',
        timeoutMs: 1_000,
      });
      expect(result).toMatchObject({ ok: false, kind: 'throttle', status: 429 });
      expect('retryAfterMs' in result && result.retryAfterMs).toBeGreaterThan(0);
    } finally {
      global.fetch = original;
    }
  });

  it('waits for a provider Retry-After value that fits the total deadline', async () => {
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'ai-user', email: 'ai@example.com' });
      await call(harness.base, member, 'PUT', '/api/credentials/gemini', {
        body: { apiKey: 'user-owned-gemini-key', consent: true, consentVersion: '2026-09-26' },
      });
      harness.setAi(async (request) => request.model.endsWith('lite')
        ? { ok: false, kind: 'throttle', status: 429, retryAfterMs: 120 }
        : { ok: true, text: JSON.stringify({ drafts: [] }), truncated: false });

      const started = Date.now();
      const result = await call(harness.base, member, 'POST', '/api/ai/extract', { body: { text: 'sample domain notes' } });
      expect(Date.now() - started).toBeGreaterThanOrEqual(100);
      expect(result.status).toBe(200);
      expect(harness.aiCalls.map((request) => request.model)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
    } finally {
      await harness.close();
    }
  });

  it('returns a retryable throttle without calling fallback when Retry-After does not fit', async () => {
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'ai-user', email: 'ai@example.com' });
      await call(harness.base, member, 'PUT', '/api/credentials/gemini', {
        body: { apiKey: 'user-owned-gemini-key', consent: true, consentVersion: '2026-09-26' },
      });
      harness.setAi(async () => ({ ok: false, kind: 'throttle', status: 429, retryAfterMs: 44_500 }));

      const result = await call(harness.base, member, 'POST', '/api/ai/extract', { body: { text: 'sample domain notes' } });
      expect(result.status).toBe(429);
      expect(result.body.error.retryable).toBe(true);
      expect(harness.aiCalls).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });
});

describe('Firebase identity lookup', () => {
  it('creates only when Firebase explicitly reports that the email is missing', async () => {
    const createUser = async () => ({ uid: 'created' });
    const userNotFound = Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
    await expect(resolveFirebaseUser({ getUserByEmail: async () => { throw userNotFound; }, createUser }, 'new@example.com'))
      .resolves.toEqual({ uid: 'created', emailVerified: false });

    const serviceFailure = Object.assign(new Error('service unavailable'), { code: 'auth/internal-error' });
    const create = async () => ({ uid: 'unexpected' });
    await expect(resolveFirebaseUser({ getUserByEmail: async () => { throw serviceFailure; }, createUser: create }, 'existing@example.com'))
      .rejects.toBe(serviceFailure);
  });
});

import { describe, expect, it } from 'vitest';
import { signTestToken, tokenPath, type TokenDoc } from '../../server/auth';
import { createLiveMail } from '../../server/adapters';
import { ROUTE_TABLE } from '../../server/http';
import { openApiDocument } from '../../shared/openapi';
import { call, session, startHarness } from '../helpers';

describe('api authorization and domain behavior', () => {
  it('serves health and keeps API routes out of the documented path list gaps', async () => {
    const harness = await startHarness();
    const health = await call(harness.base, undefined, 'GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.body.service).toBe('domain-expansion');
    expect(JSON.stringify(health.body)).not.toMatch(/key|secret|token/i);
    const documented = Object.keys(openApiDocument().paths);
    for (const path of documented) {
      const normalized = path.replaceAll('{id}', ':id').replaceAll('{uid}', ':uid');
      expect(ROUTE_TABLE.some((route) => route.includes(normalized) || route.includes(path))).toBe(true);
    }
    await harness.close();
  });

  it('rejects anonymous, unverified, unapproved, wrong-project, and suspended callers', async () => {
    const harness = await startHarness();
    const missing = await call(harness.base, undefined, 'GET', '/api/v1/domains');
    expect(missing.status).toBe(401);
    const stranger = signTestToken(harness.config, { uid: 'stranger', email: 's@example.com', emailVerified: true, authTime: 1_700_000_000, projectId: harness.config.projectId });
    expect((await call(harness.base, stranger, 'GET', '/api/v1/domains')).status).toBe(403);
    const unverified = await session(harness.base, { uid: 'unverified', email: 'u@example.com', emailVerified: false });
    expect((await call(harness.base, unverified, 'GET', '/api/v1/domains')).status).toBe(403);
    const wrongProject = signTestToken(harness.config, { uid: 'owner-1', email: 'owner@example.com', emailVerified: true, authTime: 1_800_000_000, projectId: 'other-project' });
    expect((await call(harness.base, wrongProject, 'GET', '/api/v1/domains')).status).toBe(401);
    const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
    const user = await session(harness.base, { uid: 'user-b', email: 'b@example.com' });
    expect((await call(harness.base, admin, 'POST', '/api/admin/members/user-b/suspend', { body: {} })).status).toBe(200);
    expect((await call(harness.base, user, 'GET', '/api/v1/domains')).status).toBe(403);
    await harness.close();
  });

  it('rejects expired PATs and PATs after their member is suspended', async () => {
    const harness = await startHarness();
    try {
      const expiredMember = await session(harness.base, { uid: 'expired-pat-member', email: 'expired-pat@example.com' });
      const expiredToken = await call(harness.base, expiredMember, 'POST', '/api/tokens', {
        body: { name: 'expires-now', scopes: ['domains:read'], expiresInDays: 1 },
      });
      expect(expiredToken.status).toBe(201);
      const expiredPath = tokenPath('expired-pat-member', expiredToken.body.tokenRecord.id as string);
      await harness.deps.store.transaction(async (tx) => {
        const current = await tx.get<TokenDoc>(expiredPath);
        expect(current).not.toBeNull();
        tx.set(expiredPath, { ...current!, expiresAt: '2026-02-28T14:59:59.999Z' });
      });
      const expiredRead = await call(harness.base, expiredToken.body.token as string, 'GET', '/api/v1/domains');
      expect(expiredRead.status).toBe(401);

      const suspendedMember = await session(harness.base, { uid: 'suspended-pat-member', email: 'suspended-pat@example.com' });
      const suspendedToken = await call(harness.base, suspendedMember, 'POST', '/api/tokens', {
        body: { name: 'suspended-member', scopes: ['domains:read'], expiresInDays: 30 },
      });
      expect(suspendedToken.status).toBe(201);
      const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
      const suspension = await call(harness.base, admin, 'POST', '/api/admin/members/suspended-pat-member/suspend', { body: {} });
      expect(suspension.status).toBe(200);
      const suspendedRead = await call(harness.base, suspendedToken.body.token as string, 'GET', '/api/v1/domains');
      expect(suspendedRead.status).toBe(403);
    } finally {
      await harness.close();
    }
  });

  it('isolates portfolios, revisions, idempotency, and scopes', async () => {
    const harness = await startHarness();
    const alpha = await session(harness.base, { uid: 'alpha', email: 'a@example.com' });
    const beta = await session(harness.base, { uid: 'beta', email: 'b@example.com' });
    const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
    const created = await call(harness.base, alpha, 'POST', '/api/v1/domains', {
      headers: { 'idempotency-key': 'create-1' },
      body: { name: 'https://www.Alpha.dev/path', expirationDate: '2027-03-04', renewalCostMinor: 1299, currency: 'USD', registrar: 'Porkbun' },
    });
    expect(created.status).toBe(201);
    expect(created.body.billingDate).toBeNull();
    expect(created.body.normalizedName).toBe('www.alpha.dev');
    expect(created.headers.get('etag')).toBe('"1"');
    const replay = await call(harness.base, alpha, 'POST', '/api/v1/domains', {
      headers: { 'idempotency-key': 'create-1' },
      body: { name: 'https://www.Alpha.dev/path', expirationDate: '2027-03-04', renewalCostMinor: 1299, currency: 'USD', registrar: 'Porkbun' },
    });
    expect(replay.body.id).toBe(created.body.id);
    expect((await call(harness.base, alpha, 'GET', '/api/v1/domains')).body.records).toHaveLength(1);
    const conflict = await call(harness.base, alpha, 'POST', '/api/v1/domains', {
      headers: { 'idempotency-key': 'create-1' },
      body: { name: 'other.dev', expirationDate: '2027-01-01' },
    });
    expect(conflict.status).toBe(409);
    const sameName = await call(harness.base, beta, 'POST', '/api/v1/domains', {
      headers: { 'idempotency-key': 'beta-1' },
      body: { name: 'www.alpha.dev', expirationDate: '2028-01-01', renewalCostMinor: 1500, currency: 'JPY' },
    });
    expect(sameName.status).toBe(201);
    const hidden = await call(harness.base, beta, 'GET', `/api/v1/domains/${created.body.id}`);
    const missing = await call(harness.base, beta, 'GET', '/api/v1/domains/does-not-exist');
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('not_found');
    expect(hidden.body.error.message).toBe(missing.body.error.message);
    expect(JSON.stringify(hidden.body)).not.toContain('alpha');
    expect((await call(harness.base, admin, 'GET', `/api/v1/domains/${created.body.id}`)).status).toBe(404);
    expect((await call(harness.base, alpha, 'POST', '/api/v1/domains', { headers: { 'idempotency-key': 'bad' }, body: { name: 'injected.dev', expirationDate: '2027-01-01', uid: 'beta', role: 'admin' } })).status).toBe(422);
    expect((await call(harness.base, alpha, 'PATCH', `/api/v1/domains/${created.body.id}`, { body: { registrar: 'Namecheap' } })).status).toBe(428);
    expect((await call(harness.base, alpha, 'PATCH', `/api/v1/domains/${created.body.id}`, { headers: { 'if-match': '"9"' }, body: { registrar: 'Namecheap' } })).status).toBe(412);
    const patched = await call(harness.base, alpha, 'PATCH', `/api/v1/domains/${created.body.id}`, {
      headers: { 'if-match': '"1"' },
      body: { notes: 'kept', dnsProvider: 'Cloudflare', autoRenew: false, registrationCostMinor: 0 },
    });
    expect(patched.status).toBe(200);
    const quick = await call(harness.base, alpha, 'PATCH', `/api/v1/domains/${created.body.id}`, {
      headers: { 'if-match': `"${patched.body.revision}"` },
      body: { registrar: 'Hover' },
    });
    expect(quick.body.notes).toBe('kept');
    expect(quick.body.dnsProvider).toBe('Cloudflare');
    expect(quick.body.autoRenew).toBe(false);
    const readOnly = await call(harness.base, alpha, 'POST', '/api/tokens', { body: { name: 'read', scopes: ['domains:read'], expiresInDays: 30 } });
    const writeOnly = await call(harness.base, alpha, 'POST', '/api/tokens', { body: { name: 'write', scopes: ['domains:write'], expiresInDays: 30 } });
    const readWrite = await call(harness.base, alpha, 'POST', '/api/tokens', { body: { name: 'rw', scopes: ['domains:read', 'domains:write'], expiresInDays: 90 } });
    expect(readOnly.body.token.startsWith('dew1.')).toBe(true);
    expect(JSON.stringify(readOnly.body.tokenRecord)).not.toContain(readOnly.body.token.split('.').at(-1));
    expect((await call(harness.base, readOnly.body.token, 'POST', '/api/v1/domains', { headers: { 'idempotency-key': 'ro' }, body: { name: 'nope.dev', expirationDate: '2027-01-01' } })).status).toBe(403);
    expect((await call(harness.base, writeOnly.body.token, 'GET', '/api/v1/domains')).status).toBe(403);
    const written = await call(harness.base, writeOnly.body.token, 'POST', '/api/v1/domains', {
      headers: { 'idempotency-key': 'wo' },
      body: { name: 'write-only.dev', expirationDate: '2027-05-01' },
    });
    expect(written.status).toBe(201);
    expect(written.body.notes).toBeUndefined();
    expect((await call(harness.base, readWrite.body.token, 'DELETE', `/api/v1/domains/${created.body.id}`, { headers: { 'if-match': `"${quick.body.revision}"` } })).status).toBe(403);
    expect((await call(harness.base, readWrite.body.token, 'POST', '/api/tokens', { body: { name: 'nested' } })).status).toBe(403);
    expect((await call(harness.base, readWrite.body.token, 'POST', '/api/ai/extract', { body: { text: 'example.com' } })).status).toBe(403);
    const stale = await session(harness.base, { uid: 'stale-user', email: 'stale@example.com', authTime: 1_000 });
    expect((await call(harness.base, stale, 'POST', '/api/tokens', { body: { name: 'too-old' } })).status).toBe(403);
    expect((await call(harness.base, alpha, 'GET', '/api/tokens')).body.tokens.some((token: { name: string }) => token.name === 'too-old')).toBe(false);
    await call(harness.base, alpha, 'POST', `/api/tokens/${readOnly.body.tokenRecord.id}/revoke`, { body: {} });
    expect((await call(harness.base, readOnly.body.token, 'GET', '/api/v1/domains')).status).toBe(401);
    await harness.close();
  });

  it('keeps batches and imports atomic and does not delete omitted records', async () => {
    const harness = await startHarness();
    const token = await session(harness.base, { uid: 'importer', email: 'i@example.com' });
    await call(harness.base, token, 'POST', '/api/v1/domains', { headers: { 'idempotency-key': 'seed' }, body: { name: 'keep.example', expirationDate: '2027-01-01', notes: 'stay' } });
    const badBatch = await call(harness.base, token, 'POST', '/api/v1/domains/batch', {
      headers: { 'idempotency-key': 'bad-batch' },
      body: { source: 'ai', records: [{ name: 'ok.example', expirationDate: '2027-02-01' }, { name: 'ok.example', expirationDate: '2027-02-01' }] },
    });
    expect(badBatch.status).toBe(409);
    expect((await call(harness.base, token, 'GET', '/api/v1/domains?archived=all')).body.records).toHaveLength(1);
    const preview = await call(harness.base, token, 'POST', '/api/v1/import/preview', {
      body: {
        format: 'json',
        content: JSON.stringify({
          format: 'domain-expansion-backup',
          schemaVersion: 2,
          domains: [{ name: 'new.example', expirationDate: '2027-04-01', renewalCostMinor: 0, autoRenew: false, currency: 'USD' }],
        }),
        policy: 'skip',
      },
    });
    expect(preview.status).toBe(200);
    expect((await call(harness.base, token, 'GET', '/api/v1/domains?archived=all')).body.records).toHaveLength(1);
    const committed = await call(harness.base, token, 'POST', '/api/v1/import/commit', {
      headers: { 'idempotency-key': 'import-1' },
      body: { previewId: preview.body.previewId, contentHash: preview.body.contentHash },
    });
    expect(committed.status).toBe(200);
    const names = (await call(harness.base, token, 'GET', '/api/v1/domains?archived=all&q=example')).body.records.map((record: { name: string }) => record.name);
    expect(names).toContain('keep.example');
    expect(names).toContain('new.example');
    const exported = await call(harness.base, token, 'GET', '/api/v1/export?format=json');
    expect(exported.body.content).not.toMatch(/dew1\.|verifier|gemini/i);
    expect((await call(harness.base, token, 'POST', '/api/v1/import/preview', { body: { format: 'sql', content: 'DROP TABLE domains;' } })).status).toBe(422);
    await harness.close();
  });

  it('notifies admins without revealing status and does not use the owner key for other users', async () => {
    const harness = await startHarness();
    const first = await call(harness.base, undefined, 'POST', '/api/access/request', { body: { email: 'New.Person@Example.com', reason: '<script>alert(1)</script>' } });
    const second = await call(harness.base, undefined, 'POST', '/api/access/request', { body: { email: 'new.person@example.com', reason: 'again' } });
    expect(first.body).toEqual(second.body);
    expect(harness.mail.alerts).toHaveLength(1);
    expect(JSON.stringify(harness.mail.alerts[0])).toContain('&lt;script&gt;');
    expect(JSON.stringify(harness.mail.alerts[0])).toContain('admin@example.com');
    const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
    const queue = await call(harness.base, admin, 'GET', '/api/admin/requests');
    expect(queue.body.requests).toHaveLength(1);
    const approved = await call(harness.base, admin, 'POST', `/api/admin/requests/${queue.body.requests[0].id}/approve`, { body: {} });
    expect(approved.body.mailState).toBe('sent');
    expect(approved.body.emailVerified).toBe(false);
    expect(harness.mail.signIns).toEqual(['new.person@example.com']);
    const denied = await call(harness.base, undefined, 'POST', '/api/access/request', { body: { email: 'deny.me@example.com' } });
    expect(denied.status).toBe(202);
    const pending = (await call(harness.base, admin, 'GET', '/api/admin/requests')).body.requests.find((request: { email: string }) => request.email === 'deny.me@example.com');
    expect((await call(harness.base, admin, 'POST', `/api/admin/requests/${pending.id}/deny`, { body: {} })).body.status).toBe('denied');
    const member = await session(harness.base, { uid: 'member-1', email: 'member@example.com' });
    expect((await call(harness.base, member, 'POST', '/api/ai/extract', { body: { text: 'example.com renews March 4 for $12' } })).status).toBe(422);
    expect(harness.aiCalls).toHaveLength(0);
    await call(harness.base, member, 'PUT', '/api/credentials/gemini', { body: { apiKey: 'user-owned-gemini-key', consent: true, consentVersion: '2026-09-26' } });
    harness.setAi(async () => ({ ok: false, kind: 'throttle', status: 429 }));
    harness.setAi(async (request) => {
      if (request.model.endsWith('lite')) return { ok: false, kind: 'throttle', status: 429 };
      return { ok: true, text: JSON.stringify({ drafts: [{ name: 'foo.dev', registrar: 'Porkbun', expirationMonth: 3, expirationDay: 4, expirationYear: null, expirationYearInferred: true, billingDate: null, renewalCostMinor: 1200, currency: 'USD', renewalIntent: 'renew', warnings: [] }] }), truncated: false };
    });
    const extracted = await call(harness.base, member, 'POST', '/api/ai/extract', { body: { text: 'foo.dev at Porkbun on March 4 for $12, please renew' } });
    expect(extracted.status).toBe(200);
    expect(extracted.body.drafts[0].proposals.some((proposal: { field: string }) => proposal.field === 'expirationDate')).toBe(true);
    expect(harness.aiCalls.every((request) => request.apiKey === 'user-owned-gemini-key')).toBe(true);
    expect(harness.aiCalls.some((request) => request.model === 'gemini-3.8-flash')).toBe(true);
    expect((await call(harness.base, member, 'GET', '/api/v1/domains')).body.records).toEqual([]);
    const owner = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
    harness.setAi(async () => ({ ok: true, text: JSON.stringify({ drafts: [] }), truncated: false }));
    expect((await call(harness.base, owner, 'POST', '/api/ai/extract', { body: { text: 'owner.example renews next March' } })).status).toBe(200);
    expect(harness.aiCalls.at(-1)?.apiKey).toBe('owner-gemini-key-value');
    await harness.close();
  });
});

describe('mail adapter', () => {
  it('asks Firebase to send the sign-in email instead of only minting a link', async () => {
    const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
    const original = global.fetch;
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({ email: 'a@example.com' }), { status: 200 });
    }) as typeof fetch;
    try {
      const mail = createLiveMail({
        firebaseWebApiKey: 'web-key',
        resendApiKey: 're_test',
        resendFrom: 'Domain Expansion <notify@example.com>',
        adminNotificationEmail: 'admin@example.com',
        allowedOrigins: ['http://127.0.0.1:3000'],
        appOrigin: 'http://127.0.0.1:3000',
        authContinueUrl: 'http://127.0.0.1:3000/auth/finish',
      } as never);
      expect((await mail.sendSignIn('a@example.com', 'http://127.0.0.1:3000/auth/finish')).ok).toBe(true);
      expect(calls[0].url).toContain('accounts:sendOobCode');
      expect(calls[0].body.requestType).toBe('EMAIL_SIGNIN');
      expect((await mail.sendAdminAlert({ to: 'admin@example.com', from: 'Domain Expansion <notify@example.com>', subject: 'Request', text: 'hi', html: '<p>hi</p>', idempotencyKey: 'access-request:1' })).ok).toBe(true);
      expect(calls[1].headers.get('idempotency-key')).toBe('access-request:1');
    } finally {
      global.fetch = original;
    }
  });
});

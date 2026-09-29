import { describe, expect, it } from 'vitest';
import { FORWARDED_IF_MATCH_HEADER, forwardApiPreconditionHeaders } from '../../middleware';
import { call, session, startHarness } from '../helpers';

async function callWithMiddlewareHeaders(base: string, method: string, path: string, token: string, headers: Record<string, string>, body?: unknown) {
  const incoming = new Headers({ authorization: `Bearer ${token}`, ...headers });
  const forwarded = Object.fromEntries(forwardApiPreconditionHeaders(incoming).entries());
  return call(base, undefined, method, path, { headers: forwarded, body });
}

describe('Vercel API precondition header forwarding', () => {
  it('keeps the current ETag, rejects stale and missing values, strips forged aliases, and preserves authorization', async () => {
    const harness = await startHarness();
    try {
      const token = await session(harness.base, { uid: 'if-match-user', email: 'if-match@example.com' });
      const created = await call(harness.base, token, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'middleware-create' },
        body: { name: 'middleware.example', expirationDate: '2027-09-28' },
      });
      const route = `/api/v1/domains/${created.body.id}`;

      const incoming = new Headers({
        authorization: `Bearer ${token}`,
        'if-match': '"1"',
        [FORWARDED_IF_MATCH_HEADER]: '"999"',
      });
      const forwarded = forwardApiPreconditionHeaders(incoming);
      expect(forwarded.get('authorization')).toBe(`Bearer ${token}`);
      expect(forwarded.get('if-match')).toBeNull();
      expect(forwarded.get(FORWARDED_IF_MATCH_HEADER)).toBe('"1"');

      const updated = await callWithMiddlewareHeaders(harness.base, 'PATCH', route, token, {
        'if-match': '"1"',
        [FORWARDED_IF_MATCH_HEADER]: '"999"',
      }, { registrar: 'Verification Registrar' });
      expect(updated.status).toBe(200);
      expect(updated.headers.get('etag')).toBe('"2"');
      expect(updated.body).toMatchObject({ registrar: 'Verification Registrar', revision: 2 });

      const stale = await callWithMiddlewareHeaders(harness.base, 'PATCH', route, token, {
        'if-match': '"1"',
      }, { registrar: 'Stale Registrar' });
      expect(stale.status).toBe(412);
      expect(stale.body.error.code).toBe('stale_revision');

      const forgedOnly = await callWithMiddlewareHeaders(harness.base, 'PATCH', route, token, {
        [FORWARDED_IF_MATCH_HEADER]: '"2"',
      }, { registrar: 'Forged Registrar' });
      expect(forgedOnly.status).toBe(428);

      const readOnly = await call(harness.base, token, 'POST', '/api/tokens', {
        body: { name: 'read-only', scopes: ['domains:read'], expiresInDays: 30 },
      });
      const denied = await callWithMiddlewareHeaders(harness.base, 'PATCH', route, readOnly.body.token, {
        'if-match': '"2"',
      }, { registrar: 'Unauthorized Registrar' });
      expect(denied.status).toBe(403);

      const final = await call(harness.base, token, 'GET', route);
      expect(final.body).toMatchObject({ registrar: 'Verification Registrar', revision: 2 });
    } finally {
      await harness.close();
    }
  });
});

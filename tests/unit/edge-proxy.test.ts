import { describe, expect, it } from 'vitest';
import edgeProxy, { EDGE_REVISION_HEADER, forwardOriginRequest } from '../../edge/api-proxy';
import { EDGE_CLIENT_IP_HEADER, EDGE_CLIENT_IP_SIGNATURE_HEADER, EDGE_CLIENT_IP_TIME_HEADER, getVerifiedEdgeClientIp } from '../../shared/edge-client-ip';

const secret = '12'.repeat(32);
const now = new Date('2026-09-29T12:00:00.000Z');

describe('canonical API proxy', () => {
  it('preserves the body and authorization while moving only the public revision precondition', async () => {
    const request = new Request('https://domains.devthomas.site/api/v1/domains/example', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer synthetic-test-token',
        'content-type': 'application/json',
        'if-match': '"7"',
        [EDGE_REVISION_HEADER]: '"999"',
        'x-domain-expansion-if-match': '"999"',
        'cf-connecting-ip': '192.0.2.1',
        'x-forwarded-for': '192.0.2.99',
        [EDGE_CLIENT_IP_HEADER]: '192.0.2.99',
        [EDGE_CLIENT_IP_TIME_HEADER]: '1',
        [EDGE_CLIENT_IP_SIGNATURE_HEADER]: 'ab'.repeat(32),
      },
      body: JSON.stringify({ registrar: 'Synthetic Registrar' }),
    });
    const forwarded = await forwardOriginRequest(request, secret, now);
    expect(forwarded.url).toBe(request.url);
    expect(forwarded.method).toBe('PATCH');
    expect(forwarded.headers.get('authorization')).toBe('Bearer synthetic-test-token');
    expect(forwarded.headers.get('if-match')).toBeNull();
    expect(forwarded.headers.get('x-domain-expansion-if-match')).toBeNull();
    expect(forwarded.headers.get(EDGE_REVISION_HEADER)).toBe('"7"');
    expect(forwarded.headers.get('x-forwarded-for')).toBe('192.0.2.1');
    expect(await getVerifiedEdgeClientIp(forwarded.headers, secret, now)).toBe('192.0.2.1');
    expect(forwarded.cache).toBe('no-store');
    expect(forwarded.redirect).toBe('manual');
    expect(await forwarded.json()).toEqual({ registrar: 'Synthetic Registrar' });
  });

  it('removes forged alternate headers when the required public header is missing', async () => {
    const forwarded = await forwardOriginRequest(new Request('https://domains.devthomas.site/api/v1/domains/example', {
      headers: { [EDGE_REVISION_HEADER]: '"7"', 'x-domain-expansion-if-match': '"7"', 'cf-connecting-ip': '2001:db8::1' },
    }), secret, now);
    expect(forwarded.headers.has(EDGE_REVISION_HEADER)).toBe(false);
    expect(forwarded.headers.has('x-domain-expansion-if-match')).toBe(false);
    expect(await getVerifiedEdgeClientIp(forwarded.headers, secret, now)).toBe('2001:db8::1');
  });

  it('fails closed when the canonical route lacks a managed key or platform IP', async () => {
    const withIp = new Request('https://domains.devthomas.site/api/health', { headers: { 'cf-connecting-ip': '192.0.2.1' } });
    expect((await edgeProxy.fetch(withIp, { EDGE_CLIENT_IP_SECRET: '' })).status).toBe(503);
    const withoutIp = new Request('https://domains.devthomas.site/api/health');
    expect((await edgeProxy.fetch(withoutIp, { EDGE_CLIENT_IP_SECRET: secret })).status).toBe(503);
  });
});

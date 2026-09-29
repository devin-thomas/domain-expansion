import { afterEach, describe, expect, it } from 'vitest';
import { createEdgeClientIpHeaders } from '../../shared/edge-client-ip';
import { call, startHarness } from '../helpers';

const SECRET = 'abcdef0123456789'.repeat(4);
const ORIGINAL_VERCEL = process.env.VERCEL;

describe('edge client IP trust boundary', () => {
  afterEach(() => {
    if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = ORIGINAL_VERCEL;
  });

  it('uses verified edge metadata for independent IP buckets, ahead of unsigned XFF', async () => {
    const clock = new Date('2026-09-29T20:00:00.000Z');
    const harness = await startHarness({ now: clock });
    harness.config.edgeClientIpSecret = SECRET;
    try {
      const signedRequest = async (ip: string, email: string, xForwardedFor?: string) => {
        const signed = await createEdgeClientIpHeaders(ip, SECRET, clock);
        return call(harness.base, undefined, 'POST', '/api/access/request', {
          headers: { ...signed, ...(xForwardedFor ? { 'x-forwarded-for': xForwardedFor } : {}) },
          body: { email },
        });
      };

      for (let index = 0; index < 5; index += 1) {
        expect((await signedRequest('203.0.113.40', `first-${index}@example.com`)).status).toBe(202);
      }
      expect((await signedRequest('203.0.113.40', 'first-blocked@example.com')).status).toBe(429);

      expect((await signedRequest('203.0.113.41', 'second-1@example.com', '203.0.113.40')).status).toBe(202);
      expect((await signedRequest('203.0.113.41', 'second-2@example.com', '203.0.113.40')).status).toBe(202);
      expect((await signedRequest('203.0.113.40', 'first-still-blocked@example.com')).status).toBe(429);
    } finally {
      await harness.close();
    }
  });

  it('ignores forged edge metadata and unsigned forwarding headers outside Vercel and test mode', async () => {
    const harness = await startHarness();
    harness.config.edgeClientIpSecret = SECRET;
    harness.config.environmentName = 'development';
    process.env.VERCEL = '';
    try {
      const request = (index: number) => call(harness.base, undefined, 'POST', '/api/access/request', {
        headers: {
          'x-forwarded-for': `198.51.100.${index}`,
          'cf-connecting-ip': `203.0.113.${index}`,
          'x-domain-expansion-client-ip': `192.0.2.${index}`,
          'x-domain-expansion-client-ip-time': String(Date.now()),
          'x-domain-expansion-client-ip-signature': '0'.repeat(64),
        },
        body: { email: `local-${index}@example.com` },
      });

      for (let index = 1; index <= 5; index += 1) {
        expect((await request(index)).status).toBe(202);
      }
      expect((await request(6)).status).toBe(429);
    } finally {
      await harness.close();
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  createEdgeClientIpHeaders,
  EDGE_CLIENT_IP_HEADER,
  EDGE_CLIENT_IP_SIGNATURE_HEADER,
  EDGE_CLIENT_IP_TIME_HEADER,
  getVerifiedEdgeClientIp,
  isValidEdgeClientIp,
} from '../../shared/edge-client-ip';
import { loadConfig } from '../../server/config';

const SECRET = '0123456789abcdef'.repeat(4);
const NOW = new Date('2026-09-29T20:00:00.000Z');

describe('signed edge client IP metadata', () => {
  it.each([
    '192.0.2.10',
    '2001:db8::1',
    '::ffff:192.0.2.10',
    '2001:db8:0:0:0:0:0:1',
  ])('accepts valid address %s', (ip) => {
    expect(isValidEdgeClientIp(ip)).toBe(true);
  });

  it.each([
    '',
    '256.0.2.1',
    '192.000.2.1',
    '192.0.2',
    '2001:db8:::1',
    ':::1',
    '1:::2',
    ':1::2',
    '1::2:',
    '1:2:3:4:5:6:7:',
    '2001:db8::1%eth0',
    'gggg::1',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8:9',
    '192.0.2.1, 198.51.100.1',
  ])('rejects malformed address %s', (ip) => {
    expect(isValidEdgeClientIp(ip)).toBe(false);
  });

  it('signs a versioned timestamp and IP payload and verifies it in Web Crypto', async () => {
    const signed = await createEdgeClientIpHeaders('2001:db8::1', SECRET, NOW);
    expect(signed[EDGE_CLIENT_IP_TIME_HEADER]).toBe(String(NOW.getTime()));
    expect(signed[EDGE_CLIENT_IP_SIGNATURE_HEADER]).toMatch(/^[a-f\d]{64}$/);
    expect(await getVerifiedEdgeClientIp(new Headers(signed), SECRET, NOW)).toBe('2001:db8::1');
  });

  it('rejects changed, malformed, expired, and future-dated metadata', async () => {
    const signed = await createEdgeClientIpHeaders('192.0.2.10', SECRET, NOW);
    const changedIp = new Headers(signed);
    changedIp.set(EDGE_CLIENT_IP_HEADER, '192.0.2.11');
    expect(await getVerifiedEdgeClientIp(changedIp, SECRET, NOW)).toBeNull();

    const malformedTimestamp = new Headers(signed);
    malformedTimestamp.set(EDGE_CLIENT_IP_TIME_HEADER, `${NOW.getTime()}junk`);
    expect(await getVerifiedEdgeClientIp(malformedTimestamp, SECRET, NOW)).toBeNull();

    const malformedSignature = new Headers(signed);
    malformedSignature.set(EDGE_CLIENT_IP_SIGNATURE_HEADER, 'not-a-signature');
    expect(await getVerifiedEdgeClientIp(malformedSignature, SECRET, NOW)).toBeNull();

    expect(await getVerifiedEdgeClientIp(new Headers(signed), SECRET, new Date(NOW.getTime() + 300_001))).toBeNull();
    const future = await createEdgeClientIpHeaders('192.0.2.10', SECRET, new Date(NOW.getTime() + 300_001));
    expect(await getVerifiedEdgeClientIp(new Headers(future), SECRET, NOW)).toBeNull();
  });

  it('requires a 64-hex secret in shared signing and server configuration', async () => {
    await expect(createEdgeClientIpHeaders('192.0.2.10', 'short', NOW)).rejects.toThrow(/64 hexadecimal/);
    expect(await getVerifiedEdgeClientIp(new Headers(), 'short', NOW)).toBeNull();
    expect(() => loadConfig({ APP_ENV: 'test', EDGE_CLIENT_IP_SECRET: 'short' })).toThrow(/64 hexadecimal/);
    expect(loadConfig({ APP_ENV: 'test', EDGE_CLIENT_IP_SECRET: SECRET }).edgeClientIpSecret).toBe(SECRET);
  });
});

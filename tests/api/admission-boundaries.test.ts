import { describe, expect, it } from 'vitest';
import { call, session, startHarness } from '../helpers';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('public admission rate-limit boundaries', () => {
  it('allows five access requests per IP per hour and resets at the exact window boundary', async () => {
    const clock = new Date('2026-03-01T15:00:00.000Z');
    const harness = await startHarness({ now: clock });
    try {
      const ip = '203.0.113.10';
      for (let index = 0; index < 5; index += 1) {
        const response = await call(harness.base, undefined, 'POST', '/api/access/request', {
          headers: { 'x-forwarded-for': ip },
          body: { email: `request-${index}@example.com` },
        });
        expect(response.status).toBe(202);
      }

      const blocked = await call(harness.base, undefined, 'POST', '/api/access/request', {
        headers: { 'x-forwarded-for': ip },
        body: { email: 'request-blocked@example.com' },
      });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBe('3600');

      clock.setTime(clock.getTime() + HOUR_MS - 1);
      const beforeBoundary = await call(harness.base, undefined, 'POST', '/api/access/request', {
        headers: { 'x-forwarded-for': ip },
        body: { email: 'request-before-boundary@example.com' },
      });
      expect(beforeBoundary.status).toBe(429);
      expect(beforeBoundary.headers.get('retry-after')).toBe('1');

      clock.setTime(clock.getTime() + 1);
      const atBoundary = await call(harness.base, undefined, 'POST', '/api/access/request', {
        headers: { 'x-forwarded-for': ip },
        body: { email: 'request-at-boundary@example.com' },
      });
      expect(atBoundary.status).toBe(202);
    } finally {
      await harness.close();
    }
  });

  it('suppresses repeat notifications for one email during a day and reopens exactly at 24 hours', async () => {
    const clock = new Date('2026-03-01T15:00:00.000Z');
    const firstRequestAt = clock.getTime();
    const harness = await startHarness({ now: clock });
    const email = 'repeat@example.com';
    try {
      const first = await call(harness.base, undefined, 'POST', '/api/access/request', {
        headers: { 'x-forwarded-for': '203.0.113.20' },
        body: { email },
      });
      expect(first.status).toBe(202);

      const denyLatestRequest = async () => {
        const rows = await harness.deps.store.list<{ id: string; email: string }>('accessRequests/');
        const request = rows.find((row) => row.data.email === email);
        expect(request).toBeDefined();
        const admin = await session(harness.base, { uid: 'owner-1', email: 'owner@example.com', role: 'admin' });
        return call(harness.base, admin, 'POST', `/api/admin/requests/${request!.data.id}/deny`, { body: {} });
      };

      const initialRequests = await harness.deps.store.list<{ id: string; email: string }>('accessRequests/');
      const requestId = initialRequests.find((row) => row.data.email === email)?.data.id;
      expect(requestId).toBeDefined();
      const firstNotifications = await harness.deps.store.list<{ requestId: string; shouldNotify?: boolean }>('notifications/');
      expect(firstNotifications.filter((row) => row.data.requestId === requestId && row.data.shouldNotify === true)).toHaveLength(1);
      expect((await denyLatestRequest()).status).toBe(200);

      clock.setTime(firstRequestAt + DAY_MS - 1);
      const withinDay = await call(harness.base, undefined, 'POST', '/api/access/request', {
        headers: { 'x-forwarded-for': '203.0.113.21' },
        body: { email },
      });
      expect(withinDay.status).toBe(202);
      expect((await denyLatestRequest()).status).toBe(200);

      const beforeBoundary = await harness.deps.store.list<{ requestId: string; shouldNotify?: boolean }>('notifications/');
      expect(beforeBoundary.filter((row) => row.data.requestId === requestId && row.data.shouldNotify === true)).toHaveLength(1);
      expect(beforeBoundary.filter((row) => row.data.requestId === requestId && row.data.shouldNotify === false)).toHaveLength(1);

      clock.setTime(firstRequestAt + DAY_MS);
      const atBoundary = await call(harness.base, undefined, 'POST', '/api/access/request', {
        headers: { 'x-forwarded-for': '203.0.113.22' },
        body: { email },
      });
      expect(atBoundary.status).toBe(202);
      const boundaryNotifications = await harness.deps.store.list<{ requestId: string; shouldNotify?: boolean }>('notifications/');
      expect(boundaryNotifications.filter((row) => row.data.requestId === requestId && row.data.shouldNotify === true)).toHaveLength(2);
      expect(boundaryNotifications.filter((row) => row.data.requestId === requestId && row.data.shouldNotify === false)).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it('enforces the email-link resend cooldown through 60 seconds and releases at the boundary', async () => {
    const clock = new Date('2026-03-01T15:00:00.000Z');
    const harness = await startHarness({ now: clock });
    try {
      const requestLink = () => call(harness.base, undefined, 'POST', '/api/auth/email-link', {
        headers: { 'x-forwarded-for': '203.0.113.30' },
        body: { email: 'signin@example.com' },
      });

      expect((await requestLink()).status).toBe(202);
      const immediateRetry = await requestLink();
      expect(immediateRetry.status).toBe(429);
      expect(immediateRetry.headers.get('retry-after')).toBe('60');

      clock.setTime(clock.getTime() + 60_000 - 1);
      const beforeBoundary = await requestLink();
      expect(beforeBoundary.status).toBe(429);
      expect(beforeBoundary.headers.get('retry-after')).toBe('1');

      clock.setTime(clock.getTime() + 1);
      expect((await requestLink()).status).toBe(202);
    } finally {
      await harness.close();
    }
  });
});

import { ApiError } from '../shared/errors';
import type { Actor } from './auth';
import { memberPath, requireAdmin, requireRecent, type MemberDoc } from './auth';
import type { Config } from './config';
import { randomId, sha256Hex } from './crypto';
import type { IdentityDirectory, MailPort } from './ports';
import type { DocStore } from './store';

interface AccessRequest {
  id: string;
  email: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  updatedAt: string;
  uid: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  mailState: 'idle' | 'pending' | 'sent' | 'failed';
  mailError: string | null;
}

interface NotificationDoc {
  id: string;
  requestId: string;
  emailHash: string;
  status: 'pending' | 'accepted' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
}

interface RateDoc {
  count: number;
  windowStart: number;
}

const GENERIC = 'If this email can be processed, the administrator will see the request.';
const SIGNIN_GENERIC = 'If this email is approved, a sign-in link is on its way.';

function emailHash(email: string): string {
  return sha256Hex(email);
}

export function assertEmail(input: unknown): string {
  if (typeof input !== 'string') throw new ApiError(400, 'invalid_email', 'Enter a valid email address');
  if (/[\u0000-\u001f\u007f]/.test(input)) throw new ApiError(400, 'invalid_email', 'Enter a valid email address');
  const email = input.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'invalid_email', 'Enter a valid email address');
  }
  return email;
}

function assertReason(input: unknown): string {
  if (input === undefined || input === null || input === '') return '';
  if (typeof input !== 'string' || /[\u0000-\u001f\u007f]/.test(input) || input.length > 500) {
    throw new ApiError(400, 'invalid_reason', 'Keep the reason to a short plain-text note');
  }
  return input.trim();
}

async function consume(store: DocStore, key: string, limit: number, windowMs: number, now: number): Promise<void> {
  await store.transaction(async (tx) => {
    const path = `rateLimits/${sha256Hex(key)}`;
    const current = await tx.get<RateDoc>(path);
    if (!current || now - current.windowStart >= windowMs) {
      tx.set(path, { count: 1, windowStart: now } satisfies RateDoc);
      return;
    }
    if (current.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((current.windowStart + windowMs - now) / 1000));
      throw new ApiError(429, 'rate_limited', 'Too many requests. Try again later.', { retryable: true, extra: { retryAfter } });
    }
    tx.set(path, { count: current.count + 1, windowStart: current.windowStart });
  });
}

export async function submitAccessRequest(store: DocStore, config: Config, mail: MailPort, body: unknown, ip: string, now: Date): Promise<{ status: number; body: unknown }> {
  const email = assertEmail((body as { email?: unknown })?.email);
  const reason = assertReason((body as { reason?: unknown })?.reason);
  await consume(store, `access-ip:${ip}`, 5, 60 * 60 * 1000, now.getTime());
  const hash = emailHash(email);
  const created = await store.transaction(async (tx) => {
    const index = await tx.get<{ requestId: string }>(`accessRequestIndex/${hash}`);
    const existing = index ? await tx.get<AccessRequest>(`accessRequests/${index.requestId}`) : null;
    if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
      return { request: existing, notify: false as const };
    }
    const recent = await tx.get<{ at: number }>(`notificationWindows/${hash}`);
    const notify = !recent || now.getTime() - recent.at >= 24 * 60 * 60 * 1000;
    const request: AccessRequest = existing
      ? { ...existing, status: 'pending', reason, updatedAt: now.toISOString(), decidedAt: null, decidedBy: null, mailState: 'idle', mailError: null }
      : {
          id: randomId('req'),
          email,
          reason,
          status: 'pending',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          uid: null,
          decidedAt: null,
          decidedBy: null,
          mailState: 'idle',
          mailError: null,
        };
    tx.set(`accessRequests/${request.id}`, request);
    tx.set(`accessRequestIndex/${hash}`, { requestId: request.id });
    if (!notify) return { request, notify: false as const };
    const notification: NotificationDoc = {
      id: randomId('note'),
      requestId: request.id,
      emailHash: hash,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      idempotencyKey: `access-request:${request.id}:notify`,
    };
    tx.set(`notifications/${notification.id}`, notification);
    tx.set(`notificationWindows/${hash}`, { at: now.getTime() });
    return { request, notify: true as const, notification };
  });
  if (created.notify && created.notification) await deliverNotification(store, config, mail, created.notification.id, now);
  return { status: 202, body: { ok: true, message: GENERIC } };
}

export async function requestSignInLink(store: DocStore, config: Config, mail: MailPort, body: unknown, ip: string, now: Date): Promise<{ status: number; body: unknown }> {
  const email = assertEmail((body as { email?: unknown })?.email);
  await consume(store, `signin-ip:${ip}`, 5, 60 * 60 * 1000, now.getTime());
  await consume(store, `signin-email:${emailHash(email)}`, 1, 60 * 1000, now.getTime());
  const index = await store.get<{ uid: string }>(`memberEmails/${emailHash(email)}`);
  const member = index ? await store.get<MemberDoc>(memberPath(index.uid)) : null;
  if (member?.status === 'approved') {
    const result = await mail.sendSignIn(email, config.authContinueUrl);
    if (!result.ok) {
      await store.transaction(async (tx) => {
        tx.set(`signInMail/${emailHash(email)}`, { status: 'failed', retryable: result.retryable, updatedAt: now.toISOString() });
      });
    }
  }
  return { status: 202, body: { ok: true, message: SIGNIN_GENERIC } };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export async function deliverNotification(store: DocStore, config: Config, mail: MailPort, id: string, now: Date): Promise<void> {
  const current = await store.get<NotificationDoc>(`notifications/${id}`);
  if (!current || current.status === 'accepted') return;
  const request = await store.get<AccessRequest>(`accessRequests/${current.requestId}`);
  if (!request) return;
  if (!config.resendApiKey || !config.resendFrom || !config.adminNotificationEmail) {
    await markNotification(store, current, 'failed', 'Admin notification mail is not configured', now);
    return;
  }
  const safeReason = escapeHtml(request.reason || 'No reason provided');
  const link = `${config.appOrigin}/admin`;
  const result = await mail.sendAdminAlert({
    to: config.adminNotificationEmail,
    from: config.resendFrom,
    subject: 'Domain Expansion access request',
    idempotencyKey: current.idempotencyKey,
    text: `An unverified access request arrived for ${request.email}. Reason: ${request.reason || 'none'}. Review it at ${link}. This message cannot approve the request.`,
    html: `<p>An unverified access request arrived.</p><p>Email: ${escapeHtml(request.email)}</p><p>Reason (unverified): ${safeReason}</p><p><a href="${escapeHtml(link)}">Open the admin queue</a></p><p>This message cannot approve the request.</p>`,
  });
  await markNotification(store, current, result.ok ? 'accepted' : 'failed', result.ok ? null : result.detail || 'delivery failed', now);
}

async function markNotification(store: DocStore, current: NotificationDoc, status: NotificationDoc['status'], error: string | null, now: Date) {
  await store.transaction(async (tx) => {
    const latest = await tx.get<NotificationDoc>(`notifications/${current.id}`);
    if (!latest) return;
    tx.set(`notifications/${current.id}`, {
      ...latest,
      status,
      attempts: latest.attempts + 1,
      lastError: error,
      updatedAt: now.toISOString(),
    });
  });
}

export async function listRequests(store: DocStore, actor: Actor): Promise<{ status: number; body: unknown }> {
  requireAdmin(actor);
  const rows = await store.list<AccessRequest>('accessRequests/');
  const requests = rows
    .map((row) => row.data)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((request) => ({
      id: request.id,
      email: request.email,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      mailState: request.mailState,
      mailError: request.mailError,
    }));
  return { status: 200, body: { requests, pending: requests.filter((request) => request.status === 'pending').length } };
}

export async function decideRequest(
  store: DocStore,
  config: Config,
  mail: MailPort,
  directory: IdentityDirectory,
  actor: Actor,
  id: string,
  decision: 'approve' | 'deny',
  now: Date,
): Promise<{ status: number; body: unknown }> {
  requireAdmin(actor);
  requireRecent(actor, config, now);
  const existing = await store.get<AccessRequest>(`accessRequests/${id}`);
  if (!existing) throw new ApiError(404, 'not_found', 'Not found');
  if (decision === 'deny') {
    if (existing.status === 'approved') throw new ApiError(409, 'already_decided', 'This request was already approved');
    await store.transaction(async (tx) => {
      const current = await tx.get<AccessRequest>(`accessRequests/${id}`);
      if (!current) throw new ApiError(404, 'not_found', 'Not found');
      if (current.status === 'approved') throw new ApiError(409, 'already_decided', 'This request was already approved');
      tx.set(`accessRequests/${id}`, { ...current, status: 'denied', decidedAt: now.toISOString(), decidedBy: actor.uid, updatedAt: now.toISOString() });
    });
    return { status: 200, body: { status: 'denied' } };
  }
  if (existing.status === 'denied') throw new ApiError(409, 'already_decided', 'This request was denied');
  const identity = existing.uid ? { uid: existing.uid, emailVerified: false as const } : await directory.resolve(existing.email);
  await store.transaction(async (tx) => {
    const current = await tx.get<AccessRequest>(`accessRequests/${id}`);
    if (!current) throw new ApiError(404, 'not_found', 'Not found');
    if (current.status === 'denied') throw new ApiError(409, 'already_decided', 'This request was denied');
    const member = await tx.get<MemberDoc>(memberPath(identity.uid));
    tx.set(memberPath(identity.uid), {
      status: 'approved',
      role: member?.role ?? 'member',
      email: current.email,
      createdAt: member?.createdAt ?? now.toISOString(),
    } satisfies MemberDoc);
    tx.set(`memberEmails/${emailHash(current.email)}`, { uid: identity.uid });
    tx.set(`accessRequests/${id}`, {
      ...current,
      status: 'approved',
      uid: identity.uid,
      decidedAt: current.decidedAt ?? now.toISOString(),
      decidedBy: current.decidedBy ?? actor.uid,
      updatedAt: now.toISOString(),
      mailState: 'pending',
      mailError: null,
    });
  });
  const sent = await mail.sendSignIn(existing.email, config.authContinueUrl);
  await store.transaction(async (tx) => {
    const current = await tx.get<AccessRequest>(`accessRequests/${id}`);
    if (!current) return;
    tx.set(`accessRequests/${id}`, {
      ...current,
      mailState: sent.ok ? 'sent' : 'failed',
      mailError: sent.ok ? null : sent.detail || 'Sign-in email was not accepted',
      updatedAt: now.toISOString(),
    });
  });
  return { status: 200, body: { status: 'approved', mailState: sent.ok ? 'sent' : 'failed', emailVerified: identity.emailVerified } };
}

export async function setMembership(store: DocStore, actor: Actor, uid: string, status: 'approved' | 'suspended', now: Date): Promise<{ status: number; body: unknown }> {
  requireAdmin(actor);
  if (uid === actor.uid) throw new ApiError(409, 'invalid_membership', 'You cannot change your own membership here');
  await store.transaction(async (tx) => {
    const member = await tx.get<MemberDoc>(memberPath(uid));
    if (!member) throw new ApiError(404, 'not_found', 'Not found');
    tx.set(memberPath(uid), { ...member, status });
    void now;
  });
  return { status: 200, body: { uid, status } };
}

export async function retryNotification(store: DocStore, config: Config, mail: MailPort, actor: Actor, id: string, now: Date) {
  requireAdmin(actor);
  await deliverNotification(store, config, mail, id, now);
  const note = await store.get<NotificationDoc>(`notifications/${id}`);
  if (!note) throw new ApiError(404, 'not_found', 'Not found');
  return { status: 200, body: { id: note.id, status: note.status, attempts: note.attempts, lastError: note.lastError } };
}

export async function retryDueNotifications(store: DocStore, config: Config, mail: MailPort, now: Date) {
  const notes = await store.list<NotificationDoc>('notifications/');
  for (const note of notes) {
    if (note.data.status === 'accepted' || note.data.attempts >= 5) continue;
    await deliverNotification(store, config, mail, note.data.id, now);
  }
  return { status: 200, body: { retried: notes.filter((note) => note.data.status !== 'accepted').length } };
}

export async function resendApprovalMail(store: DocStore, config: Config, mail: MailPort, actor: Actor, id: string, now: Date) {
  requireAdmin(actor);
  const request = await store.get<AccessRequest>(`accessRequests/${id}`);
  if (!request || request.status !== 'approved') throw new ApiError(404, 'not_found', 'Not found');
  const sent = await mail.sendSignIn(request.email, config.authContinueUrl);
  await store.transaction(async (tx) => {
    const current = await tx.get<AccessRequest>(`accessRequests/${id}`);
    if (!current) return;
    tx.set(`accessRequests/${id}`, { ...current, mailState: sent.ok ? 'sent' : 'failed', mailError: sent.ok ? null : sent.detail || 'failed', updatedAt: now.toISOString() });
  });
  return { status: 200, body: { mailState: sent.ok ? 'sent' : 'failed' } };
}


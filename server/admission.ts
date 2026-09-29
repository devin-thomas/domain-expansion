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
  status: 'pending' | 'sending' | 'accepted' | 'failed' | 'suppressed';
  attempts: number;
  retryable: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  leaseUntil: string | null;
  leaseToken: string | null;
  shouldNotify?: boolean;
  idempotencyKey: string;
}

interface SignInMailDoc {
  email: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'suppressed';
  attempts: number;
  retryable: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  leaseUntil: string | null;
  leaseToken: string | null;
}

interface RateDoc {
  count: number;
  windowStart: number;
}

const GENERIC = 'If this email can be processed, the administrator will see the request.';
const SIGNIN_GENERIC = 'If this email is approved, a sign-in link is on its way.';
const MAX_RETRY_ATTEMPTS = 5;
const MAX_RETRY_JOBS = 8;
const MAX_RETRY_SCAN_PER_QUEUE = 64;
const RETRY_LEASE_MS = 60_000;
const RETRY_WORKER_BUDGET_MS = 40_000;

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

export async function submitAccessRequest(store: DocStore, _config: Config, _mail: MailPort, body: unknown, ip: string, now: Date): Promise<{ status: number; body: unknown }> {
  const email = assertEmail((body as { email?: unknown })?.email);
  const reason = assertReason((body as { reason?: unknown })?.reason);
  await consume(store, `access-ip:${ip}`, 5, 60 * 60 * 1000, now.getTime());
  const hash = emailHash(email);
  const created = await store.transaction(async (tx) => {
    const index = await tx.get<{ requestId: string }>(`accessRequestIndex/${hash}`);
    const existing = index ? await tx.get<AccessRequest>(`accessRequests/${index.requestId}`) : null;
    const recent = await tx.get<{ at: number }>(`notificationWindows/${hash}`);
    const eligible = !existing || existing.status === 'denied';
    const shouldNotify = eligible && (!recent || now.getTime() - recent.at >= 24 * 60 * 60 * 1000);
    const request: AccessRequest = existing && !eligible
      ? existing
      : existing
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
    const notification: NotificationDoc = {
      id: randomId('note'),
      requestId: request.id,
      emailHash: hash,
      status: 'pending',
      attempts: 0,
      retryable: true,
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextAttemptAt: now.toISOString(),
      leaseUntil: null,
      leaseToken: null,
      shouldNotify,
      idempotencyKey: `access-request:${request.id}:${randomId('delivery')}:notify`,
    };
    tx.set(`notifications/${notification.id}`, notification);
    if (shouldNotify) tx.set(`notificationWindows/${hash}`, { at: now.getTime() });
    return { request, notification };
  });
  return { status: 202, body: { ok: true, message: GENERIC } };
}

export async function requestSignInLink(store: DocStore, _config: Config, _mail: MailPort, body: unknown, ip: string, now: Date): Promise<{ status: number; body: unknown }> {
  const email = assertEmail((body as { email?: unknown })?.email);
  await consume(store, `signin-ip:${ip}`, 5, 60 * 60 * 1000, now.getTime());
  await consume(store, `signin-email:${emailHash(email)}`, 1, 60 * 1000, now.getTime());
  const path = `signInMail/${emailHash(email)}`;
  await store.transaction(async (tx) => {
    const current = await tx.get<SignInMailDoc>(path);
    const activeLease = current?.status === 'sending' && current.leaseUntil && Date.parse(current.leaseUntil) > now.getTime();
    if (activeLease) return;
    tx.set(path, {
      email,
      status: 'pending',
      attempts: 0,
      retryable: true,
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextAttemptAt: now.toISOString(),
      leaseUntil: null,
      leaseToken: null,
    } satisfies SignInMailDoc);
  });
  return { status: 202, body: { ok: true, message: SIGNIN_GENERIC } };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export async function deliverNotification(store: DocStore, config: Config, mail: MailPort, id: string, now: Date, force = false): Promise<boolean> {
  const claim = await claimNotification(store, id, now, force);
  if (!claim) return false;
  const { doc: current, leaseToken } = claim;
  if (current.shouldNotify === false) {
    await finishNotification(store, id, leaseToken, 'suppressed', false, null, now);
    return true;
  }
  const request = await store.get<AccessRequest>(`accessRequests/${current.requestId}`);
  if (!request) {
    await finishNotification(store, id, leaseToken, 'failed', false, 'Access request is missing', now);
    return true;
  }
  if (!config.resendApiKey || !config.resendFrom || !config.adminNotificationEmail) {
    await finishNotification(store, id, leaseToken, 'failed', false, 'Admin notification mail is not configured', now);
    return true;
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
  await finishNotification(store, id, leaseToken, result.ok ? 'accepted' : 'failed', result.retryable, result.ok ? null : result.detail || 'delivery failed', now);
  return true;
}

async function claimNotification(store: DocStore, id: string, now: Date, force = false): Promise<{ doc: NotificationDoc; leaseToken: string } | null> {
  const leaseToken = randomId('lease');
  return store.transaction(async (tx) => {
    const path = `notifications/${id}`;
    const current = await tx.get<NotificationDoc>(path);
    if (!current || current.status === 'accepted' || current.status === 'suppressed') return null;
    const locked = current.status === 'sending' && current.leaseUntil && Date.parse(current.leaseUntil) > now.getTime();
    if (locked) return null;
    if (!force && (current.attempts >= MAX_RETRY_ATTEMPTS || current.retryable === false || (current.nextAttemptAt && Date.parse(current.nextAttemptAt) > now.getTime()))) return null;
    const claimed = {
      ...current,
      status: 'sending' as const,
      attempts: current.attempts + 1,
      updatedAt: now.toISOString(),
      leaseUntil: new Date(now.getTime() + RETRY_LEASE_MS).toISOString(),
      leaseToken,
    };
    tx.set(path, claimed);
    return { doc: claimed, leaseToken };
  });
}

async function finishNotification(store: DocStore, id: string, leaseToken: string, status: NotificationDoc['status'], retryable: boolean, error: string | null, now: Date): Promise<void> {
  await store.transaction(async (tx) => {
    const path = `notifications/${id}`;
    const latest = await tx.get<NotificationDoc>(path);
    if (!latest || latest.leaseToken !== leaseToken) return;
    const retry = status === 'failed' && retryable && latest.attempts < MAX_RETRY_ATTEMPTS;
    const delayMs = Math.min(60_000 * 2 ** Math.max(0, latest.attempts - 1), 15 * 60_000);
    tx.set(path, {
      ...latest,
      status,
      retryable: retry,
      lastError: error,
      updatedAt: now.toISOString(),
      nextAttemptAt: retry ? new Date(now.getTime() + delayMs).toISOString() : null,
      leaseUntil: null,
      leaseToken: null,
    });
  });
}

export async function listRequests(store: DocStore, actor: Actor): Promise<{ status: number; body: unknown }> {
  requireAdmin(actor);
  const [rows, notifications] = await Promise.all([store.list<AccessRequest>('accessRequests/'), store.list<NotificationDoc>('notifications/')]);
  const latestNotification = new Map<string, NotificationDoc>();
  for (const { data } of notifications) {
    const current = latestNotification.get(data.requestId);
    if (!current || current.createdAt < data.createdAt) latestNotification.set(data.requestId, data);
  }
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
      notificationId: latestNotification.get(request.id)?.id ?? null,
      notificationStatus: latestNotification.get(request.id)?.status ?? null,
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
  if (existing.status === 'approved') {
    return { status: 200, body: { status: 'approved', mailState: existing.mailState, emailVerified: false } };
  }
  const identity = existing.uid ? { uid: existing.uid, emailVerified: false as const } : await directory.resolve(existing.email);
  const approval = await store.transaction(async (tx) => {
    const current = await tx.get<AccessRequest>(`accessRequests/${id}`);
    if (!current) throw new ApiError(404, 'not_found', 'Not found');
    if (current.status === 'denied') throw new ApiError(409, 'already_decided', 'This request was denied');
    if (current.status === 'approved') return { firstApproval: false, mailState: current.mailState };
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
    return { firstApproval: true, mailState: 'pending' as const };
  });
  if (!approval.firstApproval) {
    return { status: 200, body: { status: 'approved', mailState: approval.mailState, emailVerified: false } };
  }
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
  await deliverNotification(store, config, mail, id, now, true);
  const note = await store.get<NotificationDoc>(`notifications/${id}`);
  if (!note) throw new ApiError(404, 'not_found', 'Not found');
  return { status: 200, body: { id: note.id, status: note.status, attempts: note.attempts, lastError: note.lastError } };
}

export async function retryDueNotifications(store: DocStore, config: Config, mail: MailPort, now: Date) {
  const deadline = Date.now() + RETRY_WORKER_BUDGET_MS;
  const [notificationCursor, signInCursor] = await Promise.all([
    store.get<{ afterPath: string | null }>('mailQueueCursors/notifications'),
    store.get<{ afterPath: string | null }>('mailQueueCursors/sign-ins'),
  ]);
  const [notes, signIns] = await Promise.all([
    store.list<NotificationDoc>('notifications/', { limit: MAX_RETRY_SCAN_PER_QUEUE, startAfter: notificationCursor?.afterPath ?? undefined }),
    store.list<SignInMailDoc>('signInMail/', { limit: MAX_RETRY_SCAN_PER_QUEUE, startAfter: signInCursor?.afterPath ?? undefined }),
  ]);
  const progress = { notification: notificationCursor?.afterPath ?? null, 'sign-in': signInCursor?.afterPath ?? null };
  const processed = { notification: 0, 'sign-in': 0 };
  let sent = 0;
  const rowCount = Math.max(notes.length, signIns.length);
  for (let index = 0; index < rowCount; index += 1) {
    if (sent >= MAX_RETRY_JOBS || Date.now() >= deadline) break;
    const notification = notes[index];
    if (notification) {
      processed.notification += 1;
      progress.notification = notification.path;
      if (notificationDue(notification.data, now)) {
        if (await deliverNotification(store, config, mail, notification.data.id || notification.path.split('/').at(-1)!, now)) sent += 1;
      }
    }
    const signIn = signIns[index];
    if (signIn && sent < MAX_RETRY_JOBS && Date.now() < deadline) {
      processed['sign-in'] += 1;
      progress['sign-in'] = signIn.path;
      if (signInDue(signIn.data, now)) {
        if (await deliverSignInMail(store, config, mail, signIn.path.split('/').at(-1)!, now)) sent += 1;
      }
    }
  }
  await Promise.all([
    advanceQueueCursor(store, 'notifications', notificationCursor?.afterPath ?? null, notes, processed.notification, progress.notification),
    advanceQueueCursor(store, 'sign-ins', signInCursor?.afterPath ?? null, signIns, processed['sign-in'], progress['sign-in']),
  ]);
  return { status: 200, body: { retried: sent, scanned: processed.notification + processed['sign-in'] } };
}

function notificationDue(data: NotificationDoc, now: Date): boolean {
  if (data.status === 'sending') return Boolean(data.leaseUntil && Date.parse(data.leaseUntil) <= now.getTime());
  if (data.status !== 'pending' && data.status !== 'failed') return false;
  return data.attempts < MAX_RETRY_ATTEMPTS
    && data.retryable !== false
    && (!data.nextAttemptAt || Date.parse(data.nextAttemptAt) <= now.getTime());
}

function signInDue(data: SignInMailDoc, now: Date): boolean {
  if (data.status === 'sending') return Boolean(data.leaseUntil && Date.parse(data.leaseUntil) <= now.getTime());
  return data.status === 'pending'
    && data.attempts < MAX_RETRY_ATTEMPTS
    && (!data.nextAttemptAt || Date.parse(data.nextAttemptAt) <= now.getTime());
}

async function advanceQueueCursor(
  store: DocStore,
  queue: 'notifications' | 'sign-ins',
  expected: string | null,
  rows: { path: string }[],
  processed: number,
  afterPath: string | null,
): Promise<void> {
  const path = `mailQueueCursors/${queue}`;
  const next = processed === rows.length && rows.length < MAX_RETRY_SCAN_PER_QUEUE ? null : afterPath;
  await store.transaction(async (tx) => {
    const current = await tx.get<{ afterPath: string | null }>(path);
    if ((current?.afterPath ?? null) !== expected) return;
    tx.set(path, { afterPath: next, updatedAt: new Date().toISOString() });
  });
}

async function deliverSignInMail(store: DocStore, config: Config, mail: MailPort, hash: string, now: Date): Promise<boolean> {
  const path = `signInMail/${hash}`;
  const leaseToken = randomId('lease');
  const claimed = await store.transaction(async (tx) => {
    const current = await tx.get<SignInMailDoc>(path);
    if (!current || !current.email || current.status === 'sent' || current.status === 'suppressed' || current.status === 'failed') return null;
    const locked = current.status === 'sending' && current.leaseUntil && Date.parse(current.leaseUntil) > now.getTime();
    if (locked || current.attempts >= MAX_RETRY_ATTEMPTS || (current.nextAttemptAt && Date.parse(current.nextAttemptAt) > now.getTime())) return null;
    const next: SignInMailDoc = {
      ...current,
      status: 'sending',
      attempts: current.attempts + 1,
      updatedAt: now.toISOString(),
      leaseUntil: new Date(now.getTime() + RETRY_LEASE_MS).toISOString(),
      leaseToken,
    };
    tx.set(path, next);
    return next;
  });
  if (!claimed?.email) return false;

  const index = await store.get<{ uid: string }>(`memberEmails/${hash}`);
  const member = index ? await store.get<MemberDoc>(memberPath(index.uid)) : null;
  if (member?.status !== 'approved') {
    await finishSignInMail(store, path, leaseToken, 'suppressed', false, null, now);
    return true;
  }
  const result = await mail.sendSignIn(claimed.email, config.authContinueUrl);
  await finishSignInMail(store, path, leaseToken, result.ok ? 'sent' : 'failed', result.retryable, result.ok ? null : result.detail || 'Sign-in email was not accepted', now);
  return true;
}

async function finishSignInMail(
  store: DocStore,
  path: string,
  leaseToken: string,
  status: SignInMailDoc['status'],
  retryable: boolean,
  error: string | null,
  now: Date,
): Promise<void> {
  await store.transaction(async (tx) => {
    const latest = await tx.get<SignInMailDoc>(path);
    if (!latest || latest.leaseToken !== leaseToken) return;
    const retry = status === 'failed' && retryable && latest.attempts < MAX_RETRY_ATTEMPTS;
    const delayMs = Math.min(60_000 * 2 ** Math.max(0, latest.attempts - 1), 15 * 60_000);
    tx.set(path, {
      ...latest,
      email: status === 'sent' || status === 'suppressed' || !retry ? null : latest.email,
      status: retry ? 'pending' : status,
      retryable: retry,
      lastError: error,
      updatedAt: now.toISOString(),
      nextAttemptAt: retry ? new Date(now.getTime() + delayMs).toISOString() : null,
      leaseUntil: null,
      leaseToken: null,
    });
  });
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

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Scope } from '../shared/domain.js';
import { SCOPES } from '../shared/domain.js';
import { ApiError } from '../shared/errors.js';
import type { Config } from './config.js';
import { randomToken, safeEqualHex, sha256Hex } from './crypto.js';
import type { DocStore } from './store.js';

export interface Actor {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  authTime: number;
  role: 'member' | 'admin';
  authKind: 'session' | 'pat';
  scopes: Scope[];
  tokenId?: string;
}

export interface MemberDoc {
  status: 'approved' | 'suspended';
  role: 'member' | 'admin';
  email: string | null;
  createdAt: string;
  bootstrap?: boolean;
}

export interface TokenDoc {
  id: string;
  name: string;
  verifier: string;
  scopes: Scope[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  uid: string;
}

export function memberPath(uid: string): string {
  return `members/${uid}`;
}

export function tokenPath(uid: string, tokenId: string): string {
  return `users/${uid}/apiTokens/${tokenId}`;
}

export async function bootstrapOwner(store: DocStore, config: Config, nowIso: string): Promise<void> {
  if (!config.ownerUid) return;
  await store.transaction(async (tx) => {
    const existing = await tx.get<MemberDoc>(memberPath(config.ownerUid!));
    if (existing) return;
    tx.set(memberPath(config.ownerUid!), {
      status: 'approved',
      role: 'admin',
      email: config.ownerEmail,
      createdAt: nowIso,
      bootstrap: true,
    } satisfies MemberDoc);
  });
}

export function signTestToken(config: Config, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', config.testAuthSecret).update(body).digest('base64url');
  return `test.${body}.${sig}`;
}

function verifyTestToken(config: Config, token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'test') throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  const expected = createHmac('sha256', config.testAuthSecret).update(parts[1]).digest('base64url');
  const left = Buffer.from(parts[2]);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  if (payload.projectId !== config.projectId) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  return payload;
}

export async function authenticate(header: string | undefined, store: DocStore, config: Config, now: Date): Promise<Actor> {
  if (!header || !header.startsWith('Bearer ')) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  const token = header.slice('Bearer '.length).trim();
  if (!token || token.includes('\n') || token.includes('\r')) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  if (token.startsWith('dew1.')) return authenticatePat(token, store, now);
  if (token.startsWith('test.')) return authenticateTest(token, store, config, now);
  return authenticateFirebase(token, store, config, now);
}

async function actorFromMember(uid: string, email: string | null, emailVerified: boolean, authTime: number, store: DocStore, authKind: Actor['authKind'], scopes: Scope[], tokenId?: string): Promise<Actor> {
  const member = await store.get<MemberDoc>(memberPath(uid));
  if (!member || member.status !== 'approved') {
    throw new ApiError(403, 'forbidden', 'This account cannot use Domain Expansion');
  }
  if (!emailVerified && authKind === 'session') {
    throw new ApiError(403, 'email_unverified', 'Verify your email before continuing');
  }
  return { uid, email: email ?? member.email, emailVerified, authTime, role: member.role, authKind, scopes, tokenId };
}

async function authenticateTest(token: string, store: DocStore, config: Config, now: Date): Promise<Actor> {
  if (!config.testAuth) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  const payload = verifyTestToken(config, token);
  const uid = String(payload.uid || '');
  if (!uid) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  const authTime = Number(payload.authTime ?? Math.floor(now.getTime() / 1000));
  return actorFromMember(uid, typeof payload.email === 'string' ? payload.email : null, payload.emailVerified === true, authTime, store, 'session', [...SCOPES]);
}

async function authenticateFirebase(token: string, store: DocStore, config: Config, now: Date): Promise<Actor> {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  if (getApps().length === 0) {
    initializeApp({ projectId: config.projectId });
  }
  let decoded: { uid: string; email?: string; email_verified?: boolean; auth_time?: number; aud?: string; firebase?: { sign_in_provider?: string } };
  try {
    decoded = await getAuth().verifyIdToken(token, true);
  } catch {
    throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  }
  if (decoded.aud !== config.projectId) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  return actorFromMember(
    decoded.uid,
    decoded.email ?? null,
    decoded.email_verified === true,
    decoded.auth_time ?? Math.floor(now.getTime() / 1000),
    store,
    'session',
    [...SCOPES],
  );
}

async function authenticatePat(token: string, store: DocStore, now: Date): Promise<Actor> {
  const parts = token.split('.');
  const dummy = sha256Hex('missing-token');
  if (parts.length !== 4 || parts[0] !== 'dew1') {
    safeEqualHex(dummy, dummy);
    throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  }
  const [, uid, tokenId, secret] = parts;
  const doc = await store.get<TokenDoc>(tokenPath(uid, tokenId));
  const verifier = sha256Hex(secret);
  const matches = safeEqualHex(verifier, doc?.verifier ?? dummy);
  if (!doc || !matches || doc.revokedAt) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  if (Date.parse(doc.expiresAt) <= now.getTime()) throw new ApiError(401, 'unauthorized', 'Sign in to continue');
  const actor = await actorFromMember(uid, null, true, Math.floor(now.getTime() / 1000), store, 'pat', doc.scopes, tokenId);
  if (!doc.lastUsedAt || now.getTime() - Date.parse(doc.lastUsedAt) > 60_000) {
    await store.transaction(async (tx) => {
      const current = await tx.get<TokenDoc>(tokenPath(uid, tokenId));
      if (!current || current.revokedAt) return;
      tx.set(tokenPath(uid, tokenId), { ...current, lastUsedAt: now.toISOString() });
    });
  }
  return actor;
}

export function issuePat(uid: string, name: string, scopes: Scope[], expiresAt: string, nowIso: string): { token: string; doc: TokenDoc } {
  const tokenId = randomToken(9);
  const secret = randomToken(32);
  const doc: TokenDoc = {
    id: tokenId,
    name,
    verifier: sha256Hex(secret),
    scopes,
    createdAt: nowIso,
    expiresAt,
    revokedAt: null,
    lastUsedAt: null,
    uid,
  };
  return { token: `dew1.${uid}.${tokenId}.${secret}`, doc };
}

export function requireScope(actor: Actor, scope: Scope): void {
  if (!actor.scopes.includes(scope)) throw new ApiError(403, 'forbidden', 'This credential does not allow that action');
}

export function requireSession(actor: Actor): void {
  if (actor.authKind !== 'session') throw new ApiError(403, 'forbidden', 'This action requires a signed-in browser session');
}

export function requireRecent(actor: Actor, config: Config, now: Date): void {
  if (Math.floor(now.getTime() / 1000) - actor.authTime > config.recentAuthSeconds) {
    throw new ApiError(403, 'recent_auth_required', 'Sign in again to continue this action');
  }
}

export function requireAdmin(actor: Actor): void {
  requireSession(actor);
  if (actor.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access is required');
}

export function publicToken(doc: TokenDoc) {
  return {
    id: doc.id,
    name: doc.name,
    scopes: doc.scopes,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt,
    lastUsedAt: doc.lastUsedAt,
  };
}

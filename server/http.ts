import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SCOPES, type Scope } from '../shared/domain.js';
import { ApiError, errorBody } from '../shared/errors.js';
import { openApiDocument } from '../shared/openapi.js';
import { FORWARDED_IF_MATCH_HEADER } from '../middleware.js';
import {
  decideRequest,
  listRequests,
  requestSignInLink,
  resendApprovalMail,
  retryDueNotifications,
  retryNotification,
  setMembership,
  submitAccessRequest,
} from './admission.js';
import { authenticate, bootstrapOwner, issuePat, memberPath, publicToken, requireRecent, requireSession, signTestToken, tokenPath, type MemberDoc, type TokenDoc } from './auth.js';
import type { Config } from './config.js';
import { deleteCredential, getCredentialStatus, putCredential } from './credentials.js';
import { sha256Hex } from './crypto.js';
import { extractDrafts } from './extract.js';
import type { AiPort, IdentityDirectory, LogSink, MailPort } from './ports.js';
import {
  batchCreate,
  commitImport,
  createDomain,
  deleteDomain,
  exportData,
  getDomain,
  getSettings,
  listDomains,
  patchDomain,
  previewImport,
  putSettings,
  summarize,
  updateIntegration,
  userToday,
} from './portfolio.js';
import type { DocStore } from './store.js';
import { RETRY_CRON_SCHEDULE, retryWithAudit } from './retry-audit.js';

export interface AppDeps {
  store: DocStore;
  config: Config;
  mail: MailPort;
  ai: AiPort;
  directory: IdentityDirectory;
  now: () => Date;
  log: LogSink;
}

export const ROUTE_TABLE = [
  'GET /api/health',
  'GET /api/openapi.json',
  'POST /api/access/request',
  'POST /api/auth/email-link',
  'POST /api/test/session',
  'GET /api/session',
  'GET /api/admin/requests',
  'POST /api/admin/requests/:id/approve',
  'POST /api/admin/requests/:id/deny',
  'POST /api/admin/requests/:id/resend-signin',
  'POST /api/admin/members/:uid/suspend',
  'POST /api/admin/members/:uid/reinstate',
  'POST /api/admin/notifications/:id/retry',
  'POST /api/internal/notifications/retry',
  'GET /api/internal/notifications/retry',
  'GET /api/v1/domains',
  'POST /api/v1/domains',
  'POST /api/v1/domains/batch',
  'GET /api/v1/domains/:id',
  'PATCH /api/v1/domains/:id',
  'DELETE /api/v1/domains/:id',
  'POST /api/v1/domains/:id/integrations',
  'GET /api/v1/summary',
  'GET /api/v1/settings',
  'PUT /api/v1/settings',
  'POST /api/v1/import/preview',
  'POST /api/v1/import/commit',
  'GET /api/v1/export',
  'GET /api/tokens',
  'POST /api/tokens',
  'POST /api/tokens/:id/revoke',
  'GET /api/credentials/gemini',
  'PUT /api/credentials/gemini',
  'DELETE /api/credentials/gemini',
  'POST /api/ai/extract',
] as const;

const MAX_BODY = 2 * 1024 * 1024;

export async function handleApi(req: IncomingMessage & { body?: unknown }, res: ServerResponse, deps: AppDeps, background?: (work: Promise<unknown>) => void): Promise<void> {
  const requestId = randomUUID();
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.searchParams.has('token') || url.searchParams.has('access_token')) {
      throw new ApiError(400, 'invalid_query', 'Send credentials in the Authorization header');
    }
    const origin = req.headers.origin;
    if (typeof origin === 'string' && !deps.config.allowedOrigins.includes(origin)) {
      throw new ApiError(403, 'forbidden', 'This origin is not allowed');
    }
    const result = await dispatch(req, url, deps, requestId);
    send(res, result.status, result.body, requestId, result.etag, result.retryAfter);
    if (background && req.method === 'POST' && ['/api/access/request', '/api/auth/email-link'].includes(url.pathname) && result.status < 300) {
      background(retryDueNotifications(deps.store, deps.config, deps.mail, deps.now()).catch(() => {
        deps.log('error', 'admission worker failed', { requestId });
      }));
    }
  } catch (error) {
    const api = error instanceof ApiError ? error : new ApiError(500, 'internal', 'Something went wrong');
    if (!(error instanceof ApiError)) deps.log('error', 'request failed', { requestId, name: error instanceof Error ? error.name : 'error' });
    const retryAfter = typeof api.extra?.retryAfter === 'number' ? api.extra.retryAfter : undefined;
    send(res, api.status, errorBody(api, requestId), requestId, undefined, retryAfter);
  }
}

async function dispatch(req: IncomingMessage & { body?: unknown }, url: URL, deps: AppDeps, requestId: string): Promise<{ status: number; body: unknown; etag?: string; retryAfter?: number }> {
  const method = (req.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/\/$/, '') || '/';
  const now = deps.now();
  if (method === 'GET' && path === '/api/health') {
    return { status: 200, body: { status: 'ok', service: 'domain-expansion', timestamp: now.toISOString() } };
  }
  if (method === 'GET' && path === '/api/openapi.json') return { status: 200, body: openApiDocument() };
  if (method === 'POST' && path === '/api/access/request') {
    const body = await readBody(req);
    return submitAccessRequest(deps.store, deps.config, deps.mail, body, clientIp(req), now);
  }
  if (method === 'POST' && path === '/api/auth/email-link') {
    const body = await readBody(req);
    return requestSignInLink(deps.store, deps.config, deps.mail, body, clientIp(req), now);
  }
  if (method === 'POST' && path === '/api/test/session') return testSession(req, deps, now);
  if (['POST', 'GET'].includes(method) && path === '/api/internal/notifications/retry') {
    const authorization = req.headers.authorization || '';
    const secret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!deps.config.notificationRetrySecret || secret !== deps.config.notificationRetrySecret) {
      throw new ApiError(401, 'unauthorized', 'Sign in to continue');
    }
    const source = method === 'GET' && header(req, 'user-agent') === 'vercel-cron/1.0' && header(req, 'x-vercel-cron-schedule') === RETRY_CRON_SCHEDULE ? 'vercel' : 'operator';
    const schedule = source === 'vercel' ? RETRY_CRON_SCHEDULE : null;
    return retryWithAudit(deps, requestId, source, schedule);
  }

  const actor = await authenticate(typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined, deps.store, deps.config, now);
  await consumeApiRate(deps.store, actor.uid, method === 'GET' ? 'read' : 'write', now);
  if (method === 'GET' && path === '/api/session') {
    return {
      status: 200,
      body: {
        uid: actor.uid,
        email: actor.email,
        role: actor.role,
        authKind: actor.authKind,
        scopes: actor.scopes,
        recentAuth: Math.floor(now.getTime() / 1000) - actor.authTime <= deps.config.recentAuthSeconds,
      },
    };
  }
  if (method === 'GET' && path === '/api/admin/requests') return listRequests(deps.store, actor);
  const adminDecision = path.match(/^\/api\/admin\/requests\/([^/]+)\/(approve|deny|resend-signin)$/);
  if (adminDecision && method === 'POST') {
    const [, id, action] = adminDecision;
    if (action === 'resend-signin') return resendApprovalMail(deps.store, deps.config, deps.mail, actor, id, now);
    return decideRequest(deps.store, deps.config, deps.mail, deps.directory, actor, id, action as 'approve' | 'deny', now);
  }
  const memberAction = path.match(/^\/api\/admin\/members\/([^/]+)\/(suspend|reinstate)$/);
  if (memberAction && method === 'POST') {
    return setMembership(deps.store, actor, decodeURIComponent(memberAction[1]), memberAction[2] === 'suspend' ? 'suspended' : 'approved', now);
  }
  const noteRetry = path.match(/^\/api\/admin\/notifications\/([^/]+)\/retry$/);
  if (noteRetry && method === 'POST') return retryNotification(deps.store, deps.config, deps.mail, actor, noteRetry[1], now);

  if (method === 'GET' && path === '/api/v1/domains') return listDomains(deps.store, actor, url.searchParams, deps.config.cursorSecret, await userToday(deps.store, actor, now));
  if (method === 'POST' && path === '/api/v1/domains') return createDomain(deps.store, actor, await readBody(req), header(req, 'idempotency-key'), now.toISOString());
  if (method === 'POST' && path === '/api/v1/domains/batch') {
    const body = (await readBody(req)) as { source?: string; records?: unknown[] };
    const limit = body?.source === 'ai' ? 25 : undefined;
    return batchCreate(deps.store, actor, body, header(req, 'idempotency-key'), now.toISOString(), limit);
  }
  if (method === 'GET' && path === '/api/v1/summary') return summarize(deps.store, actor, await userToday(deps.store, actor, now));
  if (method === 'GET' && path === '/api/v1/settings') return getSettings(deps.store, actor);
  if (method === 'PUT' && path === '/api/v1/settings') return putSettings(deps.store, actor, await readBody(req));
  if (method === 'POST' && path === '/api/v1/import/preview') return previewImport(deps.store, actor, await readBody(req), now);
  if (method === 'POST' && path === '/api/v1/import/commit') return commitImport(deps.store, actor, await readBody(req), header(req, 'idempotency-key'), now);
  if (method === 'GET' && path === '/api/v1/export') return exportData(deps.store, actor, url.searchParams);
  const integration = path.match(/^\/api\/v1\/domains\/([^/]+)\/integrations$/);
  if (integration && method === 'POST') {
    return updateIntegration(deps.store, actor, integration[1], await readBody(req), ifMatchHeader(req), now.toISOString());
  }
  const one = path.match(/^\/api\/v1\/domains\/([^/]+)$/);
  if (one && !['batch', 'preview', 'commit'].includes(one[1])) {
    if (method === 'GET') return getDomain(deps.store, actor, one[1]);
    if (method === 'PATCH') return patchDomain(deps.store, actor, one[1], await readBody(req), ifMatchHeader(req), now.toISOString());
    if (method === 'DELETE') return deleteDomain(deps.store, actor, one[1], ifMatchHeader(req));
  }
  if (method === 'GET' && path === '/api/tokens') return listTokens(deps, actor);
  if (method === 'POST' && path === '/api/tokens') return createToken(deps, actor, await readBody(req), now);
  const revoke = path.match(/^\/api\/tokens\/([^/]+)\/revoke$/);
  if (revoke && method === 'POST') return revokeToken(deps, actor, revoke[1], now);
  if (path === '/api/credentials/gemini') {
    if (method === 'GET') return getCredentialStatus(deps.store, deps.config, actor);
    if (method === 'PUT') return putCredential(deps.store, deps.config, actor, await readBody(req), ifMatchHeader(req), now);
    if (method === 'DELETE') return deleteCredential(deps.store, deps.config, actor, now);
  }
  if (method === 'POST' && path === '/api/ai/extract') return extractDrafts(deps.store, deps.config, deps.ai, actor, await readBody(req), now);
  throw new ApiError(404, 'not_found', 'Not found');
}

async function consumeApiRate(store: DocStore, uid: string, kind: 'read' | 'write', now: Date): Promise<void> {
  const limit = kind === 'read' ? 120 : 60;
  const windowMs = 60_000;
  const path = `rateLimits/${sha256Hex(`api:${uid}:${kind}`)}`;
  await store.transaction(async (tx) => {
    const current = await tx.get<{ count: number; windowStart: number }>(path);
    if (!current || now.getTime() - current.windowStart >= windowMs) {
      tx.set(path, { count: 1, windowStart: now.getTime() });
      return;
    }
    if (current.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((current.windowStart + windowMs - now.getTime()) / 1000));
      throw new ApiError(429, 'rate_limited', 'Too many requests. Try again later.', { retryable: true, extra: { retryAfter } });
    }
    tx.set(path, { count: current.count + 1, windowStart: current.windowStart });
  });
}

async function testSession(req: IncomingMessage & { body?: unknown }, deps: AppDeps, now: Date) {
  if (!deps.config.testAuth) throw new ApiError(404, 'not_found', 'Not found');
  const body = (await readBody(req)) as { uid?: string; email?: string; role?: 'member' | 'admin'; authTime?: number; emailVerified?: boolean };
  if (!body.uid || !body.email) throw new ApiError(400, 'invalid_body', 'uid and email are required');
  const role = body.role === 'admin' ? 'admin' : 'member';
  await deps.store.transaction(async (tx) => {
    const existing = await tx.get<MemberDoc>(memberPath(body.uid!));
    if (!existing) {
      tx.set(memberPath(body.uid!), { status: 'approved', role, email: body.email!, createdAt: now.toISOString() } satisfies MemberDoc);
    }
  });
  const token = signTestToken(deps.config, {
    uid: body.uid,
    email: body.email,
    emailVerified: body.emailVerified !== false,
    authTime: body.authTime ?? Math.floor(now.getTime() / 1000),
    projectId: deps.config.projectId,
  });
  return { status: 200, body: { token } };
}

async function listTokens(deps: AppDeps, actor: Parameters<typeof requireSession>[0]) {
  requireSession(actor);
  const rows = await deps.store.list<TokenDoc>(`users/${actor.uid}/apiTokens/`);
  return { status: 200, body: { tokens: rows.map((row) => publicToken(row.data)) } };
}

async function createToken(deps: AppDeps, actor: Parameters<typeof requireSession>[0], body: unknown, now: Date) {
  requireSession(actor);
  requireRecent(actor, deps.config, now);
  const input = body as { name?: string; scopes?: Scope[]; expiresInDays?: number };
  const name = (input.name || '').trim();
  if (!name || name.length > 80) throw new ApiError(422, 'invalid_token', 'Name the token');
  const scopes = input.scopes?.length ? input.scopes : (['domains:read', 'domains:write'] as Scope[]);
  if (scopes.some((scope) => !SCOPES.includes(scope)) || new Set(scopes).size !== scopes.length) {
    throw new ApiError(422, 'invalid_token', 'Choose read, write, and delete scopes independently');
  }
  const days = input.expiresInDays ?? 90;
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError(422, 'invalid_token', 'Expiration must be between 1 and 365 days');
  const expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString();
  const issued = issuePat(actor.uid, name, scopes, expiresAt, now.toISOString());
  await deps.store.transaction(async (tx) => {
    tx.set(tokenPath(actor.uid, issued.doc.id), issued.doc);
  });
  return { status: 201, body: { token: issued.token, tokenRecord: publicToken(issued.doc) } };
}

async function revokeToken(deps: AppDeps, actor: Parameters<typeof requireSession>[0], id: string, now: Date) {
  requireSession(actor);
  requireRecent(actor, deps.config, now);
  await deps.store.transaction(async (tx) => {
    const current = await tx.get<TokenDoc>(tokenPath(actor.uid, id));
    if (!current) throw new ApiError(404, 'not_found', 'Not found');
    tx.set(tokenPath(actor.uid, id), { ...current, revokedAt: now.toISOString() });
  });
  return { status: 200, body: { id, revoked: true } };
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function ifMatchHeader(req: IncomingMessage): string | undefined {
  return header(req, 'if-match') ?? header(req, FORWARDED_IF_MATCH_HEADER);
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY) throw new ApiError(413, 'payload_limit', 'Request body is too large');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'invalid_body', 'Request body must be JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown, requestId: string, etag?: string, retryAfter?: number) {
  res.statusCode = status;
  res.setHeader('cache-control', 'no-store');
  res.setHeader('vercel-cdn-cache-control', 'no-store');
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  if (etag) res.setHeader('etag', etag);
  if (retryAfter) res.setHeader('retry-after', String(retryAfter));
  if (status === 204 || body === null) {
    res.end();
    return;
  }
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function prepareDeps(deps: AppDeps): Promise<void> {
  await bootstrapOwner(deps.store, deps.config, deps.now().toISOString());
}

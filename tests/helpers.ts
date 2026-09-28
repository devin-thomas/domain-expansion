import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { devKeyring, loadConfig, type Config } from '../server/config';
import { createApp, createDeps } from '../server/createApp';
import type { AppDeps } from '../server/http';
import type { AiGenerateRequest, AiGenerateResult, MailPort } from '../server/ports';
import { MemoryStore } from '../server/store';

export interface TestHarness {
  base: string;
  config: Config;
  deps: AppDeps;
  mail: MailPort & { alerts: unknown[]; signIns: string[] };
  aiCalls: AiGenerateRequest[];
  setAi: (handler: (request: AiGenerateRequest) => Promise<AiGenerateResult>) => void;
  close: () => Promise<void>;
}

export async function startHarness(options: { ai?: (request: AiGenerateRequest) => Promise<AiGenerateResult>; now?: Date; ownerUid?: string | null } = {}): Promise<TestHarness> {
  const keyring = devKeyring();
  const config = loadConfig({
    APP_ENV: 'test',
    DOMAIN_EXPANSION_TEST_AUTH: '1',
    TEST_AUTH_SECRET: 'test-secret',
    FIREBASE_PROJECT_ID: 'demo-domain-expansion',
    DATA_STORE: 'memory',
    BYOK_KEYRING: keyring.json,
    BYOK_KEY_ID: keyring.id,
    OWNER_UID: options.ownerUid === undefined ? 'owner-1' : options.ownerUid || '',
    OWNER_EMAIL: 'owner@example.com',
    ADMIN_NOTIFICATION_EMAIL: 'admin@example.com',
    RESEND_API_KEY: 're_test',
    RESEND_FROM: 'Domain Expansion <notify@example.com>',
    APP_ORIGIN: 'http://127.0.0.1:3000',
    ALLOWED_ORIGINS: 'http://127.0.0.1:3000,http://localhost:3000',
    AUTH_CONTINUE_URL: 'http://127.0.0.1:3000/auth/finish',
    NOTIFICATION_RETRY_SECRET: 'retry-secret',
    CURSOR_SECRET: 'cursor-test',
    OWNER_GEMINI_API_KEY: 'owner-gemini-key-value',
    FIREBASE_WEB_API_KEY: 'test-web-key',
  });
  const alerts: unknown[] = [];
  const signIns: string[] = [];
  const mail: TestHarness['mail'] = {
    alerts,
    signIns,
    async sendSignIn(email: string) {
      signIns.push(email);
      return { ok: true, retryable: false };
    },
    async sendAdminAlert(input: unknown) {
      alerts.push(input);
      return { ok: true, retryable: false, id: 'email_1' };
    },
  };
  const aiCalls: AiGenerateRequest[] = [];
  let handler = options.ai;
  const deps = await createDeps({
    config,
    store: new MemoryStore(),
    mail,
    now: () => options.now ?? new Date('2026-03-01T15:00:00Z'),
    ai: {
      async generate(request) {
        aiCalls.push({ ...request, apiKey: request.apiKey });
        if (!handler) return { ok: true, text: JSON.stringify({ drafts: [] }), truncated: false };
        return handler(request);
      },
    },
    log: () => undefined,
  });
  const app = createApp(deps);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    config,
    deps,
    mail,
    aiCalls,
    setAi(next) {
      handler = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export async function session(base: string, input: { uid: string; email: string; role?: 'member' | 'admin'; authTime?: number; emailVerified?: boolean }) {
  const response = await fetch(`${base}/api/test/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body.token as string;
}

export async function call(base: string, token: string | undefined, method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { origin: 'http://127.0.0.1:3000', ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

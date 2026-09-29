import type { AiPort, IdentityDirectory, MailPort } from './ports';
import type { Config } from './config';

const MAIL_REQUEST_TIMEOUT_MS = 8_000;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    const milliseconds = seconds * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

interface FirebaseUserLookup {
  getUserByEmail(email: string): Promise<{ uid: string }>;
  createUser(input: { email: string; emailVerified: false }): Promise<{ uid: string }>;
}

export async function resolveFirebaseUser(auth: FirebaseUserLookup, email: string): Promise<{ uid: string; emailVerified: false }> {
  try {
    const user = await auth.getUserByEmail(email);
    return { uid: user.uid, emailVerified: false };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({ email, emailVerified: false });
    return { uid: created.uid, emailVerified: false };
  }
}

async function fetchWithMailTimeout(input: string | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAIL_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createMemoryDirectory(): IdentityDirectory & { users: { email: string; uid: string; emailVerified: false }[] } {
  const users: { email: string; uid: string; emailVerified: false }[] = [];
  return {
    users,
    async resolve(email: string) {
      const found = users.find((user) => user.email === email);
      if (found) return { uid: found.uid, emailVerified: false as const };
      const created = { email, uid: `uid_${email.replace(/[^a-z0-9]/g, '_').slice(0, 40)}`, emailVerified: false as const };
      users.push(created);
      return { uid: created.uid, emailVerified: false };
    },
  };
}

export function createAdminDirectory(): IdentityDirectory {
  return {
    async resolve(email: string) {
      const admin = await import('firebase-admin');
      if (admin.apps.length === 0) admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
      return resolveFirebaseUser(admin.auth(), email);
    },
  };
}

export function createLiveMail(config: Config): MailPort {
  return {
    async sendSignIn(email, continueUrl) {
      if (!config.firebaseWebApiKey) return { ok: false, retryable: true, detail: 'Firebase web API key is not configured' };
      const allowed = new URL(continueUrl);
      if (!config.allowedOrigins.includes(allowed.origin) && allowed.origin !== new URL(config.appOrigin).origin) {
        return { ok: false, retryable: false, detail: 'Continue URL is not allowlisted' };
      }
      try {
        const response = await fetchWithMailTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(config.firebaseWebApiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl, canHandleCodeInApp: true }),
        });
        if (!response.ok) {
          const retryable = response.status >= 500 || response.status === 429;
          return { ok: false, retryable, detail: `Sign-in email was not accepted (${response.status})` };
        }
        return { ok: true, retryable: false };
      } catch {
        return { ok: false, retryable: true, detail: 'Sign-in email could not be sent' };
      }
    },
    async sendAdminAlert(input) {
      if (!config.resendApiKey) return { ok: false, retryable: true, detail: 'Resend is not configured' };
      try {
        const response = await fetchWithMailTimeout('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.resendApiKey}`,
            'content-type': 'application/json',
            'idempotency-key': input.idempotencyKey,
          },
          body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
        });
        if (!response.ok) return { ok: false, retryable: response.status >= 500 || response.status === 429, detail: `Notification was not accepted (${response.status})` };
        const json = (await response.json()) as { id?: string };
        return { ok: true, retryable: false, id: json.id };
      } catch {
        return { ok: false, retryable: true, detail: 'Notification could not be sent' };
      }
    },
  };
}

export function createGeminiPort(): AiPort {
  return {
    async generate(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: request.system }] },
              contents: [{ role: 'user', parts: [{ text: request.user }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                maxOutputTokens: 8192,
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    drafts: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          name: { type: 'STRING', nullable: true },
                          registrar: { type: 'STRING', nullable: true },
                          expirationMonth: { type: 'INTEGER', nullable: true },
                          expirationDay: { type: 'INTEGER', nullable: true },
                          expirationYear: { type: 'INTEGER', nullable: true },
                          expirationYearInferred: { type: 'BOOLEAN' },
                          billingDate: { type: 'STRING', nullable: true },
                          renewalCostMinor: { type: 'INTEGER', nullable: true },
                          currency: { type: 'STRING', nullable: true },
                          renewalIntent: { type: 'STRING', nullable: true },
                          warnings: { type: 'ARRAY', items: { type: 'STRING' } },
                        },
                        required: ['name', 'registrar', 'expirationMonth', 'expirationDay', 'expirationYear', 'expirationYearInferred', 'billingDate', 'renewalCostMinor', 'currency', 'renewalIntent', 'warnings'],
                      },
                    },
                  },
                  required: ['drafts'],
                },
              },
            }),
          },
        );
        if (!response.ok) {
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          if (response.status === 401 || response.status === 403) return { ok: false, kind: 'auth', status: response.status };
          if (response.status === 429) return { ok: false, kind: 'throttle', status: 429, retryAfterMs: retryAfter && retryAfter > 0 ? retryAfter : undefined };
          if (response.status === 402 || response.status === 400) {
            const kind = response.status === 402 ? 'billing' : 'bad';
            return { ok: false, kind, status: response.status };
          }
          if (response.status >= 500) return { ok: false, kind: 'upstream', status: response.status };
          return { ok: false, kind: 'bad', status: response.status };
        }
        const json = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
        const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
        const truncated = json.candidates?.[0]?.finishReason === 'MAX_TOKENS';
        return { ok: true, text, truncated };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return { ok: false, kind: 'timeout', status: 504 };
        return { ok: false, kind: 'upstream', status: 503 };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function scrubLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/dew1\.[A-Za-z0-9._~-]+/g, '[token]')
      .replace(/test\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[session]')
      .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[key]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  }
  if (Array.isArray(value)) return value.map(scrubLog);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (/authorization|token|api.?key|secret|password|prompt|ciphertext|oob|cookie/i.test(key)) return [key, '[redacted]'];
        return [key, scrubLog(item)];
      }),
    );
  }
  return value;
}


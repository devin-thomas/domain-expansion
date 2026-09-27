export interface MailResult {
  ok: boolean;
  retryable: boolean;
  id?: string;
  detail?: string;
}

export interface MailPort {
  sendSignIn(email: string, continueUrl: string): Promise<MailResult>;
  sendAdminAlert(input: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  }): Promise<MailResult>;
}

export interface AiGenerateRequest {
  model: string;
  apiKey: string;
  system: string;
  user: string;
  timeoutMs: number;
}

export type AiGenerateResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; kind: 'timeout' | 'throttle' | 'upstream' | 'auth' | 'billing' | 'bad'; status: number; retryAfterMs?: number };

export interface AiPort {
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

export interface IdentityDirectory {
  resolve(email: string): Promise<{ uid: string; emailVerified: false }>;
}

export interface LogSink {
  (level: 'info' | 'error', message: string, fields?: Record<string, unknown>): void;
}

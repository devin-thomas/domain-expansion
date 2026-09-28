import { createHash, randomBytes } from 'node:crypto';

export interface Config {
  environmentName: string;
  projectId: string;
  ownerUid: string | null;
  ownerEmail: string | null;
  adminNotificationEmail: string | null;
  resendApiKey: string | null;
  resendFrom: string | null;
  appOrigin: string;
  allowedOrigins: string[];
  authContinueUrl: string;
  firebaseWebApiKey: string | null;
  byokKeys: Record<string, Buffer>;
  byokCurrentKeyId: string | null;
  ownerGeminiApiKey: string | null;
  geminiPrimaryModel: string;
  geminiFallbackModel: string;
  testAuth: boolean;
  testAuthSecret: string;
  notificationRetrySecret: string | null;
  cursorSecret: string;
  dataStore: 'memory' | 'firestore';
  aiPerMinute: number;
  aiDaily: number;
  recentAuthSeconds: number;
}

function flag(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const environmentName = env.APP_ENV || env.NODE_ENV || 'development';
  const testRequested = flag(env.DOMAIN_EXPANSION_TEST_AUTH);
  const deployed = env.NODE_ENV === 'production' || Boolean(env.VERCEL_ENV);
  if (testRequested && (environmentName === 'production' || deployed)) {
    throw new Error('DOMAIN_EXPANSION_TEST_AUTH cannot be enabled in a deployed environment');
  }
  if ((environmentName === 'production' || deployed) && env.DATA_STORE !== 'firestore') {
    throw new Error('Production requires DATA_STORE=firestore');
  }
  const appOrigin = (env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
  const allowed = (env.ALLOWED_ORIGINS || `${appOrigin},http://127.0.0.1:3000,https://domains.devthomas.site`)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const keyring = parseKeyring(env.BYOK_KEYRING);
  const current = env.BYOK_KEY_ID || null;
  if (current && !keyring[current]) {
    throw new Error('BYOK_KEY_ID is not present in BYOK_KEYRING');
  }
  const cursorSecret = env.CURSOR_SECRET || createHash('sha256').update(`dev-cursor:${environmentName}`).digest('hex');
  return {
    environmentName,
    projectId: env.FIREBASE_PROJECT_ID || 'demo-domain-expansion',
    ownerUid: env.OWNER_UID || null,
    ownerEmail: env.OWNER_EMAIL || null,
    adminNotificationEmail: env.ADMIN_NOTIFICATION_EMAIL || null,
    resendApiKey: env.RESEND_API_KEY || null,
    resendFrom: env.RESEND_FROM || null,
    appOrigin,
    allowedOrigins: allowed,
    authContinueUrl: env.AUTH_CONTINUE_URL || `${appOrigin}/auth/finish`,
    firebaseWebApiKey: env.FIREBASE_WEB_API_KEY || null,
    byokKeys: keyring,
    byokCurrentKeyId: current,
    ownerGeminiApiKey: env.OWNER_GEMINI_API_KEY || null,
    geminiPrimaryModel: env.GEMINI_PRIMARY_MODEL || 'gemini-3.5-flash-lite',
    geminiFallbackModel: env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash',
    testAuth: testRequested,
    testAuthSecret: env.TEST_AUTH_SECRET || 'test-only-secret',
    notificationRetrySecret: env.NOTIFICATION_RETRY_SECRET || null,
    cursorSecret,
    dataStore: env.DATA_STORE === 'firestore' ? 'firestore' : 'memory',
    aiPerMinute: Number(env.AI_PER_MINUTE || 10),
    aiDaily: Number(env.AI_DAILY_LIMIT || 100),
    recentAuthSeconds: Number(env.RECENT_AUTH_SECONDS || 600),
  };
}

export function parseKeyring(raw: string | undefined): Record<string, Buffer> {
  if (!raw) return {};
  const parsed = JSON.parse(raw) as Record<string, string>;
  const keys: Record<string, Buffer> = {};
  for (const [id, value] of Object.entries(parsed)) {
    const buffer = Buffer.from(value, 'base64');
    if (buffer.length !== 32) throw new Error(`BYOK key ${id} must be 32 bytes`);
    keys[id] = buffer;
  }
  return keys;
}

export function devKeyring(): { json: string; id: string } {
  const key = randomBytes(32).toString('base64');
  return { json: JSON.stringify({ v1: key }), id: 'v1' };
}

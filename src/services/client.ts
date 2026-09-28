import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, isSignInWithEmailLink, onAuthStateChanged, signInWithEmailLink, signOut, type User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { formatMinor, parseMoneyInput, type Currency } from '../../shared/domain';

const EMAIL_KEY = 'domain-expansion-email-for-sign-in';

export const firebasePublicConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
};

const app = getApps().length === 0 ? initializeApp(firebasePublicConfig) : getApp();
export const auth = getAuth(app);

let memoryToken: string | null = null;

export function getMemoryToken(): string | null {
  return memoryToken;
}

export function setMemoryToken(token: string | null): void {
  memoryToken = token;
}

export function rememberSignInEmail(email: string): void {
  sessionStorage.setItem(EMAIL_KEY, email);
}

export function storedSignInEmail(): string | null {
  return sessionStorage.getItem(EMAIL_KEY);
}

export function clearSignInEmail(): void {
  sessionStorage.removeItem(EMAIL_KEY);
}

export async function completeEmailLink(email: string): Promise<User> {
  const userCredential = await signInWithEmailLink(auth, email, window.location.href);
  clearSignInEmail();
  window.history.replaceState({}, document.title, '/');
  return userCredential.user;
}

export function linkInLocation(): boolean {
  return isSignInWithEmailLink(auth, window.location.href);
}

export function watchAuth(onUser: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onUser);
}

export async function signOutSession(): Promise<void> {
  memoryToken = null;
  clearSignInEmail();
  await signOut(auth);
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  existingId?: string;
  constructor(status: number, code: string, message: string, retryable = false, existingId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.existingId = existingId;
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; idempotencyKey?: string; ifMatch?: string } = {}): Promise<{ data: T; etag: string | null }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = memoryToken?.startsWith('test.') ? memoryToken : auth.currentUser ? await auth.currentUser.getIdToken() : memoryToken;
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  if (options.ifMatch) headers['if-match'] = options.ifMatch;
  const response = await fetch(path, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return { data: undefined as T, etag: response.headers.get('etag') };
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(response.status, data?.error?.code || 'request_failed', data?.error?.message || 'The change was not saved', Boolean(data?.error?.retryable), data?.error?.existingId);
  }
  return { data: data as T, etag: response.headers.get('etag') };
}

export function moneyOrNull(raw: string, currency: Currency): number | null {
  return parseMoneyInput(raw, currency);
}

export function showMoney(minor: number | null, currency: Currency): string {
  return formatMinor(minor, currency);
}

export function minorToField(minor: number | null, currency: Currency): string {
  if (minor === null) return '';
  if (currency === 'JPY') return String(minor);
  return (minor / 100).toFixed(2);
}

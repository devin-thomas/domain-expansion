import { MAX_INPUT_BYTES, type DomainRecord, type ReminderConfig, type RenewalIntent } from '../../shared/domain';

const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.events.owned',
  tasks: 'https://www.googleapis.com/auth/tasks',
  sheets: 'https://www.googleapis.com/auth/drive.file',
  driveFile: 'https://www.googleapis.com/auth/drive.file',
} as const;

export type GoogleAction = keyof typeof SCOPES;

interface TokenResponse {
  access_token?: string;
  error?: string;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            include_granted_scopes: boolean;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type: string }) => void;
          }) => { requestAccessToken: (options?: { prompt?: string }) => void };
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Google authorization could not load. Domain Expansion sign-in is unaffected.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function googleConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID);
}

export async function connectGoogle(action: GoogleAction): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error('Google integrations are not configured. Domain saves are unaffected.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES[action],
      include_granted_scopes: false,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error('Google did not grant access for this integration.'));
      },
      error_callback: () => reject(new Error('Google authorization was cancelled or denied. Domain Expansion sign-in is unaffected.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

interface ReconcileResult {
  id: string | null;
  uncertain: boolean;
}

export type GoogleSessionGuard = () => boolean;

function assertGoogleSession(guard?: GoogleSessionGuard): void {
  if (guard && !guard()) throw new Error('The signed-in account changed during Google authorization. The action was canceled.');
}

function isSessionChange(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('The signed-in account changed');
}

function reconnectError(action: string): Error {
  return new Error(`Google ${action} access is unavailable. Reconnect for this action if access expired, or check the Google API permission; your domain data is unchanged.`);
}

async function calendarLookup(accessToken: string, date: string, reconcileKey: string, guard?: GoogleSessionGuard): Promise<ReconcileResult> {
  const params = new URLSearchParams({
    privateExtendedProperty: `domainExpansionKey=${reconcileKey}`,
    timeMin: `${date}T00:00:00Z`,
    timeMax: `${date}T23:59:59Z`,
    maxResults: '250',
  });
  let pageToken: string | undefined;
  let pageCount = 0;
  const visitedTokens = new Set<string>();
  try {
    do {
      assertGoogleSession(guard);
      pageCount += 1;
      if (pageCount > 200) return { id: null, uncertain: true };
      if (pageToken) params.set('pageToken', pageToken);
      const listed = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      assertGoogleSession(guard);
      if (listed.status === 401 || listed.status === 403) throw reconnectError('Calendar');
      if (!listed.ok) return { id: null, uncertain: true };
      const page = (await listed.json()) as { items?: { id: string }[]; nextPageToken?: string };
      assertGoogleSession(guard);
      const found = page.items?.[0]?.id;
      if (found) return { id: found, uncertain: false };
      pageToken = page.nextPageToken;
      if (pageToken && visitedTokens.has(pageToken)) return { id: null, uncertain: true };
      if (pageToken) visitedTokens.add(pageToken);
    } while (pageToken);
    return { id: null, uncertain: false };
  } catch (error) {
    if (isSessionChange(error)) throw error;
    if (error instanceof Error && error.message.startsWith('Google Calendar access')) throw error;
    return { id: null, uncertain: true };
  }
}

async function deterministicCalendarId(reconcileKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reconcileKey));
  return `de${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function createCalendarEvent(accessToken: string, title: string, date: string, reconcileKey: string, guard?: GoogleSessionGuard): Promise<{ id: string; uncertain: boolean; alreadyExisted: boolean }> {
  assertGoogleSession(guard);
  const existing = await calendarLookup(accessToken, date, reconcileKey, guard);
  assertGoogleSession(guard);
  if (existing.uncertain) return { id: '', uncertain: true, alreadyExisted: false };
  if (existing.id) return { id: existing.id, uncertain: false, alreadyExisted: true };

  const [year, month, day] = date.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const id = await deterministicCalendarId(reconcileKey);
  assertGoogleSession(guard);
  let created: Response | null = null;
  try {
    created = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        summary: title,
        start: { date },
        end: { date: end },
        extendedProperties: { private: { domainExpansionKey: reconcileKey } },
      }),
    });
  } catch {
    assertGoogleSession(guard);
    const retryLookup = await calendarLookup(accessToken, date, reconcileKey, guard);
    if (retryLookup.id) return { id: retryLookup.id, uncertain: false, alreadyExisted: true };
    return { id: '', uncertain: true, alreadyExisted: false };
  }

  assertGoogleSession(guard);

  if (created.ok) {
    try {
      const event = (await created.json()) as { id?: string };
      assertGoogleSession(guard);
      return { id: event.id ?? id, uncertain: false, alreadyExisted: false };
    } catch {
      assertGoogleSession(guard);
      const retryLookup = await calendarLookup(accessToken, date, reconcileKey, guard);
      if (retryLookup.id) return { id: retryLookup.id, uncertain: false, alreadyExisted: true };
      return { id: '', uncertain: true, alreadyExisted: false };
    }
  }
  if (created.status === 401 || created.status === 403) throw reconnectError('Calendar');
  if (created.status === 409 || created.status >= 500) {
    assertGoogleSession(guard);
    const retryLookup = await calendarLookup(accessToken, date, reconcileKey, guard);
    if (retryLookup.id) return { id: retryLookup.id, uncertain: false, alreadyExisted: true };
    return { id: '', uncertain: true, alreadyExisted: false };
  }
  throw new Error('Google Calendar rejected the event. No event was confirmed; your domain data is unchanged.');
}

function taskMarker(reconcileKey: string): string {
  return `domainExpansionKey:${reconcileKey}`;
}

async function tasksLookup(accessToken: string, reconcileKey: string, guard?: GoogleSessionGuard): Promise<ReconcileResult> {
  let pageToken: string | undefined;
  let pageCount = 0;
  const visitedTokens = new Set<string>();
  try {
    do {
      assertGoogleSession(guard);
      pageCount += 1;
      if (pageCount > 200) return { id: null, uncertain: true };
      const params = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', maxResults: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const listed = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?${params}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      assertGoogleSession(guard);
      if (listed.status === 401 || listed.status === 403) throw reconnectError('Tasks');
      if (!listed.ok) return { id: null, uncertain: true };
      const page = (await listed.json()) as { items?: { id: string; notes?: string }[]; nextPageToken?: string };
      assertGoogleSession(guard);
      const marker = taskMarker(reconcileKey);
      const found = page.items?.find((task) => task.notes?.split(/\r?\n/).some((line) => line === marker));
      if (found) return { id: found.id, uncertain: false };
      pageToken = page.nextPageToken;
      if (pageToken && visitedTokens.has(pageToken)) return { id: null, uncertain: true };
      if (pageToken) visitedTokens.add(pageToken);
    } while (pageToken);
    return { id: null, uncertain: false };
  } catch (error) {
    if (isSessionChange(error)) throw error;
    if (error instanceof Error && error.message.startsWith('Google Tasks access')) throw error;
    return { id: null, uncertain: true };
  }
}

async function createTaskUnlocked(accessToken: string, title: string, date: string, reconcileKey: string, guard?: GoogleSessionGuard): Promise<{ id: string; uncertain: boolean; alreadyExisted: boolean }> {
  assertGoogleSession(guard);
  const existing = await tasksLookup(accessToken, reconcileKey, guard);
  assertGoogleSession(guard);
  if (existing.uncertain) return { id: '', uncertain: true, alreadyExisted: false };
  if (existing.id) return { id: existing.id, uncertain: false, alreadyExisted: true };

  let created: Response | null = null;
  try {
    assertGoogleSession(guard);
    created = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title, due: `${date}T00:00:00.000Z`, notes: taskMarker(reconcileKey) }),
    });
  } catch {
    assertGoogleSession(guard);
    const retryLookup = await tasksLookup(accessToken, reconcileKey, guard);
    if (retryLookup.id) return { id: retryLookup.id, uncertain: false, alreadyExisted: true };
    return { id: '', uncertain: true, alreadyExisted: false };
  }
  assertGoogleSession(guard);
  if (created.ok) {
    try {
      const task = (await created.json()) as { id: string };
      assertGoogleSession(guard);
      return { id: task.id, uncertain: false, alreadyExisted: false };
    } catch {
      assertGoogleSession(guard);
      const retryLookup = await tasksLookup(accessToken, reconcileKey, guard);
      if (retryLookup.id) return { id: retryLookup.id, uncertain: false, alreadyExisted: true };
      return { id: '', uncertain: true, alreadyExisted: false };
    }
  }
  if (created.status === 401 || created.status === 403) throw reconnectError('Tasks');
  if (created.status >= 500) {
    assertGoogleSession(guard);
    const retryLookup = await tasksLookup(accessToken, reconcileKey, guard);
    if (retryLookup.id) return { id: retryLookup.id, uncertain: false, alreadyExisted: true };
    return { id: '', uncertain: true, alreadyExisted: false };
  }
  throw new Error('Google Tasks rejected the reminder. No task was confirmed; your domain data is unchanged.');
}

export async function createTask(accessToken: string, title: string, date: string, reconcileKey: string, guard?: GoogleSessionGuard): Promise<{ id: string; uncertain: boolean; alreadyExisted: boolean }> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(`domain-expansion-task:${reconcileKey}`, { mode: 'exclusive' }, () => createTaskUnlocked(accessToken, title, date, reconcileKey, guard));
  }
  return createTaskUnlocked(accessToken, title, date, reconcileKey, guard);
}

export const SHEET_DOMAIN_COLUMNS = [
  'name', 'registrar', 'dnsProvider', 'ownership', 'lifecycle', 'renewalIntent', 'autoRenew',
  'registrationDate', 'billingDate', 'expirationDate', 'registrationCostMinor', 'renewalCostMinor',
  'purchaseEmail', 'paymentMethod', 'currency', 'notes', 'isArchived',
  'remindersEnabled', 'reminderTarget', 'reminderOffsets',
] as const;

export function domainSheetRows(domains: DomainRecord[]): string[][] {
  return [
    [...SHEET_DOMAIN_COLUMNS],
    ...domains.map((domain) => [
      domain.name,
      domain.registrar ?? '',
      domain.dnsProvider ?? '',
      domain.ownership,
      domain.lifecycle,
      domain.renewalIntent,
      domain.autoRenew === null ? '' : String(domain.autoRenew),
      domain.registrationDate ?? '',
      domain.billingDate ?? '',
      domain.expirationDate ?? '',
      domain.registrationCostMinor === null ? '' : String(domain.registrationCostMinor),
      domain.renewalCostMinor === null ? '' : String(domain.renewalCostMinor),
      domain.purchaseEmail ?? '',
      domain.paymentMethod ?? '',
      domain.currency,
      domain.notes,
      String(domain.isArchived),
      String(domain.reminders.enabled),
      domain.reminders.target,
      domain.reminders.offsets.join(' '),
    ]),
  ];
}

export async function exportSheet(accessToken: string, rows: string[][], guard?: GoogleSessionGuard): Promise<string> {
  assertGoogleSession(guard);
  const created = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ properties: { title: `Domain Expansion ${new Date().toISOString().slice(0, 10)}` } }),
  });
  if (!created.ok) throw new Error('Google Sheets export failed. Local records were not changed.');
  const sheet = (await created.json()) as { spreadsheetId: string; spreadsheetUrl: string };
  assertGoogleSession(guard);
  const updated = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/A1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!updated.ok) throw new Error('Google Sheets export failed. Local records were not changed.');
  return sheet.spreadsheetUrl;
}

export async function backupToDrive(accessToken: string, filename: string, content: string, guard?: GoogleSessionGuard): Promise<string> {
  assertGoogleSession(guard);
  const metadata = { name: filename, mimeType: 'application/json' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: form,
  });
  assertGoogleSession(guard);
  if (response.status === 401 || response.status === 403) throw reconnectError('Drive');
  if (!response.ok) throw new Error('Drive backup was not created. Domain records were not changed.');
  const file = (await response.json()) as { name: string };
  assertGoogleSession(guard);
  return file.name;
}

export async function listDriveBackups(accessToken: string, guard?: GoogleSessionGuard): Promise<DriveBackupFile[]> {
  const files: DriveBackupFile[] = [];
  let pageToken: string | undefined;
  const visitedTokens = new Set<string>();
  do {
    assertGoogleSession(guard);
    const params = new URLSearchParams({
      q: "mimeType='application/json' and trashed=false and name contains 'domain-expansion-'",
      orderBy: 'createdTime desc',
      pageSize: '100',
      fields: 'files(id,name,createdTime,mimeType),nextPageToken',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assertGoogleSession(guard);
    if (response.status === 401 || response.status === 403) throw reconnectError('Drive');
    if (!response.ok) throw new Error('Drive backups could not be listed. Domain records were not changed.');
    const page = (await response.json()) as { files?: DriveBackupFile[]; nextPageToken?: string };
    assertGoogleSession(guard);
    files.push(...(page.files ?? []).filter((file) => typeof file.id === 'string'
      && typeof file.name === 'string'
      && typeof file.createdTime === 'string'
      && /^domain-expansion-\d{4}-\d{2}-\d{2}\.json$/.test(file.name)));
    pageToken = page.nextPageToken;
    if (pageToken && visitedTokens.has(pageToken)) throw new Error('Drive returned a repeated page token. Try again later.');
    if (pageToken) visitedTokens.add(pageToken);
  } while (pageToken);
  return files;
}

export async function downloadDriveBackup(accessToken: string, fileId: string, guard?: GoogleSessionGuard): Promise<string> {
  assertGoogleSession(guard);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assertGoogleSession(guard);
  if (response.status === 401 || response.status === 403) throw reconnectError('Drive');
  if (!response.ok) throw new Error('The selected Drive backup could not be downloaded. Domain records were not changed.');
  const size = Number(response.headers.get('content-length') ?? 0);
  if (size > MAX_INPUT_BYTES) throw new Error('The selected Drive backup exceeds the 2 MiB import limit.');
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    assertGoogleSession(guard);
    if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) throw new Error('The selected Drive backup exceeds the 2 MiB import limit.');
    return text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    if (guard && !guard()) {
      await reader.cancel();
      assertGoogleSession(guard);
    }
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INPUT_BYTES) {
      await reader.cancel();
      throw new Error('The selected Drive backup exceeds the 2 MiB import limit.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The selected Drive backup is not valid UTF-8 JSON.');
  }
}

export function plannedReminderDates(reminders: ReminderConfig, anchor: string): { offset: number; date: string }[] {
  if (!reminders.enabled) return [];
  return [...new Set(reminders.offsets)].sort((left, right) => right - left).map((offset) => {
    const [year, month, day] = anchor.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10);
    return { offset, date };
  });
}

export function reminderTitle(name: string, intent: RenewalIntent, offset: number): string {
  const action = intent === 'let_expire' ? `Review expiration of ${name}` : `Renew ${name}`;
  return offset === 0 ? action : `${action} (${offset} day${offset === 1 ? '' : 's'} before)`;
}

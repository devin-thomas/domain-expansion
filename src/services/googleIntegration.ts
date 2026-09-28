const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.events',
  tasks: 'https://www.googleapis.com/auth/tasks',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  driveFile: 'https://www.googleapis.com/auth/drive.file',
} as const;

export type GoogleAction = keyof typeof SCOPES;

interface TokenResponse {
  access_token?: string;
  error?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
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
    script.onerror = () => reject(new Error('Google sign-in library failed to load'));
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
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error('Google did not grant access for this integration.'));
      },
      error_callback: () => reject(new Error('Google authorization was cancelled or denied. Domain saves are unaffected.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export async function createCalendarEvent(accessToken: string, title: string, date: string, reconcileKey: string): Promise<{ id: string; uncertain: boolean; alreadyExisted: boolean }> {
  const listed = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=domainExpansionKey%3D${encodeURIComponent(reconcileKey)}&timeMin=${date}T00:00:00Z&timeMax=${date}T23:59:59Z`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!listed.ok) return { id: '', uncertain: true, alreadyExisted: false };
  const existing = (await listed.json()) as { items?: { id: string }[] };
  if (existing.items?.[0]?.id) return { id: existing.items[0].id, uncertain: false, alreadyExisted: true };
  const [year, month, day] = date.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const created = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: title,
      start: { date },
      end: { date: end },
      extendedProperties: { private: { domainExpansionKey: reconcileKey } },
    }),
  });
  if (!created.ok) throw new Error('Calendar did not accept the event. The domain record was not changed.');
  const event = (await created.json()) as { id: string };
  return { id: event.id, uncertain: false, alreadyExisted: false };
}

export async function createTask(accessToken: string, title: string, date: string, reconcileKey: string): Promise<{ id: string; uncertain: boolean; alreadyExisted: boolean }> {
  const listed = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!listed.ok) return { id: '', uncertain: true, alreadyExisted: false };
  const tasks = (await listed.json()) as { items?: { id: string; title?: string; notes?: string }[] };
  const found = tasks.items?.find((task) => task.notes?.includes(reconcileKey));
  if (found) return { id: found.id, uncertain: false, alreadyExisted: true };
  const created = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title, due: `${date}T00:00:00.000Z`, notes: `domainExpansionKey:${reconcileKey}` }),
  });
  if (!created.ok) throw new Error('Tasks did not accept the reminder. The domain record was not changed.');
  const task = (await created.json()) as { id: string };
  return { id: task.id, uncertain: false, alreadyExisted: false };
}

export async function exportSheet(accessToken: string, rows: string[][]): Promise<string> {
  const created = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ properties: { title: `Domain Expansion ${new Date().toISOString().slice(0, 10)}` } }),
  });
  if (!created.ok) throw new Error('Google Sheets export failed. Local records were not changed.');
  const sheet = (await created.json()) as { spreadsheetId: string; spreadsheetUrl: string };
  const updated = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/A1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!updated.ok) throw new Error('Google Sheets export failed. Local records were not changed.');
  return sheet.spreadsheetUrl;
}

export async function backupToDrive(accessToken: string, filename: string, content: string): Promise<string> {
  const metadata = { name: filename, mimeType: 'application/json' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error('Drive backup was not created. Domain records were not changed.');
  const file = (await response.json()) as { name: string };
  return file.name;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRecordFromCreate, DEFAULT_SETTINGS, parseCreateInput } from '../../shared/domain';
import {
  connectGoogle,
  createCalendarEvent,
  createTask,
  exportSheet,
  backupToDrive,
  domainSheetRows,
  downloadDriveBackup,
  listDriveBackups,
  plannedReminderDates,
  SHEET_DOMAIN_COLUMNS,
} from '../../src/services/googleIntegration';

const domain = buildRecordFromCreate(parseCreateInput({
  name: 'paid.example',
  billingDate: '2027-06-01',
  expirationDate: '2027-06-15',
  purchaseEmail: 'buyer@example.com',
  paymentMethod: 'Business card ending 9876',
  renewalCostMinor: 900,
  reminders: { enabled: true, target: 'billing', offsets: [30, 7, 1] },
}), DEFAULT_SETTINGS, 'test-domain-id', '2026-09-28T00:00:00.000Z');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('optional Google integrations', () => {
  it.each([
    ['calendar', 'https://www.googleapis.com/auth/calendar.events.owned'],
    ['tasks', 'https://www.googleapis.com/auth/tasks'],
    ['sheets', 'https://www.googleapis.com/auth/drive.file'],
    ['driveFile', 'https://www.googleapis.com/auth/drive.file'],
  ] as const)('requests only the %s action permission without inheriting other grants', async (action, scope) => {
    type TokenClientConfig = Parameters<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']>[0];
    const configurations: TokenClientConfig[] = [];
    const request = vi.fn();
    const fetchMock = vi.fn();
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'synthetic-client-id');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      google: {
        accounts: {
          oauth2: {
            initTokenClient(config: TokenClientConfig) {
              configurations.push(config);
              return { requestAccessToken: (options: { prompt?: string }) => {
                request(options);
                config.callback({ access_token: 'synthetic-access-token' });
              } };
            },
          },
        },
      },
    });

    await expect(connectGoogle(action)).resolves.toBe('synthetic-access-token');
    expect(configurations).toHaveLength(1);
    expect(configurations[0]).toMatchObject({ client_id: 'synthetic-client-id', scope, include_granted_scopes: false });
    expect(request).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plans only enabled reminder offsets before the configured anchor', () => {
    expect(plannedReminderDates(domain.reminders, '2027-06-01')).toEqual([
      { offset: 30, date: '2027-05-02' },
      { offset: 7, date: '2027-05-25' },
      { offset: 1, date: '2027-05-31' },
    ]);
    expect(plannedReminderDates({ ...domain.reminders, enabled: false }, '2027-06-01')).toEqual([]);
    expect(plannedReminderDates({ ...domain.reminders, offsets: [] }, '2027-06-01')).toEqual([]);
  });

  it('exports every public domain column, including private payment fields, to Sheets rows', () => {
    const rows = domainSheetRows([domain]);
    expect(rows[0]).toEqual([...SHEET_DOMAIN_COLUMNS]);
    const values = Object.fromEntries(rows[0].map((column, index) => [column, rows[1][index]]));
    expect(values).toMatchObject({
      name: 'paid.example',
      billingDate: '2027-06-01',
      purchaseEmail: 'buyer@example.com',
      paymentMethod: 'Business card ending 9876',
      remindersEnabled: 'true',
      reminderTarget: 'billing',
      reminderOffsets: '30 7 1',
    });
    expect(values).not.toHaveProperty('integration');
    expect(values).not.toHaveProperty('revision');
  });

  it('uses deterministic Calendar IDs to converge concurrent create attempts', async () => {
    let eventCreated = false;
    const postedIds: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { id: string };
        postedIds.push(body.id);
        if (eventCreated) return new Response('', { status: 409 });
        eventCreated = true;
        return Response.json({ id: body.id });
      }
      return Response.json({ items: eventCreated ? [{ id: postedIds[0] }] : [] });
    }));

    const attempts = await Promise.all([
      createCalendarEvent('token', 'Renew paid.example', '2027-05-25', 'test-domain-id:2027-06-01:offset:7'),
      createCalendarEvent('token', 'Renew paid.example', '2027-05-25', 'test-domain-id:2027-06-01:offset:7'),
    ]);

    expect(postedIds).toHaveLength(2);
    expect(new Set(postedIds).size).toBe(1);
    expect(attempts.every((attempt) => attempt.id === postedIds[0] && !attempt.uncertain)).toBe(true);
  });

  it('reconciles a Calendar write whose response is lost', async () => {
    let createdId = '';
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (init?.method === 'POST') {
        createdId = (JSON.parse(String(init.body)) as { id: string }).id;
        throw new TypeError('connection lost after provider accepted the write');
      }
      return Response.json({ items: createdId ? [{ id: createdId }] : [] });
    }));

    const result = await createCalendarEvent('token', 'Renew paid.example', '2027-05-25', 'stable-key');
    expect(result).toEqual({ id: createdId, uncertain: false, alreadyExisted: true });
    expect(calls).toBe(3);
  });

  it('paginates Tasks and matches the exact marker line', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('pageToken=next')) {
        return Response.json({ items: [{ id: 'match', notes: 'other\ndomainExpansionKey:domain:date:offset:7\nmore' }] });
      }
      return Response.json({
        items: [{ id: 'substring', notes: 'domainExpansionKey:domain:date:offset:70' }],
        nextPageToken: 'next',
      });
    }));

    const result = await createTask('token', 'Renew paid.example', '2027-05-25', 'domain:date:offset:7');
    expect(result).toEqual({ id: 'match', uncertain: false, alreadyExisted: true });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('maxResults=100');
    expect(urls[0]).toContain('showCompleted=true');
    expect(urls[0]).toContain('showHidden=true');
    expect(urls[1]).toContain('pageToken=next');
  });

  it('reconciles exact markers on completed or hidden Tasks', async () => {
    let requestedUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return Response.json({ items: [{ id: 'completed-match', status: 'completed', hidden: true, notes: 'domainExpansionKey:done-key' }] });
    }));

    const result = await createTask('token', 'Renew paid.example', '2027-05-25', 'done-key');
    expect(result).toEqual({ id: 'completed-match', uncertain: false, alreadyExisted: true });
    expect(requestedUrl).toContain('showCompleted=true');
    expect(requestedUrl).toContain('showHidden=true');
  });

  it('reports an uncertain Tasks write when the request fails and reconciliation is unavailable', async () => {
    let posts = 0;
    let lists = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts += 1;
        throw new TypeError('connection lost');
      }
      lists += 1;
      if (lists === 1) return Response.json({ items: [] });
      return new Response('', { status: 503 });
    }));

    const result = await createTask('token', 'Renew paid.example', '2027-05-25', 'uncertain-key');
    expect(result).toEqual({ id: '', uncertain: true, alreadyExisted: false });
    expect(posts).toBe(1);
    expect(lists).toBe(2);
  });

  it('lists only named current-format Drive backups and downloads selected JSON within the import bound', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/files?')) {
        if (url.includes('pageToken=next')) {
          return Response.json({ files: [{ id: 'backup-2', name: 'domain-expansion-2026-09-28.json', createdTime: '2026-09-28T12:00:00.000Z' }] });
        }
        return Response.json({
          files: [
            { id: 'backup-1', name: 'domain-expansion-2026-09-27.json', createdTime: '2026-09-27T12:00:00.000Z' },
            { id: 'other', name: 'domain-expansion-not-a-date.json', createdTime: '2026-09-27T11:00:00.000Z' },
          ],
          nextPageToken: 'next',
        });
      }
      return new Response('{"format":"domain-expansion-backup"}', { headers: { 'content-type': 'application/json' } });
    }));

    const files = await listDriveBackups('token');
    const content = await downloadDriveBackup('token', files[1].id);
    expect(files.map((file) => file.id)).toEqual(['backup-1', 'backup-2']);
    expect(content).toContain('domain-expansion-backup');
    expect(new URL(urls[0]).searchParams.get('q')).toContain('trashed=false');
    expect(urls).toHaveLength(3);
  });

  it('rejects an oversized Drive backup before parsing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ignored', { headers: { 'content-length': String(3 * 1024 * 1024) } })));
    await expect(downloadDriveBackup('token', 'large-file')).rejects.toThrow(/2 MiB/);
  });

  it('cancels provider work when the app session changes before a write', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const changed = () => false;

    await expect(createCalendarEvent('token', 'Renew paid.example', '2027-05-25', 'calendar-key', changed)).rejects.toThrow(/signed-in account changed/);
    await expect(createTask('token', 'Renew paid.example', '2027-05-25', 'task-key', changed)).rejects.toThrow(/signed-in account changed/);
    await expect(exportSheet('token', domainSheetRows([domain]), changed)).rejects.toThrow(/signed-in account changed/);
    await expect(backupToDrive('token', 'domain-expansion-2027-05-25.json', '{}', changed)).rejects.toThrow(/signed-in account changed/);
    await expect(listDriveBackups('token', changed)).rejects.toThrow(/signed-in account changed/);
    await expect(downloadDriveBackup('token', 'file-id', changed)).rejects.toThrow(/signed-in account changed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not populate a newly created Sheet if the session changes between create and data upload', async () => {
    let current = true;
    const fetchMock = vi.fn(async (_input: string | URL | Request) => {
      current = false;
      return Response.json({ spreadsheetId: 'new-sheet', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/new-sheet' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(exportSheet('token', domainSheetRows([domain]), () => current)).rejects.toThrow(/signed-in account changed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://sheets.googleapis.com/v4/spreadsheets');
  });

  it('returns an uncertain Calendar result when pagination repeats or exceeds its bound', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (!url.searchParams.has('pageToken')) return Response.json({ items: [], nextPageToken: 'loop' });
      return Response.json({ items: [], nextPageToken: 'loop' });
    }));

    const result = await createCalendarEvent('token', 'Renew paid.example', '2027-05-25', 'loop-key');
    expect(result).toEqual({ id: '', uncertain: true, alreadyExisted: false });
  });
});

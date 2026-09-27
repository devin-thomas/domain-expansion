import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface Config {
  endpoint: string;
  token: string;
}

const VERSION = '1.0.0';

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function help(): string {
  return `domain-expansion ${VERSION}

Usage:
  domain-expansion <command> [options]

Commands:
  list, get, add, update, archive, unarchive, delete, import, export, help, version

Credentials:
  Set DOMAIN_EXPANSION_TOKEN or token in the config file.
  Do not pass the token as an argument.
  Config file: $DOMAIN_EXPANSION_CONFIG or ~/.config/domain-expansion/config.json
  Keep that file readable only by your user (chmod 600). Delete it to remove the token.

Options:
  --endpoint URL       API origin. HTTPS is required except localhost.
  --json               Machine-readable output
  --revision N         If-Match revision for update and delete
  --idempotency-key K  Reuse this key when retrying a write
  --name --registrar --renewal-date --cost --currency --intent
  --permanent --yes    Required together for unattended permanent delete
  --format json|yaml|xlsx|csv|sql
  --output FILE
  --policy skip|replace|merge
  --dry-run            Import preview only
  --archived true|false|all
`;
}

function parseArgs(argv: string[]) {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (['json', 'permanent', 'yes', 'dry-run'].includes(key)) flags.set(key, true);
      else {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) fail(`Missing value for --${key}`);
        flags.set(key, value);
        i += 1;
      }
    } else positionals.push(arg);
  }
  return { command: positionals[0] || 'help', positionals: positionals.slice(1), flags };
}

function loadConfig(flags: Map<string, string | boolean>): Config {
  if (flags.has('token')) fail('Refusing to read a token from the command line. Use DOMAIN_EXPANSION_TOKEN or the config file.');
  const file = process.env.DOMAIN_EXPANSION_CONFIG || path.join(os.homedir(), '.config', 'domain-expansion', 'config.json');
  let stored: Partial<Config> = {};
  if (fs.existsSync(file)) {
    try {
      const stat = fs.statSync(file);
      if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
        fail(`Refusing to read ${file} because other users can access it. chmod 600 the file.`);
      }
      stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Config>;
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Could not read the config file');
    }
  }
  const endpoint = String(flags.get('endpoint') || process.env.DOMAIN_EXPANSION_API_URL || stored.endpoint || '');
  const token = process.env.DOMAIN_EXPANSION_TOKEN || stored.token || '';
  if (!endpoint) fail('Set an API endpoint with --endpoint, DOMAIN_EXPANSION_API_URL, or the config file.');
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    fail('The API endpoint is not a URL');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) fail('The API endpoint must use HTTPS outside local development.');
  if (!token) fail('Set DOMAIN_EXPANSION_TOKEN or token in the config file.');
  return { endpoint: url.origin, token };
}

async function api(config: Config, method: string, pathname: string, options: { body?: unknown; idempotencyKey?: string; ifMatch?: string; query?: Record<string, string> } = {}) {
  const url = new URL(pathname, config.endpoint);
  for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, value);
  const headers: Record<string, string> = { authorization: `Bearer ${config.token}`, accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  if (options.ifMatch) headers['if-match'] = options.ifMatch;
  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual',
  });
  if (response.status >= 300 && response.status < 400) fail('Refusing to follow a redirect with the access token.');
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.error?.message || `Request failed (${response.status})`;
    fail(message);
  }
  return { status: response.status, body, etag: response.headers.get('etag') };
}

function print(value: unknown, asJson: boolean) {
  if (asJson) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === 'string') process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function domainBody(flags: Map<string, string | boolean>, partial = false) {
  const body: Record<string, unknown> = {};
  if (flags.has('name')) body.name = flags.get('name');
  if (flags.has('registrar')) body.registrar = flags.get('registrar') === '' ? null : flags.get('registrar');
  if (flags.has('renewal-date')) body.expirationDate = flags.get('renewal-date');
  if (flags.has('cost')) {
    const raw = String(flags.get('cost'));
    body.renewalCostMinor = raw === '' ? null : Number(raw);
  }
  if (flags.has('currency')) body.currency = flags.get('currency');
  if (flags.has('intent')) body.renewalIntent = flags.get('intent');
  if (!partial && !body.name) fail('add requires --name');
  if (!partial && !body.expirationDate) fail('add requires --renewal-date');
  return body;
}

async function confirmDelete(name: string, yes: boolean) {
  if (yes) return;
  if (!process.stdin.isTTY) fail('Permanent delete needs --yes when there is no interactive terminal. No request was sent.', 2);
  process.stderr.write(`Permanently delete ${name}? Type the domain name to confirm: `);
  const answer = await new Promise<string>((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\n')) {
        process.stdin.pause();
        resolve(data.trim());
      }
    });
    process.stdin.on('end', () => resolve(data.trim()));
  });
  if (answer !== name) fail('Confirmation did not match. No request was sent.', 2);
}

async function main() {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help' || flags.has('help')) {
    process.stdout.write(help());
    return;
  }
  if (command === 'version' || command === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  const config = loadConfig(flags);
  const asJson = flags.get('json') === true;
  const idempotencyKey = typeof flags.get('idempotency-key') === 'string' ? String(flags.get('idempotency-key')) : randomUUID();
  if (command === 'list') {
    const records = [];
    let cursor: string | null = null;
    do {
      const query: Record<string, string> = { limit: '100', archived: String(flags.get('archived') || 'false') };
      if (cursor) query.cursor = cursor;
      if (flags.get('q')) query.q = String(flags.get('q'));
      const page = await api(config, 'GET', '/api/v1/domains', { query });
      records.push(...(page.body.records || []));
      cursor = page.body.nextCursor;
    } while (cursor);
    print(asJson ? records : records.map((record: { name: string; expirationDate: string | null; currency: string; renewalCostMinor: number | null }) => `${record.name}  ${record.expirationDate ?? 'no date'}  ${record.renewalCostMinor ?? 'unknown'} ${record.currency}`).join('\n'), asJson);
    return;
  }
  if (command === 'get') {
    const id = positionals[0] || fail('get requires an id');
    print((await api(config, 'GET', `/api/v1/domains/${encodeURIComponent(id)}`)).body, asJson);
    return;
  }
  if (command === 'add') {
    print((await api(config, 'POST', '/api/v1/domains', { body: domainBody(flags), idempotencyKey })).body, asJson);
    return;
  }
  if (command === 'update' || command === 'archive' || command === 'unarchive') {
    const id = positionals[0] || fail(`${command} requires an id`);
    const revision = flags.get('revision');
    if (!revision) fail(`${command} requires --revision`);
    const body = command === 'archive' ? { isArchived: true } : command === 'unarchive' ? { isArchived: false } : domainBody(flags, true);
    print((await api(config, 'PATCH', `/api/v1/domains/${encodeURIComponent(id)}`, { body, ifMatch: `"${revision}"` })).body, asJson);
    return;
  }
  if (command === 'delete') {
    if (flags.get('permanent') !== true) fail('Refusing to delete without --permanent. Use archive to hide a domain.', 2);
    const id = positionals[0] || fail('delete requires an id');
    const revision = flags.get('revision');
    if (!revision) fail('delete requires --revision. No request was sent.', 2);
    let name = String(flags.get('name') || id);
    if (flags.get('yes') !== true) {
      const current = await api(config, 'GET', `/api/v1/domains/${encodeURIComponent(id)}`);
      name = current.body.name;
    }
    await confirmDelete(name, flags.get('yes') === true);
    const response = await fetch(new URL(`/api/v1/domains/${encodeURIComponent(id)}`, config.endpoint), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${config.token}`, 'if-match': `"${revision}"` },
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) fail('Refusing to follow a redirect with the access token.');
    if (response.status !== 204) {
      const body = await response.json().catch(() => null);
      fail(body?.error?.message || `Delete failed (${response.status})`);
    }
    print(asJson ? { deleted: id } : `Deleted ${name}`, asJson);
    return;
  }
  if (command === 'export') {
    const format = String(flags.get('format') || 'json');
    const output = String(flags.get('output') || '');
    if (!output) fail('export requires --output');
    const records = [];
    let cursor: string | null = null;
    do {
      const query: Record<string, string> = { limit: '100', archived: 'all' };
      if (cursor) query.cursor = cursor;
      const page = await api(config, 'GET', '/api/v1/domains', { query });
      records.push(...(page.body.records || []));
      cursor = page.body.nextCursor;
    } while (cursor);
    const file = await api(config, 'GET', '/api/v1/export', { query: { format } });
    const target = path.resolve(output);
    const temporary = `${target}.${process.pid}.partial`;
    const bytes = file.body.encoding === 'base64' ? Buffer.from(file.body.content, 'base64') : file.body.content;
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, target);
    print(asJson ? { output: target, count: records.length, fullFidelity: file.body.fullFidelity } : `Wrote ${records.length} domains to ${target}`, asJson);
    return;
  }
  if (command === 'import') {
    const file = positionals[0] || fail('import requires a file');
    const format = String(flags.get('format') || path.extname(file).slice(1) || 'json');
    const encoding = format === 'xlsx' ? 'base64' : 'utf8';
    const content = encoding === 'base64' ? fs.readFileSync(file).toString('base64') : fs.readFileSync(file, 'utf8');
    const policy = String(flags.get('policy') || 'skip');
    const preview = await api(config, 'POST', '/api/v1/import/preview', {
      body: { format, content, encoding, policy, acknowledgeCurrencyChanges: flags.get('yes') === true },
    });
    if (flags.get('dry-run') === true) {
      print(preview.body, true);
      return;
    }
    print(
      (
        await api(config, 'POST', '/api/v1/import/commit', {
          body: { previewId: preview.body.previewId, contentHash: preview.body.contentHash },
          idempotencyKey,
        })
      ).body,
      asJson,
    );
    return;
  }
  fail(`Unknown command ${command}\n\n${help()}`, 2);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Command failed';
  fail(message.replace(/dew1\.\S+/g, '[token]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'));
});

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { call, session, startHarness } from '../helpers';

function run(args: string[], env: NodeJS.ProcessEnv, input?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'cli/main.ts', ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

describe('cli', () => {
  it.each(['pagination', 'export'] as const)('preserves an existing export when %s fails', async (failure) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-export-failure-'));
    const output = path.join(directory, 'backup.json');
    const existing = '{"previous":"complete backup"}\n';
    fs.writeFileSync(output, existing);
    const paths: string[] = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url || '/', 'http://localhost');
      paths.push(`${url.pathname}${url.search}`);
      response.setHeader('content-type', 'application/json');
      const failed = failure === 'pagination' ? url.searchParams.has('cursor') : url.pathname === '/api/v1/export';
      response.statusCode = failed ? 503 : 200;
      response.end(JSON.stringify(failed
        ? { error: { message: 'Synthetic export failure' } }
        : { records: [], nextCursor: failure === 'pagination' ? 'second-page' : null }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing local fixture address');
      const result = await run(['export', '--format', 'json', '--output', output], {
        DOMAIN_EXPANSION_API_URL: `http://127.0.0.1:${address.port}`,
        DOMAIN_EXPANSION_TOKEN: 'synthetic-cli-token',
        DOMAIN_EXPANSION_CONFIG: path.join(directory, 'missing-config.json'),
      });
      expect(result.code).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Synthetic export failure');
      expect(fs.readFileSync(output, 'utf8')).toBe(existing);
      expect(fs.readdirSync(directory)).toEqual(['backup.json']);
      expect(paths).toHaveLength(2);
      if (failure === 'pagination') expect(paths[1]).toContain('cursor=second-page');
      else expect(paths[1]).toContain('/api/v1/export');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('supports help and version flags without credentials', async () => {
    const env = { DOMAIN_EXPANSION_API_URL: '', DOMAIN_EXPANSION_TOKEN: '', DOMAIN_EXPANSION_CONFIG: path.join(os.tmpdir(), `missing-cli-config-${process.pid}.json`) };
    for (const args of [['--help'], ['list', '--help']]) {
      const result = await run(args, env);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stderr).toBe('');
    }
    for (const args of [['--version'], ['list', '--version']]) {
      const result = await run(args, env);
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('1.0.0');
      expect(result.stderr).toBe('');
    }
  });

  it('uses the API for list, add, archive, and guarded delete', async () => {
    const harness = await startHarness();
    const browser = await session(harness.base, { uid: 'cli-user', email: 'cli@example.com' });
    const token = await call(harness.base, browser, 'POST', '/api/tokens', { body: { name: 'cli', scopes: ['domains:read', 'domains:write'], expiresInDays: 7 } });
    const env = { DOMAIN_EXPANSION_API_URL: harness.base, DOMAIN_EXPANSION_TOKEN: token.body.token as string };
    expect((await run(['help'], env)).code).toBe(0);
    expect((await run(['version'], env)).stdout.trim()).toBe('1.0.0');
    expect((await run(['add', '--token', 'nope'], env)).code).not.toBe(0);
    const added = await run(['add', '--json', '--name', 'cli.example', '--renewal-date', '2027-06-01', '--cost', '1200', '--currency', 'USD', '--idempotency-key', 'cli-add'], env);
    expect(added.code).toBe(0);
    const created = JSON.parse(added.stdout);
    const again = await run(['add', '--json', '--name', 'cli.example', '--renewal-date', '2027-06-01', '--cost', '1200', '--currency', 'USD', '--idempotency-key', 'cli-add'], env);
    expect(JSON.parse(again.stdout).id).toBe(created.id);
    const listed = await run(['list', '--json'], env);
    expect(listed.stdout).toContain('cli.example');
    expect((await run(['archive', created.id, '--revision', String(created.revision)], env)).code).toBe(0);
    const refused = await run(['delete', created.id, '--revision', String(created.revision + 1)], env);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toMatch(/permanent/i);
    const stillThere = await call(harness.base, browser, 'GET', `/api/v1/domains/${created.id}`);
    expect(stillThere.status).toBe(200);
    const unattended = await run(['delete', '--permanent', '--yes', '--revision', String(stillThere.body.revision), created.id], env);
    expect(unattended.code).not.toBe(0);
    expect((await call(harness.base, browser, 'GET', `/api/v1/domains/${created.id}`)).status).toBe(200);
    const output = path.join(os.tmpdir(), `domains-${process.pid}.json`);
    const exported = await run(['export', '--format', 'json', '--output', output], env);
    expect(exported.code).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.readFileSync(output, 'utf8')).toContain('cli.example');
    fs.rmSync(output, { force: true });
    expect((await run(['list'], { ...env, DOMAIN_EXPANSION_API_URL: 'http://example.com' })).code).not.toBe(0);
    await harness.close();
  });
});

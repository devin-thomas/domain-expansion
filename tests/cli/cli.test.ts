import { spawn } from 'node:child_process';
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

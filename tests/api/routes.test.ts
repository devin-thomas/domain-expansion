import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/createApp';
import { startHarness } from '../helpers';

describe('route mounting', () => {
  it('serves the SPA for showcase and auth finish without swallowing /api', async () => {
    const harness = await startHarness();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dew-static-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Domain Expansion</title><div id="root"></div>');
    const app = createApp(harness.deps, { staticDir: dir });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await fetch(`${base}/api/health`);
    const showcase = await fetch(`${base}/showcase`);
    const finish = await fetch(`${base}/auth/finish`);
    expect(health.headers.get('content-type')).toContain('application/json');
    expect(await health.json()).toMatchObject({ status: 'ok' });
    expect(await showcase.text()).toContain('Domain Expansion');
    expect(await finish.text()).toContain('Domain Expansion');
    expect((await fetch(`${base}/api/v1/domains`)).status).toBe(401);
    await new Promise((resolve) => server.close(resolve));
    await harness.close();
  });
});

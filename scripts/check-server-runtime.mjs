import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(process.cwd());
const output = mkdtempSync(path.join(workspace, '.runtime-check-'));
try {
  const compiler = spawnSync(process.execPath, [
    'node_modules/typescript/bin/tsc', '--project', 'tsconfig.server.json',
    '--noEmit', 'false', '--allowImportingTsExtensions', 'false', '--outDir', output,
  ], { stdio: 'inherit' });
  if (compiler.error) throw compiler.error;
  if (compiler.status !== 0) throw new Error('Server compilation failed');
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { pathToFileURL } from 'node:url';
    const root = process.argv[1];
    const entry = await import(pathToFileURL(root + '/api/index.js'));
    if (typeof entry.default !== 'function') throw new Error('Missing production handler');
    const { createFirestoreStore } = await import(pathToFileURL(root + '/server/store.js'));
    await createFirestoreStore();
    console.log('Compiled Node ESM server entrypoint and Firebase initialization passed');
  `, output], {
    stdio: 'inherit',
    env: { ...process.env, FIREBASE_PROJECT_ID: 'demo-domain-expansion', FIREBASE_SERVICE_ACCOUNT_JSON: '' },
  });
  if (probe.error) throw probe.error;
  if (probe.status !== 0) throw new Error('Server runtime check failed');
} finally {
  if (path.dirname(path.resolve(output)) !== workspace) throw new Error('Runtime check output escaped the workspace');
  rmSync(output, { recursive: true, force: true });
}

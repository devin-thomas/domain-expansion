import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(process.cwd());
for (const name of ['dist', '.server-build', 'server.js']) {
  const target = path.resolve(workspace, name);
  if (path.dirname(target) !== workspace) throw new Error(`Build path escaped the workspace: ${name}`);
  fs.rmSync(target, { recursive: true, force: true });
}

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures: string[] = [];

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

for (const file of walk(path.join(root, 'src'))) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('firebase-admin') || text.includes('appDataFolder') || /from ['"][^'"]*\/server\//.test(text)) {
    failures.push(`browser source imports server-only code: ${path.relative(root, file)}`);
  }
}

const assets = walk(path.join(root, 'dist', 'assets')).filter((file) => file.endsWith('.js'));
const banned = ['firebase-admin', 'BEGIN PRIVATE KEY', 'OWNER_GEMINI_API_KEY', 'RESEND_API_KEY', 'BYOK_KEYRING', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'data-testid="test-sign-in"'];
for (const file of assets) {
  const text = fs.readFileSync(file, 'utf8');
  for (const token of banned) {
    if (text.includes(token)) failures.push(`client bundle ${path.relative(root, file)} contains ${token}`);
  }
}

if (!assets.length && process.argv.includes('--require-build')) failures.push('dist/assets is missing');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`client boundary ok (${assets.length} built assets scanned)`);

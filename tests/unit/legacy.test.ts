import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('legacy persistence removal', () => {
  it('does not keep Drive appData sync or a shared browser catalog in the client', () => {
    const files = walk(path.join(process.cwd(), 'src')).filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
    const combined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    expect(combined).not.toContain('appDataFolder');
    expect(combined).not.toContain('domain_expansion_data_v1');
    expect(combined).not.toContain('firebase-admin');
    expect(combined).not.toContain('Zero Central');
    expect(files.some((file) => file.endsWith(`${path.sep}googleDriveStorage.ts`))).toBe(false);
  });
});

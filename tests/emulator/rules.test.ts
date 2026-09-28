import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialAad, open, seal } from '../../server/crypto';
import { loadConfig } from '../../server/config';
import { reencryptCredentials } from '../../server/credentials';
import { createDomain, getDomain } from '../../server/portfolio';
import { createFirestoreStore } from '../../server/store';
import type { Actor } from '../../server/auth';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulator)('firestore emulator', () => {
  let testEnv: Awaited<ReturnType<typeof initializeTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-domain-expansion',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: Number(emulator!.split(':')[1] || 8080),
      },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('denies every direct client read and write', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(getDoc(doc(alice.firestore(), 'users/alice/domains/one')));
    await assertFails(setDoc(doc(alice.firestore(), 'members/alice'), { role: 'admin', status: 'approved' }));
    await assertFails(setDoc(doc(alice.firestore(), 'users/bob/domains/one'), { name: 'stolen.example' }));
  });

  it('still isolates records when the Admin SDK bypasses rules', async () => {
    process.env.FIREBASE_PROJECT_ID = 'demo-domain-expansion';
    const store = await createFirestoreStore();
    const actor = (uid: string): Actor => ({
      uid,
      email: `${uid}@example.com`,
      emailVerified: true,
      authTime: 1_800_000_000,
      role: uid === 'admin' ? 'admin' : 'member',
      authKind: 'session',
      scopes: ['domains:read', 'domains:write', 'domains:delete'],
    });
    const created = await createDomain(store, actor('alice'), { name: 'admin-sdk.example', expirationDate: '2027-01-02' }, 'emu-1', '2026-03-01T00:00:00.000Z');
    const id = (created.body as { id: string }).id;
    await expect(getDomain(store, actor('bob'), id)).rejects.toMatchObject({ status: 404 });
    await expect(getDomain(store, actor('admin'), id)).rejects.toMatchObject({ status: 404 });
    const own = await getDomain(store, actor('alice'), id);
    expect(own.status).toBe(200);
  });

  it('rotates sealed credentials across user documents', async () => {
    const store = await createFirestoreStore();
    const config = loadConfig({
      APP_ENV: 'test',
      FIREBASE_PROJECT_ID: 'demo-domain-expansion',
      BYOK_KEYRING: JSON.stringify({ v1: randomBytes(32).toString('base64'), v2: randomBytes(32).toString('base64') }),
      BYOK_KEY_ID: 'v2',
    });
    const aad = credentialAad(config.environmentName, config.projectId, 'carol');
    const sealed = seal('rotate-me', config.byokKeys.v1, 'v1', aad);
    await store.transaction(async (tx) => {
      tx.set('users/carol/privateCredentials/gemini', {
        ...sealed,
        provider: 'gemini',
        revision: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        consentVersion: '2026-09-26',
        consentAt: '2026-01-01T00:00:00.000Z',
      });
    });
    expect(await reencryptCredentials(store, config, 'v1')).toBe(1);
    const stored = await store.get<typeof sealed & { keyId: string }>('users/carol/privateCredentials/gemini');
    expect(stored?.keyId).toBe('v2');
    expect(open(stored!, config.byokKeys.v2, aad)).toBe('rotate-me');
    expect(JSON.stringify(stored)).not.toContain('rotate-me');
  });
});

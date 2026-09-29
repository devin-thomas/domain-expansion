import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialAad, open, seal } from '../../server/crypto';
import { loadConfig } from '../../server/config';
import { reencryptCredentials } from '../../server/credentials';
import { batchCreate, commitImport, createDomain, getDomain, listDomains, patchDomain, previewImport } from '../../server/portfolio';
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

  it('patches a newly created Firestore domain with the revision returned by GET', async () => {
    const store = await createFirestoreStore();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const actor: Actor = {
      uid: `patch-${suffix}`,
      email: 'patch@example.com',
      emailVerified: true,
      authTime: 1_800_000_000,
      role: 'member',
      authKind: 'session',
      scopes: ['domains:read', 'domains:write'],
    };
    const created = await createDomain(store, actor, {
      name: `patch-${suffix}.example`,
      expirationDate: '2027-09-28',
    }, `patch-${suffix}`, '2026-09-28T00:00:00.000Z');
    const id = (created.body as { id: string; revision: number }).id;
    const loaded = await getDomain(store, actor, id);
    const revision = (loaded.body as { revision: number }).revision;

    const patched = await patchDomain(store, actor, id, { registrar: 'Verification Registrar' }, `"${revision}"`, '2026-09-28T00:00:01.000Z');

    expect(revision).toBe(1);
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ registrar: 'Verification Registrar', revision: 2 });
  });

  it('paginates bounded queue reads by document path', async () => {
    const store = await createFirestoreStore();
    await store.transaction(async (tx) => {
      tx.set('queuePaginationTest/a', { value: 1 });
      tx.set('queuePaginationTest/b', { value: 2 });
      tx.set('queuePaginationTest/c', { value: 3 });
    });

    const first = await store.list<{ value: number }>('queuePaginationTest/', { limit: 2 });
    const second = await store.list<{ value: number }>('queuePaginationTest/', { limit: 2, startAfter: first.at(-1)!.path });
    expect(first.map((row) => row.path)).toEqual(['queuePaginationTest/a', 'queuePaginationTest/b']);
    expect(second.map((row) => row.path)).toEqual(['queuePaginationTest/c']);

    await store.transaction(async (tx) => {
      tx.delete('queuePaginationTest/a');
      tx.delete('queuePaginationTest/b');
      tx.delete('queuePaginationTest/c');
    });
  });

  it('commits batch and mixed import mutations in Firestore transactions', async () => {
    const store = await createFirestoreStore();
    const actor: Actor = {
      uid: 'import-transaction-user',
      email: 'import@example.com',
      emailVerified: true,
      authTime: 1_800_000_000,
      role: 'member',
      authKind: 'session',
      scopes: ['domains:read', 'domains:write'],
    };
    const now = new Date('2026-03-01T00:00:00.000Z');
    const batch = await batchCreate(store, actor, {
      records: [
        { name: 'transaction-existing.example', expirationDate: '2027-01-01', notes: 'Before import' },
        { name: 'transaction-batch.example', expirationDate: '2027-02-01' },
      ],
    }, 'emulator-batch', now.toISOString());
    expect(batch.status).toBe(201);

    const preview = await previewImport(store, actor, {
      format: 'json',
      policy: 'merge',
      content: JSON.stringify({
        format: 'domain-expansion-backup',
        schemaVersion: 2,
        domains: [
          { name: 'transaction-existing.example', expirationDate: '2027-01-01', notes: 'After import', purchaseEmail: 'billing@example.com' },
          { name: 'transaction-import.example', expirationDate: '2027-03-01' },
        ],
      }),
    }, now);
    const result = await commitImport(store, actor, {
      previewId: (preview.body as { previewId: string }).previewId,
      contentHash: (preview.body as { contentHash: string }).contentHash,
    }, 'emulator-import', now);
    expect(result.status).toBe(200);

    const listed = await listDomains(store, actor, new URLSearchParams('archived=all'), 'emulator-cursor-secret', '2026-03-01');
    const records = (listed.body as { records: { name: string; notes: string; purchaseEmail: string | null }[] }).records;
    expect(records).toHaveLength(3);
    expect(records.find((row) => row.name === 'transaction-existing.example')).toMatchObject({
      notes: 'After import',
      purchaseEmail: 'billing@example.com',
    });
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

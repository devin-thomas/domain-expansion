import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../server/auth';
import { ApiError } from '../../shared/errors';
import { normalizeDomainName, type DomainRecord } from '../../shared/domain';
import { createDomain, getDomain, listDomains, patchDomain } from '../../server/portfolio';
import { createFirestoreStore, type DocStore } from '../../server/store';
import { sha256Hex } from '../../server/crypto';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const nowIso = '2026-09-29T18:00:00.000Z';

interface NameIndex {
  domainId: string;
}

function makeActor(uid: string): Actor {
  return {
    uid,
    email: `${uid}@example.com`,
    emailVerified: true,
    authTime: 1_800_000_000,
    role: 'member',
    authKind: 'session',
    scopes: ['domains:read', 'domains:write'],
  };
}

function indexPath(uid: string, name: string): string {
  return `users/${uid}/domainNames/${sha256Hex(normalizeDomainName(name))}`;
}

async function removeUserData(store: DocStore, uid: string): Promise<void> {
  const domains = await store.list<DomainRecord>(`users/${uid}/domains/`);
  const indexes = await store.list(`users/${uid}/domainNames/`);
  await store.transaction(async (tx) => {
    for (const domain of domains) tx.delete(domain.path);
    for (const index of indexes) tx.delete(index.path);
  });
}

describe.skipIf(!emulator)('Firestore domain name index races', () => {
  let store: DocStore;
  let previousProjectId: string | undefined;

  beforeAll(async () => {
    previousProjectId = process.env.FIREBASE_PROJECT_ID;
    process.env.FIREBASE_PROJECT_ID = 'demo-domain-expansion';
    store = await createFirestoreStore();
  });

  afterAll(async () => {
    if (previousProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = previousProjectId;
  });

  it('allows only one concurrent normalized-name create and keeps the winner index consistent', async () => {
    const suffix = randomUUID();
    const actor = makeActor(`create-race-${suffix}`);
    const otherActor = makeActor(`other-owner-${suffix}`);
    const name = `Race-${suffix}.example`;
    const keys = [`race-a-${suffix}`, `race-b-${suffix}`];

    try {
      const attempts = await Promise.allSettled([
        createDomain(store, actor, { name, expirationDate: '2027-09-29' }, keys[0], nowIso),
        createDomain(store, actor, { name: name.toLowerCase(), expirationDate: '2027-09-29' }, keys[1], nowIso),
      ]);

      const winners = attempts.filter((attempt) => attempt.status === 'fulfilled');
      const conflicts = attempts.filter((attempt) => attempt.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      expect((winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createDomain>>>).value.status).toBe(201);
      const conflict = (conflicts[0] as PromiseRejectedResult).reason;
      expect(conflict).toBeInstanceOf(ApiError);
      expect(conflict).toMatchObject({ status: 409, code: 'duplicate_name' });

      const created = (winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createDomain>>>).value;
      const winnerId = (created.body as { id: string }).id;
      const normalized = normalizeDomainName(name);
      const records = await store.list<DomainRecord>(`users/${actor.uid}/domains/`);
      expect(records).toHaveLength(1);
      expect(records[0].data).toMatchObject({ id: winnerId, name: normalized, normalizedName: normalized, revision: 1 });
      expect(await store.get<NameIndex>(indexPath(actor.uid, name))).toEqual({ domainId: winnerId });
      expect(await store.get<DomainRecord>(records[0].path)).toMatchObject({ id: winnerId, normalizedName: normalized });

      const sameNameForAnotherUser = await createDomain(
        store,
        otherActor,
        { name: name.toLowerCase(), expirationDate: '2027-09-29' },
        `cross-owner-${suffix}`,
        nowIso,
      );
      expect(sameNameForAnotherUser.status).toBe(201);
      expect(await store.get<NameIndex>(indexPath(otherActor.uid, name))).toMatchObject({ domainId: (sameNameForAnotherUser.body as { id: string }).id });
      await expect(getDomain(store, otherActor, winnerId)).rejects.toMatchObject({ status: 404 });
    } finally {
      await removeUserData(store, actor.uid);
      await removeUserData(store, otherActor.uid);
      await store.transaction(async (tx) => {
        for (const key of [...keys, `cross-owner-${suffix}`]) {
          tx.delete(`idempotency/${sha256Hex(`${actor.uid}|POST|/api/v1/domains|${key}`)}`);
        }
        tx.delete(`idempotency/${sha256Hex(`${otherActor.uid}|POST|/api/v1/domains|cross-owner-${suffix}`)}`);
      });
    }
  });

  it('serializes concurrent renames into one winner while preserving both records and valid indexes', async () => {
    const suffix = randomUUID();
    const actor = makeActor(`rename-race-${suffix}`);
    const firstName = `first-${suffix}.example`;
    const secondName = `second-${suffix}.example`;
    const targetName = `shared-target-${suffix}.example`;

    try {
      const first = await createDomain(store, actor, { name: firstName, expirationDate: '2027-09-29' }, `rename-first-${suffix}`, nowIso);
      const second = await createDomain(store, actor, { name: secondName, expirationDate: '2027-09-29' }, `rename-second-${suffix}`, nowIso);
      const firstId = (first.body as { id: string }).id;
      const secondId = (second.body as { id: string }).id;
      const [loadedFirst, loadedSecond] = await Promise.all([
        getDomain(store, actor, firstId),
        getDomain(store, actor, secondId),
      ]);
      const firstRevision = (loadedFirst.body as DomainRecord).revision;
      const secondRevision = (loadedSecond.body as DomainRecord).revision;

      const attempts = await Promise.allSettled([
        patchDomain(store, actor, firstId, { name: targetName }, `"${firstRevision}"`, nowIso),
        patchDomain(store, actor, secondId, { name: targetName.toUpperCase() }, `"${secondRevision}"`, nowIso),
      ]);

      const winners = attempts.filter((attempt) => attempt.status === 'fulfilled');
      const conflicts = attempts.filter((attempt) => attempt.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      expect((winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof patchDomain>>>).value).toMatchObject({ status: 200 });
      const conflict = (conflicts[0] as PromiseRejectedResult).reason;
      expect(conflict).toBeInstanceOf(ApiError);
      expect(conflict).toMatchObject({ status: 409, code: 'duplicate_name' });

      const winnerRecord = (winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof patchDomain>>>).value.body as DomainRecord;
      const loserId = winnerRecord.id === firstId ? secondId : firstId;
      const loserOriginalName = winnerRecord.id === firstId ? secondName : firstName;
      const all = await store.list<DomainRecord>(`users/${actor.uid}/domains/`);
      expect(all).toHaveLength(2);
      expect(winnerRecord).toMatchObject({
        id: winnerRecord.id,
        name: normalizeDomainName(targetName),
        normalizedName: normalizeDomainName(targetName),
        revision: 2,
      });
      expect(all.map((row) => row.data.id).sort()).toEqual([firstId, secondId].sort());
      expect(await store.get<NameIndex>(indexPath(actor.uid, targetName))).toEqual({ domainId: winnerRecord.id });
      expect(await store.get(indexPath(actor.uid, winnerRecord.id === firstId ? firstName : secondName))).toBeNull();
      expect(await store.get<NameIndex>(indexPath(actor.uid, loserOriginalName))).toEqual({ domainId: loserId });

      const loser = await store.get<DomainRecord>(`users/${actor.uid}/domains/${loserId}`);
      expect(loser).toMatchObject({ id: loserId, name: normalizeDomainName(loserOriginalName), normalizedName: normalizeDomainName(loserOriginalName), revision: 1 });
    } finally {
      await removeUserData(store, actor.uid);
      await store.transaction(async (tx) => {
        for (const key of [`rename-first-${suffix}`, `rename-second-${suffix}`]) {
          tx.delete(`idempotency/${sha256Hex(`${actor.uid}|POST|/api/v1/domains|${key}`)}`);
        }
      });
    }
  });
});

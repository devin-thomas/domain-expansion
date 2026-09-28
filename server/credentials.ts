import { ApiError } from '../shared/errors';
import type { Actor } from './auth';
import { requireRecent, requireSession } from './auth';
import type { Config } from './config';
import { credentialAad, open, seal, type SealedSecret } from './crypto';
import type { DocStore } from './store';

export interface CredentialDoc extends SealedSecret {
  provider: 'gemini';
  revision: number;
  updatedAt: string;
  consentVersion: string;
  consentAt: string;
}

function path(uid: string): string {
  return `users/${uid}/privateCredentials/gemini`;
}

export function credentialStatus(doc: CredentialDoc | null, ownerServer: boolean) {
  if (!doc && ownerServer) return { configured: true, provider: 'gemini', source: 'owner-server' as const, updatedAt: null, consentVersion: null };
  if (!doc) return { configured: false, provider: 'gemini', source: null, updatedAt: null, consentVersion: null };
  return { configured: true, provider: 'gemini' as const, source: 'byok' as const, updatedAt: doc.updatedAt, consentVersion: doc.consentVersion, revision: doc.revision };
}

export async function getCredentialStatus(store: DocStore, config: Config, actor: Actor) {
  requireSession(actor);
  const doc = await store.get<CredentialDoc>(path(actor.uid));
  const ownerServer = actor.uid === config.ownerUid && Boolean(config.ownerGeminiApiKey);
  return { status: 200, body: credentialStatus(doc, ownerServer) };
}

export async function putCredential(store: DocStore, config: Config, actor: Actor, body: unknown, ifMatch: string | undefined, now: Date) {
  requireSession(actor);
  requireRecent(actor, config, now);
  const input = body as { apiKey?: unknown; consent?: unknown; consentVersion?: unknown };
  if (input.consent !== true || typeof input.consentVersion !== 'string' || input.consentVersion.length > 40) {
    throw new ApiError(422, 'consent_required', 'Confirm that Domain Expansion will send your text to Google with your key');
  }
  if (typeof input.apiKey !== 'string' || input.apiKey.length < 10 || input.apiKey.length > 400 || /\s/.test(input.apiKey)) {
    throw new ApiError(422, 'invalid_key', 'Enter the Gemini API key');
  }
  if (!config.byokCurrentKeyId || !config.byokKeys[config.byokCurrentKeyId]) {
    throw new ApiError(503, 'vault_unconfigured', 'Credential storage is not configured', { retryable: false });
  }
  const keyId = config.byokCurrentKeyId;
  const sealed = seal(input.apiKey, config.byokKeys[keyId], keyId, credentialAad(config.environmentName, config.projectId, actor.uid));
  const result = await store.transaction(async (tx) => {
    const current = await tx.get<CredentialDoc>(path(actor.uid));
    if (current && ifMatch !== `"${current.revision}"` && ifMatch !== String(current.revision)) {
      if (!ifMatch) throw new ApiError(428, 'precondition_required', 'Send If-Match to replace the stored key');
      throw new ApiError(412, 'stale_revision', 'The stored key changed. Reload and try again');
    }
    const doc: CredentialDoc = {
      ...sealed,
      provider: 'gemini',
      revision: (current?.revision ?? 0) + 1,
      updatedAt: now.toISOString(),
      consentVersion: input.consentVersion as string,
      consentAt: now.toISOString(),
    };
    tx.set(path(actor.uid), doc);
    return doc;
  });
  return { status: 200, body: credentialStatus(result, false) };
}

export async function deleteCredential(store: DocStore, config: Config, actor: Actor, now: Date) {
  requireSession(actor);
  requireRecent(actor, config, now);
  await store.transaction(async (tx) => {
    tx.delete(path(actor.uid));
  });
  const ownerServer = actor.uid === config.ownerUid && Boolean(config.ownerGeminiApiKey);
  return { status: 200, body: credentialStatus(null, ownerServer) };
}

export async function resolveAiKey(store: DocStore, config: Config, actor: Actor): Promise<{ apiKey: string; source: 'byok' | 'owner' }> {
  requireSession(actor);
  const doc = await store.get<CredentialDoc>(path(actor.uid));
  if (doc) {
    const key = config.byokKeys[doc.keyId];
    if (!key) throw new ApiError(503, 'vault_unconfigured', 'Stored credentials cannot be opened');
    try {
      const apiKey = open(doc, key, credentialAad(config.environmentName, config.projectId, actor.uid));
      return { apiKey, source: 'byok' };
    } catch {
      throw new ApiError(503, 'vault_unconfigured', 'Stored credentials cannot be opened');
    }
  }
  if (actor.uid === config.ownerUid && config.ownerGeminiApiKey) return { apiKey: config.ownerGeminiApiKey, source: 'owner' };
  throw new ApiError(422, 'ai_not_configured', 'Add your Gemini key before using AI Quick Add. Manual capture still works.');
}

export async function reencryptCredentials(store: DocStore, config: Config, fromKeyId: string): Promise<number> {
  const currentId = config.byokCurrentKeyId;
  const current = currentId ? config.byokKeys[currentId] : undefined;
  const previous = config.byokKeys[fromKeyId];
  if (!current || !currentId || !previous) throw new ApiError(503, 'vault_unconfigured', 'Key rotation requires the previous and current keys');
  const docs = await store.list<CredentialDoc>('users/');
  let count = 0;
  for (const item of docs) {
    if (!item.path.endsWith('/privateCredentials/gemini')) continue;
    const uid = item.path.split('/')[1];
    if (item.data.keyId !== fromKeyId) continue;
    const aad = credentialAad(config.environmentName, config.projectId, uid);
    const plaintext = open(item.data, previous, aad);
    const sealed = seal(plaintext, current, currentId, aad);
    await store.transaction(async (tx) => {
      const latest = await tx.get<CredentialDoc>(item.path);
      if (!latest || latest.keyId !== fromKeyId) return;
      tx.set(item.path, { ...latest, ...sealed, revision: latest.revision + 1 });
    });
    count += 1;
  }
  return count;
}

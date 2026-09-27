# DEW-011 — Store AI credentials safely and isolate the owner exception

**Status:** Complete

## Goal

Make AI convenient across devices while requiring other users' own keys and informed consent.

## Scope

Implement session-only credential setup/status/replacement/removal, consent/version state, authenticated encryption, versioned server keyring, owner-UID credential selection, and an operator rotation procedure. Keep the settings surface small and manual capture independent.

Contract: SPEC section 7; R06.

## Acceptance Criteria

- Non-owner AI availability requires a configured personal Gemini key and recorded provider-data consent.
- Key setup explains server processing and Google's applicable terms; BYOK is not presented as a no-training guarantee.
- Raw keys are accepted over HTTPS but never returned after setup, persisted in browser storage, logged, exported, or included in client builds.
- Stored ciphertext is authenticated to environment, user, provider, and version. Wrong key/nonce/tag/AAD fails closed.
- The configured encryption master stays outside Firestore and `VITE_*`; version rotation can preserve and re-encrypt existing credentials without a plaintext fallback.
- Replacement/removal uses current credential state, clears the browser input, and prevents future use of the removed value.
- Only the exact configured owner UID may use the server Gemini credential. Another admin or a non-owner with a failing key never inherits it.
- PATs and application admins acting for another user cannot inspect or mutate the vault. Manual Quick Add still works with no AI key.

## Dependencies

[DEW-003](DEW-003-admission-auth.md).

## Verification

2026-09-27. `tests/unit/backup-vault.test.ts` fails closed on a wrong AAD and a tampered tag, then rotates a memory-store credential from key id `v1` to `v2` without leaving the plaintext in the stored JSON. The emulator test repeats that rotation through the Firestore collection-group listing. `tests/api/matrix.test.ts` shows a member with no key gets 422 and zero provider calls, a member key is the only key sent for that user, and the owner UID uses the configured owner key. The settings copy says server processing and Google's terms apply and does not promise a no-training guarantee. No real key material is in this note.

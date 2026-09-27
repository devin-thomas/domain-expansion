# DEW-005 — Persist private portfolios through the domain service

**Status:** Not started

## Goal

Replace prototype browser/Drive authority with reliable, strictly user-owned Firestore records.

## Scope

Implement per-user domain/settings paths, normalized-name uniqueness, CRUD/archive/unarchive, revisions, idempotent create, and transactions behind the authenticated service. Add deny-all client Firestore rules and separate server authorization tests. Remove automatic Drive appDataFolder sync and shared browser-catalog adoption.

Contract: SPEC sections 4–5 and 9; R02, R04, R12, R15.

## Acceptance Criteria

- Two users can independently save the same domain; neither can read/write the other's record, index, settings, or cursor state.
- Application admin role grants no cross-user domain access. Tests exercise actual Admin SDK handlers rather than relying only on client rules.
- Concurrent duplicate create/rename attempts cannot produce duplicate normalized names or orphan indexes.
- Stale updates return 412; missing preconditions return 428. Response-loss retry with the same idempotency key/body creates once.
- A successful response follows a committed transaction; failures do not report synced or saved.
- Fresh approved accounts start empty. No first-login Drive scan, migration preview, hidden reconciliation, or legacy data adoption exists.
- Removing sync does not delete external files, reset another store, or read another browser user's data.
- Membership suspension and field/path injection attempts are denied in the service.

## Dependencies

[DEW-002](DEW-002-domain-contract.md), [DEW-003](DEW-003-admission-auth.md).

## Verification

Not run. Record Firestore Emulator rules tests, server-side tenant tests, concurrency/idempotency fixtures, and inspection proving the old automatic persistence path is no longer called.

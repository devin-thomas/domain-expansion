# DEW-009 — Publish the versioned domain API contract

**Status:** Complete

## Goal

Make data entry and authenticated retrieval predictable for automation using the same rules as the human application.

## Scope

Complete `/api/v1` record, batch, import-preview/commit, and export endpoints. Add owner-bound cursor pagination, filter/sort behavior, structured errors, field allowlists, limits, revisions, idempotency, and scope enforcement. Generate or contract-test a versioned OpenAPI description against runtime schemas. The UI file-format controls come later; API domain portability is part of this ticket.

Contract: SPEC sections 4–5 and 9; R07, R08, R15.

## Acceptance Criteria

- Every documented endpoint has schema, permission, success, error, and ownership tests; literal batch/import routes do not collide with record IDs.
- Search/filter operates across the caller's collection with explicit continuation, not only the first fetched page. Cursors cannot cross users or query configurations.
- POST retries with the same key/body return one outcome; conflicting key reuse is 409. PATCH/DELETE require revisions.
- Batch creation/import is bounded and atomic. Invalid/stale/conflicting records do not silently produce a partial commit.
- Import preview makes no domain writes; commit revalidates caller, content, policy, and revisions. Omitted records are never deleted.
- API exports are owner-only domain data and exclude account/security/provider information. User settings restore cannot be smuggled through a domain-scoped PAT.
- Unknown/server-owned fields, foreign IDs, illegal state transitions, and currency reinterpretation are rejected consistently.
- Create, patch, import, and export use the same optional `purchaseEmail` syntax validation and plain-text `paymentMethod` field rules as the UI; omitted patch fields are preserved.
- API examples validate against real schemas/handlers; error codes, pagination, null semantics, money units, scopes, and destructive behavior are documented.

## Dependencies

[DEW-002](DEW-002-domain-contract.md), [DEW-005](DEW-005-private-persistence.md), [DEW-008](DEW-008-personal-tokens.md).

## Verification

2026-09-29. The current integrated API/CLI suite passes 77/77, including ownership/scope boundaries, idempotency, revision preconditions, batch atomicity, import preview/commit, export isolation, payment-field validation/round trips, failed-export preservation, and AI provider failure/fallback response behavior. The OpenAPI contract is checked against runtime schemas and handlers. The eight-group production verifier passed on current application source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` / Vercel deployment `dpl_BpiFAQzwJmMbzyW9WW1vMrzUTgYm`; its synthetic fixtures and temporary identity were removed, and temporary PATs were revoked. The current suite, lint, and production build passed; deployment evidence is tracked under DEW-017.

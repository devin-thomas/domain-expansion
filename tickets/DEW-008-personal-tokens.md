# DEW-008 — Issue and enforce scoped personal access tokens

**Status:** Complete

## Goal

Give agents useful access to a user's portfolio without also granting deletion, administration, or provider-key access.

## Scope

Implement browser-session-only token creation/list/revocation under Developer settings, high-entropy secrets and safe verifiers, independent scopes, expiry, and PAT actor resolution. Add safe creation responses, last-used metadata, and immediate membership/revocation checks.

Contract: SPEC sections 5 and 9.1; R02, R08, R09.

## Acceptance Criteria

- Named tokens expose plaintext once and never persist it in Firestore, exports, logs, or list responses.
- Default selection is read + write, not delete; scopes do not imply one another. Expiry follows the documented bounded default.
- Read-only cannot write; write-only cannot retrieve other stored content; read/write cannot permanently delete through any route.
- PATs cannot create other PATs, approve requests, change membership, access the credential vault, or spend through AI extraction.
- Verification checks a cryptographic secret before trusting any public UID/token locator and uses constant-time verifier comparison.
- Revoked/expired tokens and suspended members fail on the next new request, regardless of token metadata cached by a caller.
- A token cannot access another user's portfolio by changing a path, locator, body, or cursor.
- Recent authentication is required for creation and sensitive token changes; missing reauthentication does not expose an already generated token.

## Dependencies

[DEW-003](DEW-003-admission-auth.md), [DEW-005](DEW-005-private-persistence.md).

## Verification

2026-09-27. `tests/api/matrix.test.ts` creates read, write, and read/write `dew1.` tokens, checks the stored record does not contain the secret segment, enforces scopes, rejects token creation from a stale auth time, and returns 401 after revoke. A read/write token cannot `DELETE` or call `/api/tokens` or `/api/ai/extract`. Browser token creation shows the secret once in Settings. Tokens in this run were disposable test tokens.

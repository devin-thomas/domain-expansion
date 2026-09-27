# DEW-003 — Establish approved membership and passwordless authentication

**Status:** Complete

## Goal

Allow an approved identity to sign in by email while ensuring a Firebase account alone grants no product access.

## Scope

Implement trusted owner bootstrap, membership lookup, verification/revocation checks, email-link request/completion, session state, and guarded routes. Add fixed callback-origin handling, generic sign-in responses, resend throttles, and same-device/cross-device completion. Define the server operations consumed by the request-approval ticket.

Contract: SPEC sections 5–6 and 12; R01, R02.

## Acceptance Criteria

- Anonymous, wrong-project, unverified, unapproved, and suspended callers cannot obtain protected domain data.
- Owner/bootstrap authority comes from trusted configuration; the first visitor or a claimed email cannot become admin.
- Firebase sends passwordless mail through a supported delivery path; merely generating a link is not counted as sending it.
- `/auth/finish` handles valid, expired, reused, and cross-device links; it never trusts email/UID in URL parameters as authorization.
- Auth codes/tokens are removed from history and excluded from logs/analytics. Callback URLs are allowlisted.
- Sign-out/account switching clears private visible state before another user's content renders.
- Membership is checked on each new protected request; an old identity token cannot bypass suspension.
- Recent-auth checks are available for admin decisions, token creation, and credential changes.

## Dependencies

[DEW-001](DEW-001-foundation.md).

## Verification

2026-09-27. `tests/api/matrix.test.ts` rejects anonymous, unverified, unapproved, wrong-project, and suspended callers. The live mail adapter test asserts `accounts:sendOobCode` with `requestType: EMAIL_SIGNIN` against a stubbed fetch. No real Firebase inbox was completed, and no quota or billing change was made. Test tokens are `test.*` only when `DOMAIN_EXPANSION_TEST_AUTH=1` and `APP_ENV` is not production.

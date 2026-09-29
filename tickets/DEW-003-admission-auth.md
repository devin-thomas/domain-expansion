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

2026-09-29. `tests/api/matrix.test.ts` rejects anonymous, unverified, unapproved, wrong-project, and suspended callers. The owner completed real Firebase email-link sign-in on the canonical host and reached the admin dashboard; the user reported successful sign-in on an iPhone 16 Pro running iOS 27 Safari. The request/approval flow's Firebase and Resend messages were received in Gmail spam; this records delivery and observed placement, not future inbox placement. `tests/browser/auth-finish.spec.ts` passes three client-flow cases for malformed, expired, and reused synthetic links using the real Firebase client SDK and stubbed Identity Toolkit errors. Those tests do not fabricate a successful sign-in or replace live-provider evidence. Spark's email-link sending quota was checked; no billing change was made. Test tokens are `test.*` only when `DOMAIN_EXPANSION_TEST_AUTH=1` and `APP_ENV` is not production.

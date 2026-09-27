# DEW-004 — Deliver access requests, admin decisions, and email alerts

**Status:** Complete

## Goal

Capture unexpected product interest and notify the owner without turning admission into open signup or an email-abuse endpoint.

## Scope

Implement the public access request, deduplication, shared abuse controls, protected admin queue/badge, Approve/Deny, membership suspension, and durable notification state. Use Resend for admin alerts and Firebase for the first approved sign-in message. Add bounded delivery retry and visible manual recovery.

Contract: SPEC section 6; R01, R10.

## Acceptance Criteria

- A valid new request creates one pending item and one notification event. Repeats do not create a mail storm or reveal existing account status publicly.
- Only a current approved admin session can decide requests; email links open a protected page and cannot execute approval.
- Approve idempotently resolves the Firebase UID, stores membership, and initiates the first Firebase sign-in email without falsely marking email ownership verified.
- Deny grants no membership. Suspension blocks future session/PAT requests but retains the portfolio.
- Resend mail goes only to the configured admin recipient. Applicant-controlled text cannot inject HTML/headers, recipients, or approval actions.
- Request storage survives Resend failure. Approval survives sign-in-mail failure; both failures have honest retryable states.
- Outbox state and provider idempotency prevent ordinary duplicate retries; behavior outside Resend's deduplication window is explicitly handled, not called exactly once.
- Admin screens expose request/account information, not another user's portfolio or provider key.

## Dependencies

[DEW-003](DEW-003-admission-auth.md).

## Verification

2026-09-27. `tests/api/matrix.test.ts` checks duplicate access requests return the same public body, one admin alert, HTML escaping of the reason, approve with `emailVerified: false`, and deny without treating the applicant as a member. Suspension then blocks that user's domain list. The mail adapter test checks the Resend idempotency header on a stubbed fetch. No message was delivered to a real admin inbox, so provider acceptance here is not observed delivery. Retry routes are `POST /api/admin/notifications/:id/retry` and `POST /api/internal/notifications/retry`.

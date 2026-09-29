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
- Normal access/sign-in requests trigger an immediate `waitUntil` queue drain. Vercel Cron calls `GET /api/internal/notifications/retry` daily at 12:00 UTC with `Authorization: Bearer CRON_SECRET`; `CRON_SECRET` and `NOTIFICATION_RETRY_SECRET` use the same protected value.
- Scheduled delivery retry is bounded and fair: up to 8 claims, 64 queue documents, and 40 seconds per run, with cursor leases. Unauthorized cron requests do not disclose queue data.
- Admin screens expose request/account information, not another user's portfolio or provider key.

## Dependencies

[DEW-003](DEW-003-admission-auth.md).

## Verification

2026-09-29. Latest source API/CLI checks passed 32/32 and unit checks passed 32; retry-audit tests cover authorization denial, separation from delivery counters, safe failure records, Vercel source classification, and overlapping runs. A real access-request notification was accepted by Resend and received in the owner's Gmail spam folder. A QA request approval returned HTTP 200 with Firebase `mailState: sent`; the owner also received the Firebase sign-in message in spam, completed the canonical link, and reached the admin dashboard. Gmail showed the Firebase From/header as `noreply@devthomas.site`; the subject/body used `Domain Expansion` branding. Spam placement is the observed initial mail limitation. A Vercel CLI-triggered provider `GET /api/internal/notifications/retry` returned HTTP 200 at 14:22:59 UTC and advanced queues at 14:23:03 UTC. On source `f1292ae2bf203f813cb3368a7674f81c24c199d4`, Vercel `dpl_8mWALNzGKdKC9L1ydPgvP3uaJGci` READY, a provider-triggered run returned 200 and wrote `mailRetryRuns/vercel` with status `succeeded`, 2 scanned, 0 retried, started 14:35:46.958 UTC, completed 14:35:48.131 UTC, and duration 1,173 ms. An anonymous forged cron request returned 401 and wrote no audit record; an authenticated operator request returned 200 without replacing the provider record. Clock-scheduled execution remains unverified. A cursor update at 12:35:32 UTC had no retained scheduled-trigger attribution. The authenticated-only audit records request ID, source/status, start/end/duration, scanned/retried counts, and safe error category, without secrets or email contents. The worker scans at most 64 documents combined across both queues per run. Manual retry is `POST /api/admin/notifications/:id/retry`; scheduled retry is `GET /api/internal/notifications/retry` with the configured bearer secret.

On 2026-09-29, automatic scheduling was verified using a temporary `45 14 * * *` window. No manual cron trigger was sent during that window. Vercel recorded a production GET 200 on `dpl_D41ZxXgHmNCzkjHAHqfWhLhEbhmv`; the durable provider record started at 14:49:58.211 UTC and completed at 14:49:59.414 UTC (1,203 ms, 2 scanned, 0 retried, succeeded). The normal daily `0 12 * * *` schedule was then restored and verified on Vercel. The scheduler acceptance gate is closed.

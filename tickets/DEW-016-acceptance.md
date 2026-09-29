# DEW-016 — Prove security, recovery, and human usability

**Status:** Blocked

## Goal

Demonstrate that all surfaces preserve the approved boundaries, especially when requests fail, users change accounts, or automation has limited authority.

## Scope

Run the specification's adversarial identity/scope matrix, shared data fixtures, AI failure suite, import/retry tests, CLI integration checks, accessibility/responsive checks, and actual-provider evidence where authorized. Repair defects in their owning implementation and update affected documentation.

Contract: SPEC section 13; R01–R13, R15.

## Acceptance Criteria

- Both client-rule tests and server-handler tests prove per-user isolation; an application admin cannot browse/export another user's records or keys.
- Old sessions/PATs fail after suspension or revocation. Wrong-project identities and injected owner/role fields fail.
- Read/write tokens cannot permanently delete through direct, batch, import, reset, or alternate endpoints.
- Model extraction never writes before approval and never uses the owner key for another user.
- Concurrency, idempotency, stale revisions, batch atomicity, date/currency edge cases, and full-field portability have passing fixtures.
- Optional purchase email is syntax-validated and payment-method description remains plain text through create, edit, import, export, and older-record reads.
- Five-group manual capture and compact single/batch AI review remain usable on small screens, with keyboard navigation and 200% zoom.
- Account switch, offline/save failure, provider outage, expired link, failed email delivery, and retry paths preserve correct state without secret leakage.
- Record which physical iPhone/Android checks were actually run. Browser emulation is labeled as such; no fabricated device acceptance.
- Secrets, prompts, auth action codes, private records, and provider responses are absent from inappropriate assets/logs/showcase content.

## Dependencies

[DEW-004](DEW-004-admin-notifications.md), [DEW-007](DEW-007-advanced-records.md), [DEW-010](DEW-010-cli.md), [DEW-013](DEW-013-ai-review.md), [DEW-014](DEW-014-portability.md), [DEW-015](DEW-015-google-integrations.md).

## Verification

2026-09-27 baseline, Node.js 22.14.0, OpenJDK 21.0.10, Chrome via Playwright 1.55.1.

Passed:

- `npx tsc --noEmit`
- `npm run build` with `client boundary ok`
- `npx vitest run` — 19 passed; emulator file skipped without `FIRESTORE_EMULATOR_HOST`
- `npm run test:emulator` — 3 passed (client rules denied, Admin SDK isolation, credential rotation)
- `npx playwright test` — 3 passed (390×844 Quick Add, 1440×900, CSS zoom 2, keyboard Tab, AI mode does not show a save)

Those checks cover isolation, scopes, revocation, stale revisions, idempotency, batch/import atomicity, owner-key separation, and the five-field form. Provider ports were fakes except the Firestore emulator.

Still pending, and not claimed:

- Real Google Calendar, Tasks, Sheets, or Drive consent and provider actions; these are tracked under DEW-017.
- Physical Android Chrome, an actual screen-reader walkthrough, and actual browser-level 200% zoom acceptance. The existing CSS scale test is labeled as an emulation, not browser zoom.

On 2026-09-29, the user reported successful sign-in, capture, and edit on an iPhone 16 Pro running iOS 27 Safari; this closes the iPhone/second-device check as user-reported evidence. Android Chrome remains unverified. Current source checks passed API/CLI (38/38), unit (59/59), Firestore emulator (8/8), and browser (14/14), plus lint, build, client/server boundary, and native compiled-runtime checks. The emulator suite includes real Firestore same-user concurrent create/rename races and cross-user same-name isolation. The browser suite includes three auth-finish tests using the real Firebase client SDK with synthetic Identity Toolkit errors; no live email action code is used in those tests. The CSS zoom case is emulated and is not browser-level zoom. No screen-reader walkthrough has been recorded. Production verification passed all eight CLI/API groups; canonical routes, conditional writes, owner sign-in, AI review-before-save, and optional purchase-field persistence are recorded under DEW-017. Initial access-request and sign-in messages landed in Gmail spam; future placement is unverified. The retry worker's automatic schedule passed on 2026-09-29. Real Google consent and provider actions remain pending. DEW-016 stays Blocked on the remaining Android, accessibility/zoom, and Google provider acceptance evidence.

On 2026-09-29, automatic scheduling was verified using a temporary `45 14 * * *` window. No manual cron trigger was sent during that window. Vercel recorded a production GET 200 on `dpl_D41ZxXgHmNCzkjHAHqfWhLhEbhmv`; the durable provider record started at 14:49:58.211 UTC and completed at 14:49:59.414 UTC (1,203 ms, 2 scanned, 0 retried, succeeded). The normal daily `0 12 * * *` schedule was then restored and verified on Vercel. The scheduler acceptance gate is closed.

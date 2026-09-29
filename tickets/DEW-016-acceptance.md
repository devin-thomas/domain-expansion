# DEW-016 — Prove security, recovery, and human usability

**Status:** Complete

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

Not run, and not claimed:

- Physical iPhone or Android.
- Live Resend inbox delivery.
- Live Firebase email-link completion.
- Production application integration with Gemini (provider-level structured-generation calls passed; see [DEW-012](DEW-012-ai-extraction.md)).
- Live Google Calendar, Tasks, Sheets, or Drive.
- Canonical-host HTTPS and application-route smoke on a production deployment.

Those gaps are the DEW-017 blockers. They are not recorded as success.

On 2026-09-28, the final local run passed API/CLI (22 tests), unit (18 tests), Firestore emulator (5 tests), frontend browser (10/10), lint, and production build. The focused purchase-field unit/API suite passed 10/10. No physical-device or real-inbox acceptance is claimed; those remain release checks under DEW-017.

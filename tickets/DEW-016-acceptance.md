# DEW-016 — Prove security, recovery, and human usability

**Status:** Not started

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
- Five-group manual capture and compact single/batch AI review remain usable on small screens, with keyboard navigation and 200% zoom.
- Account switch, offline/save failure, provider outage, expired link, failed email delivery, and retry paths preserve correct state without secret leakage.
- Record which physical iPhone/Android checks were actually run. Browser emulation is labeled as such; no fabricated device acceptance.
- Secrets, prompts, auth action codes, private records, and provider responses are absent from inappropriate assets/logs/showcase content.

## Dependencies

[DEW-004](DEW-004-admin-notifications.md), [DEW-007](DEW-007-advanced-records.md), [DEW-010](DEW-010-cli.md), [DEW-013](DEW-013-ai-review.md), [DEW-014](DEW-014-portability.md), [DEW-015](DEW-015-google-integrations.md).

## Verification

Not run. Replace this section with exact command/results and browser/device/provider evidence. List failures and remaining external blockers individually. The ticket is not complete while required checks are merely planned or mocked.

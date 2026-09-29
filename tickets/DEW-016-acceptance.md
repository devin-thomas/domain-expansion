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

2026-09-29 build-boundary follow-up: commit `4753e1b9bc214e9c4dab11bac5992fb500c2a83c` moved the compiled Node server bundle and map outside Vercel's static output. The build guard rejected a synthetic `dist/server.cjs` fixture, and the corrected deployment returned HTML rather than Node/JSON assets for `/server.cjs` and `/server.cjs.map` on both production aliases. Full browser tests passed 19/19, including automated Gemini-key label, proposal-checkbox accessible-name, and Google feedback status assertions. These are automated accessibility checks, not a screen-reader walkthrough or actual browser zoom; the deferred human and Google provider gates remain open.

2026-09-29 live follow-up: the eight-group production verifier passed on application implementation `2c1cdc300e768b2379e524e25a99aa11e1857cd4` served by READY Vercel `dpl_HFiEBsBNzkBF8AsZpVMBvueTpV7d`. It covered owner authentication, canonical health/OpenAPI, anonymous and unapproved isolation, CLI PAT scopes and revocation, payment fields, idempotency and ETags, import preview/commit, and credential-free JSON export. The verifier reported removal of synthetic records and temporary identity and revocation of temporary PATs. Deferred human and Google provider gates remain open.

2026-09-29 follow-up: source `2c1cdc300e768b2379e524e25a99aa11e1857cd4` passes API/CLI 77/77, unit 65/65, browser 18/18, lint, build, boundary, and native runtime. The spreadsheet apostrophe/CSV footer and CLI purchase-detail regressions now have focused coverage; a failed Google script load can be retried in the same session. These checks do not replace the deferred Android, screen-reader, actual browser zoom, or real Google provider acceptance.

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
- Android capture/edit in Chrome (sign-in alone has user-reported evidence), an actual screen-reader walkthrough, and actual browser-level 200% zoom acceptance. The existing CSS scale test is labeled as an emulation, not browser zoom.

On 2026-09-29, the user reported successful sign-in, capture, and edit on an iPhone 16 Pro running iOS 27 Safari; this closes the iPhone check as user-reported evidence. The user also reported successful sign-in only on a Galaxy S21 Ultra running Chrome; Android capture/edit remain pending. Current checks passed API/CLI (77/77), unit (65/65), browser (18/18), lint, build, client/server boundary, and native compiled-runtime checks. The Firestore emulator suite passed 8/8 on the current checkout and includes same-user concurrent create/rename races and cross-user same-name isolation. Browser tests include auth-finish flows and AI recovery cases using synthetic Identity Toolkit/API responses; they do not establish live provider failure behavior. The AI recovery cases verify late synthetic results are ignored after close, sign-out, or account switch. The CSS zoom case is emulated and is not browser-level zoom. No screen-reader walkthrough has been recorded. The eight-group production verifier passed on application source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` / deployment `dpl_BpiFAQzwJmMbzyW9WW1vMrzUTgYm`; synthetic records and the temporary identity were removed, and temporary PATs were revoked. The signed edge-IP live proof remains from prior source `b97e963a2c9e88bf159924be0e84f4e8888f2a75` / deployment `dpl_EWXwfyxMof3hJW4a2yPbrcqonFLX`. Earlier production evidence includes canonical routes, conditional writes, owner sign-in, AI review-before-save, and optional purchase-field persistence. Initial access-request and sign-in messages landed in Gmail spam; future placement is unverified. The retry worker's automatic schedule passed on 2026-09-29. Real Google consent and provider actions remain pending. Current fixtures also prove cross-user cursor/export isolation, missing-date rejection, timezone boundaries, all lifecycle/intention combinations, explicit false/zero import persistence, actual Gemini transport timeout and bounded fallback, and currency-revert cost preservation. DEW-016 stays Blocked on Android capture/edit, screen-reader/actual zoom, and Google provider acceptance evidence.

On 2026-09-29, `npm run test:emulator` passed 8/8 on checkout `e644c232a9e3297e4d5a4f8140b36ab57d7fe05a`. The suite verified direct-client write denial, Admin SDK account isolation, same-user concurrent create/rename races, and cross-user same-name isolation. This refreshes automated Firestore evidence; it does not close the deferred physical-device, accessibility, or Google provider gates.

On 2026-09-29, automatic scheduling was verified using a temporary `45 14 * * *` window. No manual cron trigger was sent during that window. Vercel recorded a production GET 200 on `dpl_D41ZxXgHmNCzkjHAHqfWhLhEbhmv`; the durable provider record started at 14:49:58.211 UTC and completed at 14:49:59.414 UTC (1,203 ms, 2 scanned, 0 retried, succeeded). The normal daily `0 12 * * *` schedule was then restored and verified on Vercel. The scheduler acceptance gate is closed.

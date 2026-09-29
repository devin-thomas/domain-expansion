# DEW-017 — Verify the canonical host and release the portfolio-ready product

**Status:** Blocked

## Goal

Serve the verified application on the intended professional URL with working admission/email flows and an honest public showcase.

## Scope

Prepare and, only with appropriate authorization, perform canonical Vercel domain configuration, Firebase callback/authorized-domain setup, verified email sender setup, protected retry operations, and final deployment smoke tests. Update user/operator/API/CLI documentation and showcase content to reflect actual completed behavior.

Contract: SPEC sections 12–13; R14, R16.

## Acceptance Criteria

- `domains.devthomas.site` resolves to the intended Vercel project with HTTPS; direct visits to `/auth/finish`, `/showcase`, and API routes work.
- Real request → admin inbox → Approve → Firebase inbox → passwordless sign-in succeeds on the canonical host. On 2026-09-29, the user reported successful phone/second-device sign-in, capture, and edit; device model and browser were unspecified.
- Desired Firebase sender branding is actually verified; Resend remains the admin notification provider. SPF/DKIM changes do not break existing domain mail.
- Firebase's email-link quota and any billing choice are checked explicitly. No paid upgrade or auth-provider switch happens silently.
- Owner UID, recipient, provider/encryption secrets, Firebase project, preview isolation, and retry configuration are documented without committing values.
- Public showcase uses safe synthetic evidence of implemented features only; protected app data and provider keys are never public.
- Obsolete Zero Central User Database/Drive-primary copy and generic package identity are corrected where the implementation changed them.
- README, API contract, CLI help, ticket statuses, and actual deployment agree. Record rollback/recovery procedures without restoring an unguarded legacy architecture.
- All required prior evidence is complete. Missing DNS, credentials, physical checks, or service access is explicitly Blocked, not presented as a finished launch.

## Dependencies

[DEW-016](DEW-016-acceptance.md).

## Verification

Blocked on 2026-09-29. The active web repository is `devin-thomas/domain-expansion` on `main`; the public Flutter repository is archived as `devin-thomas/domain-expansion-flutter` with its history retained. Canonical DNS uses a proxied CNAME to Vercel. Cloudflare Worker `domain-expansion-api` version `f55846c2-a646-4499-be51-2b06b46eb51b` handles only `/api` and `/api/*`, with no persistence, request logging, or secrets. Canonical `/`, `/showcase`, `/auth/finish`, `/privacy`, `/api/health`, and `/api/openapi.json` returned HTTP 200. The prior Vercel origin commit `e8ee8e2`, deployment `dpl_EVTWpnG9mrrauZJVPRHwPuLV9Wf4`, passed the recorded conditional-write checks. Latest source `f1292ae2bf203f813cb3368a7674f81c24c199d4`, deployment `dpl_8mWALNzGKdKC9L1ydPgvP3uaJGci`, reports READY; all six public routes returned HTTP 200. Standard conditional PATCH and integration POST passed through Cloudflare: the current revision advanced to revision 3, stale revision returned 412, missing precondition returned 428, forged internal/edge-alias requests returned 428, and final GET/Firestore state matched before cleanup. The eight-group production verifier passed, including CLI update/archive/unarchive, scope enforcement, and token revocation. Firebase `(default)` in `gen-lang-client-0134385093` is provisioned in `nam5` on Spark, with rules/indexes deployed and a dedicated service account granted `roles/datastore.user` and `roles/firebaseauth.admin`. The canonical custom email domain is verified and `useCustomDomain=true`; email-link sign-in is enabled. The observed Firebase `EMAILSIGNIN` From was `noreply@devthomas.site`; the subject/body used `Domain Expansion` branding. Gmail details showed `mailed-by` and `signed-by` `devthomas.site` and TLS. It landed in spam, with Gmail citing similarity to messages previously marked spam. The owner completed sign-in and reached the admin dashboard; production owner identity/configuration was verified. The separate `auth@devthomas.site` setting applies to supported reset/verify/change templates, not the observed sign-in sender ([Identity Platform Config reference](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config)). A QA approval returned HTTP 200 with Firebase `mailState: sent`. Chrome AI Quick Add passed synthetic extraction → review (no automatic write) → explicit Add; editing the saved record with optional purchase email and payment-method text returned Saved and reopening confirmed persistence. The synthetic AI API route also returned HTTP 200 without a portfolio write. On 2026-09-29, the user reported successful phone/second-device sign-in, capture, and edit; phone model and browser were unspecified. Twenty-two production environment variables are configured, including matching cron/retry secrets. Vercel's configured retry cron is `0 12 * * *`; a Vercel CLI-triggered provider GET returned 200 at 14:22:59 UTC and advanced queues at 14:23:03 UTC. A cursor update at 12:35:32 UTC had no retained scheduled-trigger attribution. Protected manual and anonymous requests returned 200 and 401 respectively. Latest source API/CLI checks pass 32/32, including retry-audit access denial, delivery-counter separation, safe failure records, Vercel source classification, overlapping-run ordering, and combined-queue pagination. The worker scans up to 64 queue documents combined per run. The authenticated-only audit stores operational metadata without secrets or email contents. A provider-triggered production run wrote a successful audit record (2 scanned, 0 retried, 1,173 ms); an anonymous forged request returned 401 without writing an audit record. Google APIs and OAuth client are configured; branding is saved as `Domain Expansion` with canonical homepage/privacy URLs and `devthomas.site`, but the audience remains owner-only in Testing and the app is unpublished. The Calendar action is prepared for review; Google account selection and scoped provider approvals are pending; no Google consent/provider action has been granted. Firebase remains on Spark at $0/month with the current email-link sign-in message limit of 5/day; no billing change has occurred.

Missing inputs:

Google consent/publication preparation and remaining provider verification requirements are recorded in [the OAuth verification packet](../docs/GOOGLE-OAUTH-VERIFICATION.md). The September 29 source adds a direct homepage privacy link, specific OAuth/Limited Use disclosures, and the narrower `calendar.events.owned` request. Search Console ownership and any required demonstration/submission/review have not been verified. These are provider release gates, not proof supplied by local adapter tests.

- Complete real Google account selection and Calendar approval, then exercise authorized provider actions for Calendar, Tasks, Sheets, and Drive. OAuth branding remains saved in owner-only Testing and has not been published; no consent/action is granted yet.

Automated and live evidence recorded in the other tickets includes latest source API/CLI (32/32), unit (32), Firestore emulator (6), browser (10/10), focused Google integration (12/12), lint, production build, all eight production-verifier groups, canonical route checks, and conditional-write checks through Cloudflare. Owner sign-in, identity configuration, explicit AI review/save, and optional purchase-field persistence passed. The user reported phone/second-device sign-in, capture, and edit success on 2026-09-29; device model and browser were unspecified. Remaining gates are Google consent/provider actions. Initial messages landed in spam; future placement is unverified. The latest source deployment is READY. Rollback steps are in `docs/RELEASE.md`.

On 2026-09-29, automatic scheduling was verified using a temporary `45 14 * * *` window. No manual cron trigger was sent during that window. Vercel recorded a production GET 200 on `dpl_D41ZxXgHmNCzkjHAHqfWhLhEbhmv`; the durable provider record started at 14:49:58.211 UTC and completed at 14:49:59.414 UTC (1,203 ms, 2 scanned, 0 retried, succeeded). The normal daily `0 12 * * *` schedule was then restored and verified on Vercel. The scheduler acceptance gate is closed.

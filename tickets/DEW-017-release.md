# DEW-017 — Verify the canonical host and release the portfolio-ready product

**Status:** Blocked

## Goal

Serve the verified application on the intended professional URL with working admission/email flows and an honest public showcase.

## Scope

Prepare and, only with appropriate authorization, perform canonical Vercel domain configuration, Firebase callback/authorized-domain setup, verified email sender setup, protected retry operations, and final deployment smoke tests. Update user/operator/API/CLI documentation and showcase content to reflect actual completed behavior.

Contract: SPEC sections 12–13; R14, R16.

## Acceptance Criteria

- `domains.devthomas.site` resolves to the intended Vercel project with HTTPS; direct visits to `/auth/finish`, `/showcase`, and API routes work.
- Real request → admin inbox → Approve → Firebase inbox → passwordless sign-in succeeds on the canonical host, including second-device completion.
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

Blocked on 2026-09-28. The active web repository is `devin-thomas/domain-expansion` on `main`; the public Flutter repository is archived as `devin-thomas/domain-expansion-flutter` with its history retained. DNS points to Vercel; Firestore `(default)` in `gen-lang-client-0134385093` is provisioned in `nam5` on the free tier with rules and indexes deployed and a dedicated service account granted `roles/datastore.user` and `roles/firebaseauth.admin`. Firebase Auth includes the canonical authorized domain with email-link sign-in enabled; the existing owner identity is confirmed email-verified. Resend reports `devthomas.site` verified and key creation is underway after credential approval. Twenty production environment variables are configured in Vercel, including matching protected cron/retry secrets; Vercel Cron is configured to call the bounded retry endpoint daily at 12:00 UTC. Both configured Gemini models accepted structured-generation calls. These facts do not establish a production app deployment or live user flow. No deployment identifier, canonical-host route probe, real email receipt/completion, or quota review has been recorded.

Missing inputs:

- Deploy the current `main` source to the intended production Vercel project, record the deployment id/commit, verify DNS/HTTPS, and probe canonical application/API routes.
- Complete a real Firebase email-link sign-in on the canonical host, including second-device completion, and verify the configured sender behavior.
- Finish creating/configuring the approved Resend sending credential and private sender/recipient values; verify real admin notification delivery and failure/retry handling.
- Review Firebase email-link quota and billing implications explicitly before any paid change.
- Verify the deployed `OWNER_UID` matches the user's confirmed email-verified identity and that production secrets/configuration are loaded correctly. Keep all private values out of this document.
- A second device to finish a real email link.
- Physical phone checks, which DEW-016 also leaves unclaimed.

Automated baseline evidence and the focused payment-field result are recorded in the other tickets. The final local API/CLI (22), unit (18), emulator (5), browser (10/10), lint, and build checks passed; provider configuration or model-level acceptance is not production application acceptance. Rollback steps are in `docs/RELEASE.md`.

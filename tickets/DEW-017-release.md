# DEW-017 — Verify the canonical host and release the portfolio-ready product

**Status:** Blocked

## Goal

Serve the verified application on the intended professional URL with working admission/email flows and an honest public showcase.

## Scope

Prepare and, only with appropriate authorization, perform canonical Vercel domain configuration, Firebase callback/authorized-domain setup, verified email sender setup, protected retry operations, and final deployment smoke tests. Update user/operator/API/CLI documentation and showcase content to reflect actual completed behavior.

Contract: SPEC sections 12–13; R14, R16.

## Acceptance Criteria

- `domains.devthomas.site` resolves to the intended Vercel project with HTTPS; direct visits to `/auth/finish`, `/showcase`, and API routes work.
- Real request → admin inbox → Approve → Firebase inbox → passwordless sign-in succeeds on the canonical host. On 2026-09-29, the user reported successful sign-in, capture, and edit on an iPhone 16 Pro running iOS 27 Safari.
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

Blocked on 2026-09-29. The active web repository is `devin-thomas/domain-expansion` on `main`; the public Flutter repository is archived as `devin-thomas/domain-expansion-flutter` with history retained. Canonical DNS uses a Cloudflare-proxied CNAME to Vercel. Source `b97e963a2c9e88bf159924be0e84f4e8888f2a75` is READY as Vercel deployment `dpl_EWXwfyxMof3hJW4a2yPbrcqonFLX`. Cloudflare Worker `domain-expansion-api`, version `f8e55e50-03d0-495f-b9e1-12f5e50feba9`, fronts `/api` and `/api/*`; live health and all six public routes passed. Production PATCH and integration revision checks passed through Cloudflare using standard `If-Match`: valid writes, stale 412, missing 428, forged aliases 428, and persisted state were verified. The production verifier passed all eight CLI/API groups, including update/archive/unarchive, scope enforcement, and token revocation. The signed edge-IP handoff was verified with two forged forwarded/custom headers receiving HTTP 202; the hashed actual-client-IP bucket incremented twice while the forged-IP bucket remained absent. No raw address, signature, or secret is recorded. `EDGE_CLIENT_IP_SECRET` is a protected 32-byte hex value configured only in Vercel and the Worker; it is injected to Worker deploys from the ignored local secrets file. The Worker does not persist or log request/IP details.

Firebase `(default)` in `gen-lang-client-0134385093` is provisioned in `nam5` on Spark, with rules/indexes deployed and a dedicated service account. Canonical email-link sign-in is configured and the owner completed a real sign-in. The user reported successful sign-in, capture, and edit on an iPhone 16 Pro running iOS 27 Safari. Chrome AI Quick Add passed synthetic extraction → review (no automatic write) → explicit Add; optional purchase email and payment-method text persisted after edit/reopen. Gmail received the initial Firebase and Resend messages in spam; future placement is unverified. Current checks pass API/CLI 38/38, unit 59/59, Firestore emulator 8/8, browser 14/14, lint, build, boundary, and native-runtime checks. Auth-finish error-path browser tests use the real Firebase client SDK with stubbed Identity Toolkit responses, not actual sign-in credentials. Windows `npm link`, global `domain-expansion help`, and `domain-expansion version` (1.0.0) were verified; macOS CLI acceptance remains unverified after the available SSH connection timed out.

Google APIs and OAuth client are configured. Branding is saved as `Domain Expansion` with canonical homepage/privacy URLs and `devthomas.site`, but the audience remains owner-only in Testing and the app is unpublished. Calendar/Tasks/Sheets/Drive consent and provider actions, Search Console ownership evidence, any required demonstration/submission/review, screen-reader walkthrough, actual browser-level 200% zoom, and Android Chrome checks remain pending. The user reports the Galaxy device needs charging; this is pending evidence, not a permanent unavailability. DEW-017 remains Blocked on these Google/provider and release gates. See [the OAuth verification packet](../docs/GOOGLE-OAUTH-VERIFICATION.md) for provider preparation.
On 2026-09-29, automatic scheduling was verified using a temporary `45 14 * * *` window. No manual cron trigger was sent during that window. Vercel recorded a production GET 200 on `dpl_D41ZxXgHmNCzkjHAHqfWhLhEbhmv`; the durable provider record started at 14:49:58.211 UTC and completed at 14:49:59.414 UTC (1,203 ms, 2 scanned, 0 retried, succeeded). The normal daily `0 12 * * *` schedule was then restored and verified on Vercel. The scheduler acceptance gate is closed.

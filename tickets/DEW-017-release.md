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

2026-09-29 follow-up: application source `2c1cdc300e768b2379e524e25a99aa11e1857cd4` is READY as Vercel `dpl_3cNRiR9dmDCDuiFuuUaWrexibPq7` on the `domains.devthomas.site` alias. All six canonical routes returned HTTP 200; hosted macOS CLI checks passed in [run 36608891877](https://github.com/devin-thomas/domain-expansion/actions/runs/36608891877). The eight-group production verifier remains attributed to the earlier source recorded below. Google consent/provider and remaining human acceptance checks were deferred by user instruction, so this ticket remains Blocked.

Blocked on 2026-09-29. The active web repository is `devin-thomas/domain-expansion` on `main`; the public Flutter repository is archived as `devin-thomas/domain-expansion-flutter` with history retained. The last fully production-verified source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` was READY as Vercel deployment `dpl_BpiFAQzwJmMbzyW9WW1vMrzUTgYm`. The six canonical routes (`/`, `/showcase`, `/auth/finish`, `/privacy`, `/api/health`, `/api/openapi.json`) returned HTTP 200. Cloudflare Worker `domain-expansion-api` version `f8e55e50-03d0-495f-b9e1-12f5e50feba9` remains deployed. The eight-group production verifier passed on application source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` / deployment `dpl_BpiFAQzwJmMbzyW9WW1vMrzUTgYm`; synthetic records and the temporary identity were removed, and temporary PATs were revoked. The signed edge-IP live proof remains from prior source `b97e963a2c9e88bf159924be0e84f4e8888f2a75` / deployment `dpl_EWXwfyxMof3hJW4a2yPbrcqonFLX`.

Current checks pass API/CLI 77/77, browser 18/18, unit 65/65, lint, build, boundary, and native runtime. Firestore emulator 8/8 is retained from the prior run. The browser AI recovery tests use the test-only session/API harness with synthetic responses for late-result and retry handling; a naturally occurring upstream outage and successful live fallback remain unverified. Earlier live production evidence includes a successful synthetic AI extraction and Chrome review-before-save/explicit save, plus optional payment-field persistence. The eight-group production verifier passed on application source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` / deployment `dpl_BpiFAQzwJmMbzyW9WW1vMrzUTgYm`; synthetic records and the temporary identity were removed, and temporary PATs were revoked. The signed edge-IP live proof remains from prior source `b97e963a2c9e88bf159924be0e84f4e8888f2a75` / deployment `dpl_EWXwfyxMof3hJW4a2yPbrcqonFLX`. On the current release, a real owner-authorized `POST /api/ai/extract` with a synthetic `.example` fixture returned HTTP 200 from `gemini-3.5-flash-lite` with one draft and no automatic save. A separate isolated local check authenticated with the intended production Gemini credential in the `x-goog-api-key` header: the primary model returned HTTP 200; an injected primary 429 caused exactly one real fallback-model request, which returned HTTP 503. This demonstrates bounded routing and a sanitized failed fallback, not a successful fallback or a naturally occurring upstream outage.

The user reported successful sign-in, capture, and edit on an iPhone 16 Pro running iOS 27 Safari, plus sign-in only on a Galaxy S21 Ultra running Chrome; Android capture/edit are pending. Windows `npm link`, `domain-expansion --help`, `domain-expansion --version`, and `domain-expansion list --version` were verified. The local `m1` SSH connection timed out, but hosted macOS 26.6.2 arm64 CLI acceptance passed in GitHub Actions run [36597634325](https://github.com/devin-thomas/domain-expansion/actions/runs/36597634325), closing DEW-010. The same hosted macOS CLI workflow passed again on the current source in [run 36600850750](https://github.com/devin-thomas/domain-expansion/actions/runs/36600850750). Screen-reader walkthrough and actual browser-level 200% zoom remain unverified. Initial Firebase and Resend messages landed in Gmail spam; future placement is unknown.

Google APIs and OAuth client are configured. Branding remains owner-only in Testing and unpublished. Google consent and Calendar/Tasks/Sheets/Drive actions, Search Console ownership evidence, any required demonstration/submission/review, and domain ownership/publication gates remain pending. DEW-017 remains Blocked. See [the OAuth verification packet](../docs/GOOGLE-OAUTH-VERIFICATION.md) for provider preparation.
On 2026-09-29, automatic scheduling was verified using a temporary `45 14 * * *` window. No manual cron trigger was sent during that window. Vercel recorded a production GET 200 on `dpl_D41ZxXgHmNCzkjHAHqfWhLhEbhmv`; the durable provider record started at 14:49:58.211 UTC and completed at 14:49:59.414 UTC (1,203 ms, 2 scanned, 0 retried, succeeded). The normal daily `0 12 * * *` schedule was then restored and verified on Vercel. The scheduler acceptance gate is closed.

# Release and rollback

Status checked 2026-09-28. The canonical repository and several provider configurations are verified, but the application has not been deployed and smoke-tested at `domains.devthomas.site`; DEW-017 remains Blocked.

## Current implementation and evidence

The canonical application is the React/TypeScript/Vite project in this repository. Firestore is the account portfolio store when `DATA_STORE=firestore`; browser clients have no direct Firestore access, and server handlers must enforce identity, membership, ownership, and token scope. Google Drive app data is not a database and no legacy migration is in scope.

The final local run passed API/CLI (22 tests), unit (18 tests), Firestore emulator (5 tests), frontend browser (10/10), lint, and production build. The focused payment-field unit/API run passed 10/10. These local checks do not prove the production application's behavior on the public host.

## Verified provider and repository setup

- Repository: `https://github.com/devin-thomas/domain-expansion` on `main` is the active web source. The public Flutter history remains in the archived `https://github.com/devin-thomas/domain-expansion-flutter`; see [REPOSITORY-CONSOLIDATION.md](REPOSITORY-CONSOLIDATION.md).
- DNS: `domains.devthomas.site` has a DNS-only CNAME targeting `9192af12dd517814.vercel-dns-017.com`. The Vercel production deployment, HTTPS response, and application route probes remain pending.
- Firestore: Firebase project `gen-lang-client-0134385093`, default database `(default)` in `nam5`, free tier; security rules and indexes are deployed. The dedicated server service account has `roles/datastore.user` and `roles/firebaseauth.admin`. Confirm the deployed application uses this project; never put service-account keys in this document.
- Firebase Auth: the canonical host is in the authorized domains and email-link sign-in is enabled (`emailEnabled=true`, `passwordRequired=false`). The existing owner identity was confirmed by the user as email-verified. Do not put owner email or UID values in public documentation. Real canonical-host link delivery/completion is still pending.
- Vercel: twenty production environment variables are configured in the protected project environment. Their names and values are not reproduced here. A deployment using the current source, deployment id/commit, and production route smoke tests remain pending.
- Gemini: both configured model identifiers accepted live structured-generation requests without truncation. This proves the provider credential/model path, not deployed application integration.
- Resend: the `devthomas.site` sending domain reports Verified. Credential approval was granted and creation of the sending API key is underway; no production notification key/delivery has been validated. Sender/recipient configuration and real inbox receipt remain pending.
- Retry worker: production `CRON_SECRET` and `NOTIFICATION_RETRY_SECRET` are configured to the same protected value. Vercel Cron calls `GET /api/internal/notifications/retry` daily at 12:00 UTC with `Authorization: Bearer CRON_SECRET`. Normal access/sign-in requests also trigger an immediate `waitUntil` queue drain. The durable retry worker uses bounded paged retries (up to 8 claims, 64 queue documents, and 40 seconds per run) with cursor leases and fairness; tests cover the queue behavior. A successful production schedule invocation and real delivery remain pending.
- Billing: Firebase email-link quota and any billing implications have not yet been recorded as reviewed. Do not make a paid plan change without separate explicit authorization.

## Production gate

Record a deployment id and source commit, then verify all of the following against the deployed canonical host:

- `https://domains.devthomas.site/`, `/showcase`, `/auth/finish`, and `/api/health` load or return their expected responses; API routes are not rewritten to the SPA.
- Verify the deployed Firebase email-link continuation and complete a real approved sign-in on the canonical origin; do not put its action code in logs or evidence.
- After the approved Resend key is created and configured, verify a real access request appears in the protected admin queue and configured inbox; Approve sends Firebase sign-in mail, and delivery/failure/retry states are visible.
- Verify Vercel Cron invokes the retry endpoint on schedule with the protected bearer secret, and that unauthorized calls fail without disclosing queue data.
- Verify the deployed `OWNER_UID` maps to the user's confirmed email-verified Firebase identity and that no other user inherits the server Gemini credential. Keep owner identity values private.
- Production test-auth flags are off. Preview and production data/configuration are isolated.
- Firebase email-link quota and billing are checked explicitly. No paid plan change or auth-provider switch occurs without separate explicit authorization.
- Physical-device checks, if performed, identify the actual iPhone/Android browser and result. Browser emulation is not physical-device evidence.

## Environment variable names

Server configuration names include `APP_ENV`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `AUTH_CONTINUE_URL`, `DATA_STORE`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_WEB_API_KEY`, `OWNER_UID`, `OWNER_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`, `NOTIFICATION_RETRY_SECRET`, `BYOK_KEYRING`, `BYOK_KEY_ID`, `OWNER_GEMINI_API_KEY`, and `CURSOR_SECRET`. Browser configuration may include the public Firebase web config and `VITE_GOOGLE_OAUTH_CLIENT_ID` only if integrations are enabled. Never commit values, tokens, service-account material, or email action codes.

Key rotation: install the new 32-byte key in `BYOK_KEYRING`, point `BYOK_KEY_ID` at it, retain the previous key, and run `reencryptCredentials` for the previous key id. Remove the old key only after confirming existing ciphertext opens with the new key. There is no plaintext fallback.

Notification retry: the scheduled worker uses `GET /api/internal/notifications/retry` with `Authorization: Bearer CRON_SECRET`; `CRON_SECRET` and `NOTIFICATION_RETRY_SECRET` must have the same protected value. Normal admission events request an immediate queue drain. Retries are bounded; provider idempotency does not guarantee exactly-once delivery indefinitely.

## Rollback

1. Point the Vercel production alias back to the previously verified deployment and record both deployment ids.
2. Leave Firestore documents in place. A server rollback does not delete portfolios or undo valid writes.
3. If a deployment wrote incompatible records, pause affected writes, export through the authenticated backup flow, and repair through preview/commit. Never execute SQL export text.
4. Revoke exposed personal access tokens. Remove a user's Gemini credential through the authenticated credential endpoint.
5. Keep production test-auth disabled. If test auth was enabled in production, disable it and treat issued test sessions as compromised; rotate `TEST_AUTH_SECRET` where configured.

## Not yet claimed

There is no recorded production deployment id, canonical-host application smoke result, Firebase sign-in completion, Resend notification receipt, live Google API acceptance, or physical-device pass. Provider-level Gemini structured-generation acceptance is recorded above, but deployed application acceptance is still pending.

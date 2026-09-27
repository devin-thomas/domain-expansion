# Release and rollback

Checked 2026-09-27 in this repository. No production cutover was performed.

## What this build is

Domain Expansion is the React/TypeScript/Vite application in this repository. Firestore is the portfolio store when `DATA_STORE=firestore`. The browser never talks to Firestore directly: `firestore.rules` denies every client read and write, and the Admin SDK handlers still reject another user's records. Google Drive app data is not a database and there is no legacy migration.

## Verified here

- `npx tsc --noEmit`
- `npm run build` (Vite client, `dist/server.cjs`, client-boundary scan)
- `npx vitest run` for unit, API, and CLI tests
- `npm run test:emulator` against the Firestore emulator, project `demo-domain-expansion`
- `npx playwright test` in Chrome at 390×844 and 1440×900, plus a CSS zoom of 2

These checks use the memory store, a fake mail port, a fake Gemini port, and the local emulator. They do not prove inbox delivery, live Gemini, live Google Calendar/Tasks/Sheets/Drive, or a public HTTPS host.

## Follow-up QA on the implementation branch

The local clone passed `npm run lint`, `npm run build`, `npm test` (22 passed; emulator tests skipped), and `npm run test:browser` (5 passed). New API regressions cover fail-closed deployed configuration, shared API request limits, and preserving Calendar metadata when Tasks is connected. Browser regressions cover archive restore, token revocation, and import commit refresh. The local Firestore emulator did not finish starting on this machine, which currently has Java 17; this follow-up does not replace the earlier emulator evidence above. `npm audit --omit=dev` still reports one high-severity advisory for the `xlsx` package used to parse user-selected imports. Resolve or mitigate that dependency before production release.

## Blocked before calling the host live

DEW-017 stays blocked until someone with authority confirms all of the following:

- `domains.devthomas.site` resolves to the intended Vercel project and serves HTTPS.
- `/auth/finish`, `/showcase`, and `/api/health` respond on that host, and `/api/*` is not rewritten to the SPA.
- Firebase authorized domains and the email-link continue URL include the canonical origin.
- The desired sender, `Domain Expansion <auth@devthomas.site>`, is actually verified in Firebase. Resend remains the admin-notification provider. SPF/DKIM changes must not break existing mail for the domain.
- Firebase email-link quota and any billing choice are reviewed. Do not upgrade a plan or switch auth providers as a side effect of deploy.
- A real access request arrives in the configured admin inbox, Approve starts a Firebase sign-in email, and that link completes on a second device.
- `OWNER_UID` is the exact owner who may use `OWNER_GEMINI_API_KEY`. No other UID inherits it.
- Preview and production environments do not share the same Firestore data or test-auth flags. `DOMAIN_EXPANSION_TEST_AUTH` and `VITE_TEST_AUTH` stay off in production.

Names only. Do not commit the values.

## Operator configuration

Server: `APP_ENV`, `APP_ORIGIN`, `ALLOWED_ORIGINS`, `AUTH_CONTINUE_URL`, `DATA_STORE`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_WEB_API_KEY`, `OWNER_UID`, `OWNER_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFICATION_RETRY_SECRET`, `BYOK_KEYRING`, `BYOK_KEY_ID`, `OWNER_GEMINI_API_KEY`, `CURSOR_SECRET`.

Browser: the public Firebase web config and, only if integrations are enabled, `VITE_GOOGLE_OAUTH_CLIENT_ID`. That client is for on-demand Calendar, Tasks, Sheets, or `drive.file` backup. It is not the Domain Expansion sign-in.

Key rotation: install the new 32-byte key in `BYOK_KEYRING`, point `BYOK_KEY_ID` at it, keep the previous key, and run `reencryptCredentials` for the previous key id. The Firestore store lists `users/{uid}/privateCredentials/gemini` through a collection-group read. Drop the old key only after ciphertext opens with the new key. There is no plaintext fallback.

Notification retry: an approved admin can retry one notification, or a worker can `POST /api/internal/notifications/retry` with `NOTIFICATION_RETRY_SECRET`. Retries are bounded. Resend's idempotency window is not a promise of exactly-once delivery outside that window.

## Rollback

1. Point the host back at the previous Vercel deployment. Do not repoint the app at Google Drive app data.
2. Leave Firestore documents in place. A rollback of the server does not delete portfolios.
3. If a bad deploy wrote new schema fields, stop writes, export the affected account through `/api/v1/export`, and repair with the import preview/commit flow. Do not execute SQL exports.
4. Revoke any personal access token that may have leaked. Removing a Gemini key is `DELETE /api/credentials/gemini` for that signed-in user.
5. Keep `APP_ENV=production` from enabling test sessions. If test auth was ever on in production, treat issued test tokens as compromised and rotate `TEST_AUTH_SECRET`.

## Not claimed

No physical iPhone or Android pass was run. Browser emulation is Chrome via Playwright. No paid Firebase or Resend change was made.

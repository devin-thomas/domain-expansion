# DEW-001 — Establish a runnable implementation foundation

**Status:** Complete

## Goal

Make the existing web app a reproducible base for the approved API-first implementation without replacing its interface or framework.

## Scope

Inspect `package.json`, `server.ts`, `api/health.ts`, Vite configuration, and Vercel routing. Separate shared pure modules from server-only services and browser code. Establish one local adapter and deployable API handlers using the same server modules. Add runtime schema tooling and reproducible unit/emulator/API/browser test commands, plus safe environment examples. Preserve current styling and `/showcase`.

Contract: SPEC sections 2, 12, and 13; R13, R14, R15.

## Acceptance Criteria

- A clean install can run the existing development server and production build using documented commands.
- `/api/health` reaches a real API handler; `/auth/finish` and `/showcase` resolve through correct routes without swallowing API requests in SPA fallback.
- Server secrets and Admin/provider packages are excluded from browser imports/assets; a build-level check detects accidental exposure.
- The README and `.env.example` distinguish public Firebase app configuration from server secrets and use placeholders only.
- Test commands fail when their assertions fail; empty placeholder suites are not reported as verification.
- Existing visual assets and application routes are retained. No framework rewrite, migration, provider provisioning, or design overhaul is included.

## Dependencies

None.

## Verification

2026-09-27, Node.js 22.14.0.

- `npx tsc --noEmit` exited 0.
- `npm run build` wrote the Vite client, `dist/server.cjs`, and printed `client boundary ok`. The scan rejects `firebase-admin`, private-key markers, and `data-testid="test-sign-in"` in `dist/assets`.
- `tests/api/routes.test.ts` checks `/api/health` returns JSON, `/showcase` and `/auth/finish` serve the SPA shell, and `/api/v1/domains` stays an API 401.
- `npx vitest run` passed the unit, API, and CLI files (19 tests). The emulator file skips unless `FIRESTORE_EMULATOR_HOST` is set.
- `npm run test:emulator` started the Firestore emulator on Java 21 and passed 3 tests.
- `.env.example` uses placeholders and separates `VITE_*` web config from server secrets.
- `/showcase` remains. No framework rewrite.

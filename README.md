# Domain Expansion

**Website Domain Tracker** — a small number of impactful items, backed by a richer domain model.

This is the canonical web implementation repository at [devin-thomas/domain-expansion](https://github.com/devin-thomas/domain-expansion). The earlier Flutter project is preserved in the archived [domain-expansion-flutter repository](https://github.com/devin-thomas/domain-expansion-flutter). See [repository consolidation](docs/REPOSITORY-CONSOLIDATION.md) for the history-preservation record.

## Current status

The implementation is deployed, but some acceptance evidence remains blocked. Current source checks pass API/CLI (48/48), unit (59/59), Firestore emulator (8/8, prior run retained), and browser (17/17), plus lint, production build, boundary, and native-runtime checks. The emulator suite covers concurrent duplicate creates and renames against Firestore. Browser auth-finish and AI recovery tests use synthetic provider/API responses; they do not count as live provider failure or sign-in evidence.

The canonical application is live at `domains.devthomas.site`; `/`, `/showcase`, `/auth/finish`, `/privacy`, `/api/health`, and `/api/openapi.json` returned HTTP 200 through Cloudflare. The verified application source is `5abf3eff8e80375dc37332ad9870fc29149be543`, READY as deployment `dpl_CCEx5UqcUP97Lo5rxjpZUTYzy6KT`; Cloudflare Worker `f8e55e50-03d0-495f-b9e1-12f5e50feba9` remains deployed. Current checks pass API/CLI (48/48), unit (59/59), browser (17/17), lint, production build, boundary, and native-runtime checks; the 8/8 Firestore emulator result is from the prior run. The prior eight-group production verifier and signed edge-IP live proof apply to source `b97e963a2c9e88bf159924be0e84f4e8888f2a75` / deployment `dpl_EWXwfyxMof3hJW4a2yPbrcqonFLX`; those full checks were not rerun for this release. Chrome AI Quick Add passed review-before-save and explicit Add, and optional purchase fields persisted after edit/reopen in the earlier live run. The user reported successful sign-in, capture, and edit on an iPhone 16 Pro running iOS 27 Safari, plus sign-in on a Galaxy S21 Ultra running Chrome; Android capture/edit remain pending. Screen-reader use and actual browser 200% zoom remain unverified. The owner completed Firebase sign-in; initial access-request and sign-in messages landed in Gmail spam. Google OAuth branding is saved in Testing for the owner-only audience and is not published. DEW-010 is **Complete**; DEW-016 and DEW-017 are **Blocked** on remaining accessibility/device and Google consent, provider, domain-verification, and publication gates. Automatic scheduled execution passed on 2026-09-29. See [docs/RELEASE.md](docs/RELEASE.md).

## Build pack

| Document | Purpose |
|---|---|
| [Context.md](Context.md) | Current product understanding, terminology, scope, and living model. |
| [ADR.md](ADR.md) | Decision rationale and explicit supersession history. |
| [SPEC.md](SPEC.md) | Testable implementation contract, API behavior, security boundaries, and release checks. |
| [tickets/README.md](tickets/README.md) | Ordered execution queue and requirement coverage. |
| [Ideas.md](Ideas.md) | Useful but non-binding deferred work. |
| [docs/RELEASE.md](docs/RELEASE.md) | Provider setup, release gates, and rollback evidence. |
| [docs/REPOSITORY-CONSOLIDATION.md](docs/REPOSITORY-CONSOLIDATION.md) | Safe history-preserving repository rename sequence. |

Follow the current user decision → Context → ADR rationale → SPEC → ticket acceptance criteria authority order. Update the pack when implementation uncovers a material contradiction; do not silently change the product. Remaining blocked acceptance is tracked in [DEW-016](tickets/DEW-016-acceptance.md) and [DEW-017](tickets/DEW-017-release.md).

## Product boundaries

Quick Add keeps five ordinary input groups. AI Quick Add produces compact editable proposals and requires explicit approval. Optional purchase email and payment-method description are edited in advanced domain details and follow the signed-in user's normal record/API/export permissions. Firebase/Firestore is the primary account/database platform; Google integrations are optional. Other users bring their own Gemini keys; a single configured owner UID may use the server credential. Admin access manages admission, not other users' portfolios. Automation uses scoped API tokens and a thin CLI. Archive is normal; permanent deletion is separately authorized. Legacy Drive migration is excluded.

## Running

```sh
npm ci
npm run dev
```

The npm lockfile pins SheetJS `xlsx@0.20.3` to the [vendor's release tarball](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/), since the npm registry package stops at the vulnerable `0.18.5`. Installers and Vercel builds need access to `cdn.sheetjs.com`.

`server.ts` serves the API and, outside production, the Vite app. `DATA_STORE=memory` is the local default. `DATA_STORE=firestore` uses the Admin SDK and still enforces per-user ownership. Client rules deny every direct read and write.

Deployed processes require `DATA_STORE=firestore`; startup fails if it is missing. Test sign-in is refused whenever `NODE_ENV=production` or Vercel deployment variables are present, even if `APP_ENV` was set differently.

```sh
npm run lint
npm test
npm run test:emulator
npm run test:browser
npm run build
npm run openapi
npm run domain-expansion -- help
```

`lint` is `tsc --noEmit`. The production build writes the client bundle and `dist/server.cjs`, then scans the client bundle for server secrets and the test sign-in control. `VITE_TEST_AUTH` and `DOMAIN_EXPANSION_TEST_AUTH` are test-only and are refused when `APP_ENV=production`.

Public Firebase web config belongs in `VITE_*`. Service-account JSON, Resend, BYOK, owner Gemini, and cursor secrets stay server-side. `.env.example` contains placeholders only.

The CLI is `domain-expansion`. From the repository root, run `npm link` to install the local command, then verify it with `domain-expansion --help` and `domain-expansion --version`. Remove the link with `npm unlink -g domain-expansion`. Windows installation/help/version and a hosted macOS 26.6.2 arm64 installation/help/version/API-CLI run were verified; see [DEW-010](tickets/DEW-010-cli.md). Set `DOMAIN_EXPANSION_API_URL` and `DOMAIN_EXPANSION_TOKEN`, or use a mode-600 config file. The command refuses a `--token` argument. Permanent delete needs `domains:delete`, `--permanent`, and, when unattended, `--yes` plus `--revision`.

The HTTP contract is [docs/openapi.json](docs/openapi.json). Regenerate it with `npm run openapi` after changing `shared/openapi.ts`.

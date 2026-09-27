# Domain Expansion

**Website Domain Tracker** — a small number of impactful items, backed by a richer domain model.

This is the canonical web implementation repository. The earlier [Flutter repository](https://github.com/devin-thomas/domain-expansion) is a domain-semantics reference, not the codebase to continue.

## Current status

DEW-001 through DEW-016 are implemented in this React/TypeScript/Vite app. Automated verification on 2026-09-27 is recorded in each ticket: typecheck, production build, client-boundary scan, unit/API/CLI tests, Firestore emulator rules and Admin SDK isolation, and Playwright in Chrome at 390×844 and 1440×900.

DEW-017 is **Blocked**. `domains.devthomas.site` is the intended host. This repository has not changed DNS, verified a Firebase sender, delivered mail to a real inbox, called live Gemini or Google APIs, checked a physical phone, or changed billing. Mocked provider tests are not live-provider success. See [docs/RELEASE.md](docs/RELEASE.md).

## Build pack

| Document | Purpose |
|---|---|
| [Context.md](Context.md) | Current product understanding, terminology, scope, and living model. |
| [ADR.md](ADR.md) | Decision rationale and explicit supersession history. |
| [SPEC.md](SPEC.md) | Testable implementation contract, API behavior, security boundaries, and release checks. |
| [tickets/README.md](tickets/README.md) | Ordered execution queue and requirement coverage. |
| [Ideas.md](Ideas.md) | Useful but non-binding deferred work. |

Follow the current user decision → Context → ADR rationale → SPEC → ticket acceptance criteria authority order. Update the pack when implementation uncovers a material contradiction; do not silently change the product. The next incomplete item is [DEW-017](tickets/DEW-017-release.md).

## Product boundaries

Quick Add keeps five ordinary input groups. AI Quick Add produces compact editable proposals and requires explicit approval. Advanced data stays behind deliberate expansion. Firebase/Firestore is the primary account/database platform; Google integrations are optional. Other users bring their own Gemini keys; a single configured owner UID may use the server credential. Admin access manages admission, not other users' portfolios. Automation uses scoped API tokens and a thin CLI. Archive is normal; permanent deletion is separately authorized. Legacy Drive migration is excluded.

## Running

```sh
npm ci
npm run dev
```

`server.ts` serves the API and, outside production, the Vite app. `DATA_STORE=memory` is the local default. `DATA_STORE=firestore` uses the Admin SDK and still enforces per-user ownership. Client rules deny every direct read and write.

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

The CLI is `domain-expansion`. Set `DOMAIN_EXPANSION_API_URL` and `DOMAIN_EXPANSION_TOKEN`, or use a mode-600 config file. The command refuses a `--token` argument. Permanent delete needs `domains:delete`, `--permanent`, and, when unattended, `--yes` plus `--revision`.

The HTTP contract is [docs/openapi.json](docs/openapi.json). Regenerate it with `npm run openapi` after changing `shared/openapi.ts`.

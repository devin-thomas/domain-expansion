# Domain Expansion

**Website Domain Tracker** — a small number of impactful items, backed by a richer domain model.

This is the canonical web implementation repository. The earlier [Flutter repository](https://github.com/devin-thomas/domain-expansion) is a domain-semantics reference, not the codebase to continue.

## Current status

The repository contains the existing React/TypeScript/Vite prototype and a completed discovery/build pack. **The Firestore, passwordless approval, BYOK, API, and CLI work described in the pack is not yet implemented or verified.** Implementation tickets start at Not started.

The target production host is `domains.devthomas.site`; this documentation is not evidence that DNS, sender configuration, or the new application has been deployed. Existing code still reflects the prototype's Firebase Google sign-in and browser/Drive persistence.

## Build pack

| Document | Purpose |
|---|---|
| [Context.md](Context.md) | Current product understanding, terminology, scope, and living model. |
| [ADR.md](ADR.md) | Decision rationale and explicit supersession history. |
| [SPEC.md](SPEC.md) | Testable implementation contract, API behavior, security boundaries, and release checks. |
| [tickets/README.md](tickets/README.md) | Ordered execution queue and requirement coverage. |
| [Ideas.md](Ideas.md) | Useful but non-binding deferred work. |

Start implementation with the first incomplete ticket whose dependencies are satisfied. Follow the current user decision → Context → ADR rationale → SPEC → ticket acceptance criteria authority order. Update the pack when implementation uncovers a material contradiction; do not silently change the product.

## Product boundaries

Quick Add keeps five ordinary input groups. AI Quick Add produces compact editable proposals and requires explicit approval. Advanced data stays behind deliberate expansion. Firebase/Firestore is the primary account/database platform; Google integrations are optional. Other users bring their own Gemini keys; a single configured owner UID may use the server credential. Admin access manages admission, not other users' portfolios. Automation uses scoped API tokens and a thin CLI. Archive is normal; permanent deletion is separately authorized. Legacy Drive migration is excluded.

## Running the existing prototype

With the project's supported Node/npm environment:

```sh
npm ci
npm run dev
```

The current development server is implemented in `server.ts`. Existing checks are:

```sh
npm run lint
npm run build
```

These are commands defined by the baseline, not claims of passing results from this documentation change. `lint` currently runs TypeScript checking. DEW-001 adds and documents the planned test commands without discarding the existing build. Keep real secrets out of source control and out of any `VITE_*` variable.

## Implementation and release evidence

The pack defines 17 implementation tickets with dependencies, acceptance criteria, and explicit verification expectations. Record actual command results and external checks inside the corresponding ticket. A mocked provider response is not proof of working email, Gemini, Google authorization, DNS, or physical-device behavior.

No application code, dependency, deployment setting, secret, or DNS record is changed by completing this documentation pack. Git-linked hosting may still perform its normal rebuild on a documentation commit.

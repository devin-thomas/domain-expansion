# DEW-012 — Extract bounded domain drafts with Gemini

**Status:** Complete

## Goal

Turn a short domain description into validated proposals without giving the model authority to save data or operate other systems.

## Scope

Implement the authenticated `/api/ai/extract` adapter, shared draft schema, minimal date/currency context, accepted primary/fallback model configuration, defensive limits, sanitized errors, and stale/timeout handling. Reuse the useful Wayfarer extract/review separation, not its broader travel interface or capabilities.

Contract: SPEC section 8; R05, R06.

## Acceptance Criteria

- Initial primary is `gemini-3.5-flash-lite`, with at most one appropriate transient-failure fallback to `gemini-3.8-flash` using the same caller key.
- Missing/invalid key, denied access, unsupported model, or exhausted billing never triggers owner-key fallback or uncontrolled retries.
- Size, draft count, output budget, rate limit, and total deadline are enforced before/around provider work.
- Structured provider output is revalidated. Missing facts remain unknown; inferred years/default currencies are labeled proposals.
- One submission may yield multiple drafts; excessive/truncated output is not silently converted into a partial success.
- Model output contains no trusted owner/role/server fields and cannot call database writes, tools, external URLs, or registrar operations.
- The provider receives only submitted text and minimal context, not a complete portfolio or another account's data.
- The endpoint makes zero domain mutations and stores no persistent chat history; logs exclude prompts, provider secrets, and raw upstream bodies.

## Dependencies

[DEW-002](DEW-002-domain-contract.md), [DEW-011](DEW-011-byok-vault.md).

## Verification

2026-09-29. `tests/api/matrix.test.ts` and the current AI failure fixtures use synthetic provider responses to cover fallback, proposal labeling, no-write behavior, owner-key isolation, and sanitized failures. The fallback success response reports the model actually selected. Three browser recovery cases use the test-only session/API harness with synthetic responses to verify late results are ignored after close, sign-out, or a synthetic account switch. Separately, three auth-finish cases use the Firebase client SDK with stubbed Identity Toolkit responses. These synthetic fixtures do not prove live upstream-outage behavior. On 2026-09-28, both configured Gemini models accepted live structured-generation requests without truncation. In an earlier production run, `POST /api/ai/extract` returned HTTP 200 and Chrome AI Quick Add completed extraction → explicit review → save; this establishes the integrated success path and no-write-before-approval behavior. Current aggregate API/CLI tests pass 48/48 and browser tests 17/17. Live transient-failure fallback remains unverified.

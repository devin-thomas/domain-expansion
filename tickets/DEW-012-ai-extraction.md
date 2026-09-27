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

2026-09-27. `tests/api/matrix.test.ts` uses a fake provider. A 429 from `gemini-3.5-flash-lite` falls back once to `gemini-3.8-flash` with the same caller key. The year is returned as a labeled proposal. The domain list stays empty after extract. A member never receives the owner key. No live Gemini request was made, so this is not real primary-model access.

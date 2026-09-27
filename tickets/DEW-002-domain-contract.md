# DEW-002 — Implement the rich canonical domain contract

**Status:** Not started

## Goal

Give every input path one precise, validated representation of a domain without making the ordinary form larger.

## Scope

Implement shared runtime schemas for public create/patch input, canonical records, settings/reminders, and AI drafts. Implement normalization, minor-unit money parsing, date-only validation, effective-date fallback, state predicates, and currency-separated calculations. Keep inferred/derived values separate from stored facts.

Contract: SPEC sections 3–4; R04, R15.

## Acceptance Criteria

- All approved advanced fields exist, including separate billing/expiration and registration/renewal costs; unknown auto-renew/cost remain null.
- Quick Add maps its single renewal-date input to expiration only; effective billing derives by fallback.
- Server-owned or unknown fields are rejected, not silently accepted by a TypeScript cast.
- Normalization preserves meaningful subdomains, handles supported IDNA input, and never checks DNS or claims ownership.
- Null, zero, false, omitted patch fields, and explicit clears have distinct tested behavior.
- USD decimal input and integer JPY input are exact; invalid precision is rejected. Currency changes require acknowledgment and cannot silently reinterpret stored amounts.
- All lifecycle/intention/archive combinations, leap dates, month boundaries, overdue dates, and currency-separated totals have deterministic unit tests.
- Reminder target/offset rules are shared with later integration workflows; no closed-browser notification claim is introduced.

## Dependencies

[DEW-001](DEW-001-foundation.md).

## Verification

Not run. Record schema and calculation fixtures/results, including at least one record containing every advanced field and tests that preserve it through partial updates.

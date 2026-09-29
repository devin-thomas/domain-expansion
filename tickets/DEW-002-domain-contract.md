# DEW-002 — Implement the rich canonical domain contract

**Status:** Complete

## Goal

Give every input path one precise, validated representation of a domain without making the ordinary form larger.

## Scope

Implement shared runtime schemas for public create/patch input, canonical records, settings/reminders, and AI drafts. Implement normalization, minor-unit money parsing, date-only validation, effective-date fallback, state predicates, and currency-separated calculations. Keep inferred/derived values separate from stored facts.

Contract: SPEC sections 3–4; R04, R15.

## Acceptance Criteria

- All approved advanced fields exist, including separate billing/expiration and registration/renewal costs, optional regex-validated `purchaseEmail`, and optional plain-text `paymentMethod` (maximum 2,000 characters); unknown auto-renew/cost remain null.
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

2026-09-27 baseline: `tests/unit/domain.test.ts` (7 tests) covers normalization, money minor units, date handling, reminders, and partial updates. The rich backup fixture covers the original advanced fields. On 2026-09-28, the focused payment-field unit/API suite passed 10/10, including email rejection, plaintext handling, bounds, clear/partial update, older-record compatibility, and format round trips. The final local unit/API/CLI and emulator suites also passed as recorded in DEW-016.

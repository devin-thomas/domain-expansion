# DEW-002 — Implement the rich canonical domain contract

**Status:** Complete

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

2026-09-27. `tests/unit/domain.test.ts` (7 tests) covers normalization, money minor units, date handling, reminders, and partial updates. `tests/unit/backup-vault.test.ts` round-trips a record that includes registrar, DNS, ownership, lifecycle, intent, auto-renew, both dates, both costs, currency, notes, archive, and reminders through JSON, YAML, and XLSX. A quick PATCH in `tests/api/matrix.test.ts` keeps notes, DNS, and auto-renew when only registrar changes.

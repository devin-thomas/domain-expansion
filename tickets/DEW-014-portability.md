# DEW-014 — Preserve advanced file portability without hidden data loss

**Status:** Complete

## Goal

Let users explicitly back up or import the richer records without introducing another ordinary capture workflow or historical migration system.

## Scope

Connect the advanced file-transfer surface to the canonical API. Implement full-fidelity non-secret JSON/YAML backups and structured XLSX round trips, retain honestly labeled domain-table exports, and provide preview/policy/revision-aware import. Restore user display/reminder settings only through an authenticated browser flow.

Contract: SPEC section 11.1; R04, R11, R15.

## Acceptance Criteria

- A rich-record fixture round-trips every supported public field, reminder configuration, date-only value, currency amount, archive state, zero, false, null, and note.
- Optional `purchaseEmail` and `paymentMethod` values survive canonical JSON/YAML/CSV/XLSX/SQL export and supported import paths; absent older fields normalize to null.
- Full backup metadata declares schema/version. Unsupported versions fail clearly instead of silently omitting fields.
- XLSX separates domain/reminder/settings metadata; CSV/SQL domain exports are not labeled complete backups. Uploaded SQL is not executed.
- Credentials, token verifiers, membership authority, other users' records, and server encryption material are never exported or importable.
- Preview makes no canonical writes. Skip/Replace/Merge changes are explicit; false and zero survive merge; missing dates are not invented.
- A stale/expired preview, oversized file, invalid field, or mixed-currency reinterpretation is rejected before atomic commit.
- Omitted records are never deleted; import cannot bypass the delete scope or replace the entire portfolio implicitly.
- File/YAML/spreadsheet parsing is bounded and tested against unsafe object construction, decompression abuse, and formula injection.
- No legacy Drive discovery, reconciliation, onboarding migration, or binary SQLite engine is added.

## Dependencies

[DEW-007](DEW-007-advanced-records.md), [DEW-009](DEW-009-rest-api.md).

## Verification

2026-09-27 baseline: JSON, YAML, and XLSX round-trip the rich fixture; SQL text is never executed; CSV is labeled lossy. The 2026-09-28 focused payment-field tests passed 10/10, covering format round trips and compatibility with older records. Final integrated portability regression remains pending.

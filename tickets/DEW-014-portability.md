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

2026-09-29 follow-up: XLSX full-fidelity export/import preserves a payment description beginning with a literal apostrophe and still stores formula-like text as text cells. CSV export/import also preserves those values; its own comma-containing footer is ignored as a comment instead of becoming a record. Focused portability tests passed 13/13 and the current unit suite passed 65/65.

2026-09-29. The unit suite passes 65/65, including rich-field and optional purchase-field round trips through supported JSON, YAML, CSV, and XLSX import/export paths, plus SQL domain-table export; older records normalize absent purchase fields to null. API/CLI tests pass 77/77. The Firestore emulator suite passed 8/8 on the current checkout. SQL text remains inert, CSV remains labeled as a domain-table export, and import commits remain previewed, revision-bound, and atomic. New CLI failure fixtures verify incomplete pagination/download exports do not replace an existing backup. Crafted XLSX formula cells and declared sparse dimensions are rejected before row conversion; CSV formula-like text is neutralized. A committed import was read back with explicit false, zero, distinct dates, and purchase fields intact.

# DE-010 — Add SQLite Backup Import/Export

## Goal

Provide a direct, full-fidelity database backup option.

## Scope

- Safe database copy/export.
- SQLite import validation.
- Schema-version checks.
- Restore through the canonical import path where practical.

## Acceptance Criteria

- Export creates a readable portable SQLite file.
- Import rejects unrelated or unsupported databases.
- Restore preserves every supported field.
- Failed restore leaves the current database unchanged.
- Active notifications are rebuilt after restore.

## Dependencies

DE-008, DE-006.

# DE-009 — Add JSON and YAML Import/Export

## Goal

Provide human-readable, full-fidelity portability.

## Scope

- JSON export/import.
- YAML export/import.
- File picker and share sheet.
- Validation errors with record and field context.

## Acceptance Criteria

- Both formats preserve all canonical model data.
- Exported files can restore an equivalent database.
- Unsupported versions fail safely.
- Invalid imports do not modify existing data.
- UTF-8 and special characters round-trip correctly.

## Dependencies

DE-008.

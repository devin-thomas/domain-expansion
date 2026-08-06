# DE-002 — Implement the Drift Database and Domain Model

## Goal

Create the local SQLite source of truth.

## Scope

- Domain table.
- Reminder table.
- Suggestion table.
- App metadata table.
- Enums and converters.
- Domain normalization.
- Effective billing and expiration date helpers.
- Seed registrar and DNS suggestions.
- Initial migration.

## Acceptance Criteria

- Required constraints are enforced.
- At least one billing or expiration date is required.
- Duplicate normalized domain names are rejected.
- Reminder rows cascade on domain deletion.
- Seed suggestions exist after first launch.
- Database and model tests pass.

## Dependencies

DE-001.

# DE-012 — Build Import Preview and Conflict Resolution

## Goal

Make imports understandable and safe.

## Scope

- Import summary.
- Validation issue display.
- Duplicate detection.
- Skip, replace, and merge policies.
- Confirmation.
- Transactional commit.
- Result summary.
- Notification rebuild.

## Acceptance Criteria

- Conflicts are detected by normalized domain name.
- User selects one policy per import.
- Skip, replace, and merge follow the specification.
- Import runs in one transaction.
- Any commit failure rolls back all changes.
- Result summary reports created, updated, skipped, and failed counts.
- Notifications are rebuilt only after successful commit.

## Dependencies

DE-009, DE-010, DE-011.

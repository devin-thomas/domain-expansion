# DE-004 — Add Search, Filters, and Sorting

## Goal

Make the domain list useful for a real portfolio.

## Scope

- Search domain, registrar, and DNS provider.
- Filters for lifecycle, ownership, renewal intent, registrar, DNS provider, currency, cost presence, archive state, and date windows.
- Sort by agreed fields.
- Empty and no-result states.

## Acceptance Criteria

- Search updates results correctly.
- Multiple filters combine predictably.
- Sorting is stable.
- Filters and sort survive navigation during the current app session.
- Archived domains are hidden by default.
- Tests cover representative combinations.

## Dependencies

DE-003.

# DE-005 — Implement the Dashboard

## Goal

Answer the two highest-value questions immediately.

## Scope

- Next payment card.
- Next-12-month expected renewal totals.
- Upcoming domain list.
- Navigation shortcuts.

## Acceptance Criteria

- Next payment uses active, non-archived, renewing domains with a future effective billing date and renewal cost.
- Ties sort by domain name.
- Next-12-month totals are grouped by currency.
- Unlike currencies are never combined.
- Empty states are clear.
- Date boundaries have automated tests.

## Dependencies

DE-002, DE-003.

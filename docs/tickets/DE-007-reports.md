# DE-007 — Build the Cost and Portfolio Reports

## Goal

Provide deeper local reporting without adding chart complexity.

## Scope

- Expected renewal costs for 30 days, 90 days, and 12 months.
- Annualized renewal cost.
- Cost by registrar.
- Counts by lifecycle, ownership, and renewal intent.
- Currency-separated results.

## Acceptance Criteria

- Every monetary result is grouped by currency.
- Archived domains are excluded by default.
- Report queries match specification rules.
- Missing-cost domains do not silently contribute zero to misleading averages.
- Report empty states are clear.
- Query tests cover mixed currencies and date boundaries.

## Dependencies

DE-002, DE-003.

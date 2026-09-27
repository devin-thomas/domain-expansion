# DEW-007 — Add advanced details without cluttering primary screens

**Status:** Not started

## Goal

Make the richer model useful for detailed work, reporting, and reminders while preserving quick everyday use.

## Scope

Implement grouped advanced record editing, settings/reminder defaults, precise date/cost controls, dashboard summaries, optional deeper reports, archive/unarchive, and the permanent-delete danger surface. Use shared calculations and optimistic revision handling, not parallel UI-only business rules.

Contract: SPEC sections 3–4 and 5; R04, R09, R11.

## Acceptance Criteria

- All approved rich fields can be read/edited on deliberate advanced surfaces; hidden fields survive ordinary edits unchanged.
- Billing/expiration and registration/renewal costs remain distinct. A currency-change warning clears old amounts only after acknowledgment.
- Dashboard presents next payment, currency-separated 12-month totals with unknown-cost disclosure, and a compact upcoming list.
- Ownership, lifecycle, intention, auto-renew, and archive are independent; changing one does not fabricate external registrar state.
- Reminder overrides, target fallback, and offsets persist. UI distinguishes in-app urgency from external delivery and does not claim native notification parity.
- Archive/unarchive preserves records and removes/restores them from the correct derived views.
- Permanent deletion is advanced, named, irreversible, and confirmed. Cancel makes no mutation; stale records are not silently deleted.
- No expanded advanced form leaks back into the next Quick Add session.

## Dependencies

[DEW-006](DEW-006-simple-capture.md).

## Verification

Not run. Record complete-rich-record round-trip, hidden-field preservation, financial/state fixtures, stale edit, archive reversal, danger cancellation, and responsive screenshots.

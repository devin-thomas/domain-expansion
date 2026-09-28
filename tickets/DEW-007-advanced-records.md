# DEW-007 — Add advanced details without cluttering primary screens

**Status:** Complete

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

2026-09-27. The rich-record fixture in `tests/unit/backup-vault.test.ts` and the partial PATCH in `tests/api/matrix.test.ts` keep advanced fields. Playwright opens More details only after an explicit click and finds zero advanced panels before that. Archive and guarded permanent delete are covered by `tests/cli/cli.test.ts` (a read/write token cannot delete; the record remains). No separate screenshot archive was saved.

# DEW-015 — Decouple optional Google integrations from application identity

**Status:** Complete

## Goal

Keep useful Calendar, Tasks, Sheets, and explicit backup actions without making Google authorization part of ordinary sign-in or saving.

## Scope

Refactor the prototype's Google authorization into an integration-only adapter. Preserve deliberate advanced actions for Calendar/Tasks, Sheets export, visible Drive backup, and user-selected current-backup restore through the shared import flow. Request only the needed permissions on demand.

Contract: SPEC section 11.2; R11, R12.

## Acceptance Criteria

- A user can authenticate and save domains without any Google authorization.
- Connecting/reconnecting a Google account does not sign into a different Firebase identity, change the Domain Expansion UID, or expose another portfolio.
- Calendar/Tasks/Sheets do not request appDataFolder scope just because the old auth helper did.
- Expired/denied Google consent explains the affected integration only; domain saves remain intact.
- Calendar/Tasks use the chosen record's effective dates/reminder semantics and selected destination, with honest external success/failure state.
- Retry after uncertain external creation avoids silent duplicate events/tasks or warns before another creation where reconciliation is unavailable.
- Visible Drive backup writes only after an explicit action; selected current-backup restore uses validated preview/commit.
- There is no hidden appDataFolder scan, legacy migration wizard, live second database, background refresh-token requirement, or automatic external deletion.
- Google tokens are excluded from exports, public logs, and other users' sessions.

## Dependencies

[DEW-007](DEW-007-advanced-records.md), [DEW-014](DEW-014-portability.md).

## Verification

2026-09-27. `src/services/googleIntegration.ts` requests `calendar.events`, `tasks`, `spreadsheets`, or `drive.file` for the chosen action. `tests/unit/legacy.test.ts` confirms `src/` has no `appDataFolder`. The settings copy says connecting Google does not change Domain Expansion sign-in, and an unconfigured client leaves saves intact. Uncertain Calendar or Tasks results do not create a second item. No live Google event, task, sheet, or Drive file was created.

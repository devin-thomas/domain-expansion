# DEW-015 — Decouple optional Google integrations from application identity

**Status:** Complete

September 29 update: Calendar now requests `calendar.events.owned`, sufficient for the adapter's primary-calendar list/create operations. The Google integration suite passes 16/16, including four authorization tests that verify each feature requests only its scope with `include_granted_scopes: false`. The latest unit suite passes 59/59; lint, build, browser/server boundary, and compiled runtime checks pass. Real provider acceptance remains pending under DEW-017. See [OAuth verification preparation](../docs/GOOGLE-OAUTH-VERIFICATION.md).

## Goal

Keep useful Calendar, Tasks, Sheets, and explicit backup actions without making Google authorization part of ordinary sign-in or saving.

## Scope

Refactor the prototype's Google authorization into an integration-only adapter. Preserve deliberate advanced actions for Calendar/Tasks, Sheets export, visible Drive backup, and user-selected current-backup restore through the shared import flow. Request only the needed permissions on demand.

Contract: SPEC section 11.2; R11, R12.

## Acceptance Criteria

- A user can authenticate and save domains without any Google authorization.
- Connecting/reconnecting a Google account does not sign into a different Firebase identity, change the Domain Expansion UID, or expose another portfolio.
- Calendar/Tasks/Sheets do not request appDataFolder scope just because the old auth helper did. Sheets uses only `drive.file`: the app creates a new spreadsheet and writes to that app-created file, without broad access to the user's existing spreadsheets. Google documents this scope as accepted by both `spreadsheets.create` and `spreadsheets.values.update` ([create](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create), [update](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update)). The current adapter sets `include_granted_scopes: false` and no longer declares legacy `drive.appdata` or broad `spreadsheets` scopes. A preexisting `gmail.readonly` declaration remains in shared Google project metadata, but this application does not request Gmail access.
- Expired/denied Google consent explains the affected integration only; domain saves remain intact.
- Calendar/Tasks use the chosen record's effective dates/reminder semantics and selected destination, with honest external success/failure state.
- Retry after uncertain external creation avoids silent duplicate events/tasks or warns before another creation where reconciliation is unavailable.
- Calendar retry uses a deterministic event ID derived from the reconciliation key plus a private marker. Lookup follows Calendar pages, but a repeated cursor, provider error, or search beyond the 200-page bound is reported as uncertain rather than prompting another create.
- Tasks reconciliation matches the exact marker line in notes, requests pages of 100, and includes completed and hidden tasks. Repeated cursors, provider errors, and searches beyond 200 pages remain uncertain. `navigator.locks` serializes same-key writes when supported; browsers without Web Locks use lookup/reconciliation without cross-tab serialization, so exactly-once creation is not guaranteed under a simultaneous race.
- Visible Drive backup writes only after an explicit action; selected current-backup restore uses validated preview/commit.
- Drive listing is limited to matching current-format, non-trashed backup filenames; download is bounded by the 2 MiB import limit before the shared import preview/commit flow.
- A Firebase account change cancels pending Google actions at session checkpoints. In particular, a newly created Sheet is not populated if the session changes before the upload step.
- There is no hidden appDataFolder scan, legacy migration wizard, live second database, background refresh-token requirement, or automatic external deletion.
- Google tokens are excluded from exports, public logs, and other users' sessions.

## Dependencies

[DEW-007](DEW-007-advanced-records.md), [DEW-014](DEW-014-portability.md).

## Verification

2026-09-28. Commit `9b4b7a4` passed lint and the focused `tests/unit/google-integration.test.ts` suite (12/12). It covers deterministic Calendar ID convergence and lost-response reconciliation; paginated Tasks exact-marker lookup including completed/hidden tasks; bounded uncertainty; selected, named Drive backup listing and 2 MiB download rejection; Sheets field projection; and cancellation after account/session changes. The adapter requests `calendar.events`, `tasks`, or `drive.file` for the selected action. Sheets uses `drive.file` to create a new spreadsheet and update only that app-created file; Google documents the scope as accepted by both create and values-update methods. No appDataFolder scan or app-identity change is part of the flow. Commit `ae83262` sets `include_granted_scopes: false`. Provider scope declarations for legacy `drive.appdata` and full `spreadsheets` access were removed; the preexisting shared-project `gmail.readonly` metadata was preserved; the current application does not request Gmail. These tests stub Google endpoints. OAuth client and branding are configured as `Domain Expansion` with canonical homepage and privacy URLs and `devthomas.site`; the audience remains owner-only in Testing, and the configuration is not published. Actual Google consent/provider action has not been granted: the Calendar action is prepared for review, with Google account selection and scoped provider approvals pending. Verify provider actions and restore separately under DEW-017.

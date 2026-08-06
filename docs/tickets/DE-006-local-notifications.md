# DE-006 — Implement Local Reminder Scheduling

## Goal

Schedule reliable local reminders from domain data.

## Scope

- Notification permission flow.
- Default offsets 30/14/7/1.
- Per-domain reminder customization.
- Billing versus expiration target resolution.
- Notification rescheduling service.
- Notification status in settings.

## Acceptance Criteria

- New domains receive default reminder records.
- `renew` targets effective billing date by default.
- `let_expire` targets effective expiration date by default.
- Archived, inactive, and transferred domains have no scheduled reminders.
- Relevant edits rebuild notifications.
- Reversing renewal intent reschedules correctly.
- Notification copy handles missing cost and same-day cases.
- iOS and Android behavior is verified.

## Dependencies

DE-003.

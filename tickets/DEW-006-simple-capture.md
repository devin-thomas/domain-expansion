# DEW-006 — Preserve fast, sparse human capture

**Status:** Complete

## Goal

Let a user jot down a domain quickly while doing something else, without confronting the richer schema.

## Scope

Connect the existing UI to authenticated persistence. Build the five-group Quick Add form, small success/error states, deliberate More details navigation, and normal domain list/search. Establish the two-mode capture shell; AI extraction/review lands in later tickets without changing the manual mode.

Contract: SPEC sections 3.1–3.3; R03, R13.

Purchase email and payment-method description are intentionally excluded from Quick Add; they belong on the advanced record surface and must not add capture friction.

## Acceptance Criteria

- Fresh Quick Add shows only Domain, Registrar, Renewal date, Renewal cost + currency, and Renewal intention as ordinary input groups.
- Advanced configuration is collapsed for every fresh capture, even after visiting an advanced record.
- An approved user can save a valid ordinary domain with one Save action and no Google, AI-key, or developer setup.
- Missing required date/name is explained inline; example/guessed dates are not silently saved. Unknown cost remains unknown.
- Save failure retains the edit and clearly says unsaved. Double submission uses the same in-flight idempotency operation.
- Account change removes the previous user's records/draft before rendering the next account.
- Keyboard focus, labels, modal scrolling, small-screen layout, and success feedback remain usable; no dashboard redesign is needed.
- The capture shell has Quick Add and AI Quick Add only. AI being unavailable never blocks manual capture.

## Dependencies

[DEW-005](DEW-005-private-persistence.md).

## Verification

2026-09-28. Final browser suite passed 10/10; focused purchase-field unit/API checks passed 10/10. Final lint/build and API/CLI, unit, and emulator suites passed (22, 18, and 5 tests respectively). Quick Add remains the original five groups; optional purchase fields stay in advanced details. No physical device was used.

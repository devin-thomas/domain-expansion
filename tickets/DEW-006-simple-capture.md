# DEW-006 — Preserve fast, sparse human capture

**Status:** Not started

## Goal

Let a user jot down a domain quickly while doing something else, without confronting the richer schema.

## Scope

Connect the existing UI to authenticated persistence. Build the five-group Quick Add form, small success/error states, deliberate More details navigation, and normal domain list/search. Establish the two-mode capture shell; AI extraction/review lands in later tickets without changing the manual mode.

Contract: SPEC sections 3.1–3.3; R03, R13.

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

Not run. Record browser checks at 390x844 and 1440x900, keyboard-only capture, server-failure/retry, and account-switch behavior. Preserve screenshots showing the five-group simplicity boundary.

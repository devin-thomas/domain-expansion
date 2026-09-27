# DEW-013 — Make AI review compact, explicit, and batch-friendly

**Status:** Not started

## Goal

Save human entry time without replacing a five-field form with an overwhelming chat or review workflow.

## Scope

Complete the ✨ AI Quick Add mode with command input, compact editable draft cards, relevant warnings, single/selected-batch approval, explicit exclusions, and stale-response protection. Use the existing canonical create/batch API for final writes.

Contract: SPEC sections 3.4 and 8; R03, R05, R13, R15.

## Acceptance Criteria

- Correct single-domain extraction needs one explicit Add action from its small review card, not an extra wizard or generic confidence screen.
- Multiple drafts support individual correction/exclusion and one clearly counted Add selected/Add valid action.
- Missing required data blocks the affected draft; it is not guessed or silently discarded. A proposed year is visible before approval.
- A duplicate opens/shows the existing record as a conflict; AI extraction never implicitly updates or deletes it.
- No domain writes occur on extraction, high confidence, timeout, rendering, or navigation. Only explicit approval invokes commit.
- Approval revalidates all selected records atomically; concurrent duplicates/stale sessions produce no partial save and preserve drafts.
- Double-click/lost-response retry yields one committed set. Late output after a new submission/sign-out/account switch is ignored.
- Errors preserve typed input; abandoning dirty drafts is deliberate. Manual capture remains available when AI is unconfigured or down.
- Visual treatment remains a compact alternative mode, with no expanded primary navigation or persistent chat history.

## Dependencies

[DEW-006](DEW-006-simple-capture.md), [DEW-009](DEW-009-rest-api.md), [DEW-012](DEW-012-ai-extraction.md).

## Verification

Not run. Record browser single/batch/correction flows, zero-write-before-approval assertions, dirty-close behavior, duplicate race, double-click recovery, and small-screen screenshots.

# DEW-010 — Deliver the thin official CLI

**Status:** Not started

## Goal

Let the owner and approved users automate domain workflows from scripts or agents without a browser or direct database access.

## Scope

Implement `domain-expansion` list/get/add/update/archive/unarchive/delete/import/export/help/version commands over the public API. Add environment/protected-file credential configuration, readable and machine output, safe pagination, stable retry keys, revision options, dry-run import, and explicit destructive confirmation.

Contract: SPEC section 10; R07, R08, R09.

## Acceptance Criteria

- The CLI runs through a documented local installation on Windows and macOS; package-registry publication is not required.
- All operations use the API, not Firestore or copied Firebase sessions. Token handling redacts logs and avoids secret command-line arguments.
- Credentials are not forwarded to untrusted hosts or redirect destinations; HTTPS is required outside explicit local development.
- Machine output is parseable, errors go to stderr, and failures have nonzero exit status.
- List/export follow pagination; failed exports do not overwrite a good file with incomplete content.
- Write retries retain idempotency keys. Update/delete preconditions are explicit rather than silently overwriting a newer record.
- Archive/unarchive works with write scope. Permanent delete requires delete scope, `--permanent`, and interactive confirmation; unattended use additionally requires `--yes` and a deliberate revision.
- Missing confirmation/EOF performs no destructive request. A read/write token cannot delete even with all flags.
- Import preview and commit obey the same limits/policies as the API and never clear omitted records.

## Dependencies

[DEW-009](DEW-009-rest-api.md).

## Verification

Not run. Record subprocess/API integration tests, Windows/macOS evidence or exact platform limitation, redaction checks, pagination, interrupted export, and destructive-command negative tests.

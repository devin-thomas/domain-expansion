# DEW-010 — Deliver the thin official CLI

**Status:** Complete

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

2026-09-29. `tests/cli/cli.test.ts` drives `cli/main.ts` against the local API: refusal of `--token`, help/version, add, idempotent replay, list, archive, and permanent delete refused for a read/write token. New failure fixtures confirm pagination/download export errors preserve an existing backup file. On Windows 11 Pro (build 26200), PowerShell 7.6.6, Node 24.18.0, and npm 12.1.0, `npm link` installed the command and global `domain-expansion --help`, `domain-expansion --version`, and `domain-expansion list --version` worked. The current API/CLI aggregate passes 77/77 on Windows; the earlier Linux run is historical evidence only. Hosted macOS acceptance passed in GitHub Actions run [36597634325](https://github.com/devin-thomas/domain-expansion/actions/runs/36597634325) at workflow commit `1bd5ad4edccc9ab9990ca460ae449f60c4159630`: macOS 26.6.2, arm64, Node 24.18.0, npm 11.16.0; `npm ci`, `npm link`, global `--help`/`--version`, the 48/48 API/CLI suite, and `npm unlink` all succeeded. The separate local `m1` SSH connection timed out, but the hosted run verifies actual macOS CLI runtime acceptance. A second hosted run on current source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` passed global installation and API/CLI 77/77 in [run 36600850750](https://github.com/devin-thomas/domain-expansion/actions/runs/36600850750). DEW-010 is Complete.

# Domain Expansion — Implementation Queue

**Pack status:** discovery complete; specification written. **Implementation status:** all 17 tickets Not started. This queue is for the canonical web repository, not the Flutter donor project.

Read [Context](../Context.md), [ADR](../ADR.md), and [SPEC](../SPEC.md) first. Implement the first incomplete ticket whose dependencies are satisfied. Numerical order is a valid execution order; independent work may run in parallel only without bypassing dependencies. Update each ticket with real verification evidence before changing its status. Do not mark a ticket complete because its specification exists.

## Ordered tickets and traceability

| Ticket | Outcome | Dependencies | Requirements |
|---|---|---|---|
| [DEW-001](DEW-001-foundation.md) | Runnable server/client boundary and test foundation | None | R13, R14, R15 |
| [DEW-002](DEW-002-domain-contract.md) | Rich validated domain contract and pure calculations | 001 | R04, R15 |
| [DEW-003](DEW-003-admission-auth.md) | Approved membership and passwordless identity | 001 | R01, R02 |
| [DEW-004](DEW-004-admin-notifications.md) | Request queue, approval, and admin email delivery | 003 | R01, R10 |
| [DEW-005](DEW-005-private-persistence.md) | Private Firestore CRUD and prototype persistence removal | 002, 003 | R02, R04, R12, R15 |
| [DEW-006](DEW-006-simple-capture.md) | Sparse human capture and reliable saved/unsaved states | 005 | R03, R13 |
| [DEW-007](DEW-007-advanced-records.md) | Advanced detail, dashboard, reminders, archive/danger UI | 006 | R04, R09, R11 |
| [DEW-008](DEW-008-personal-tokens.md) | Revocable, separately scoped automation credentials | 003, 005 | R02, R08, R09 |
| [DEW-009](DEW-009-rest-api.md) | Documented versioned API, batches, and portability contract | 002, 005, 008 | R07, R08, R15 |
| [DEW-010](DEW-010-cli.md) | Thin cross-platform CLI | 009 | R07, R08, R09 |
| [DEW-011](DEW-011-byok-vault.md) | Encrypted credentials, consent, exact owner exception | 003 | R06 |
| [DEW-012](DEW-012-ai-extraction.md) | Bounded structured Gemini extraction without writes | 002, 011 | R05, R06 |
| [DEW-013](DEW-013-ai-review.md) | Lightweight single/batch review and explicit approval | 006, 009, 012 | R03, R05, R13, R15 |
| [DEW-014](DEW-014-portability.md) | Advanced file backup/import/export | 007, 009 | R04, R11, R15 |
| [DEW-015](DEW-015-google-integrations.md) | Optional integration authorization and deliberate actions | 007, 014 | R11, R12 |
| [DEW-016](DEW-016-acceptance.md) | Security, integration, responsive, and recovery evidence | 004, 007, 010, 013, 014, 015 | R01–R13, R15 |
| [DEW-017](DEW-017-release.md) | Verified canonical host, sender setup, showcase, release | 016 | R14, R16 |

There is no legacy Drive migration ticket. ADR-020 explicitly excludes it. Current-format file import and user-requested visible backup do not authorize historical discovery or reconciliation.

## Shared completion rules

Every ticket must preserve the five-group manual form, the separate reviewed AI mode, the per-user ownership boundary, and the common domain service. No new feature may be hidden inside an infrastructure ticket. Secrets stay out of source control and verification logs. UI, API, and CLI may have different interaction styles but not different data rules.

Use ticket status Not started → In progress → Complete, or Blocked with the exact missing input. Record actual commands, browser/device context, safe fixture descriptions, and external-service checks in the ticket's Verification section. Mocked provider tests are valuable but are not real-provider evidence. Partial live access must not stop independent implementation or justify fabricated success.

Deployment inputs, DNS permissions, recipient addresses, provider credentials, and billing consent are execution prerequisites, not unanswered product questions. This pack does not itself authorize provisioning paid services, sending test mail to arbitrary recipients, or a production cutover.

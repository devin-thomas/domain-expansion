# Domain Expansion — Implementation Queue

Application implementation `2c1cdc300e768b2379e524e25a99aa11e1857cd4` is served by READY `dpl_HFiEBsBNzkBF8AsZpVMBvueTpV7d` on the canonical alias; previous accessibility source `bc5601eb4e969a9d8c19f6eada13d8c499629341` and dashboard checkpoint `0d5168402199aeb49d25364643c155bb1440f189` also succeeded. Six canonical routes returned HTTP 200 after those deployments. The eight-group live verifier also passed on the current implementation served by documentation head `dcdd25f1934fb8724e64538a06ff8e04ac46e4aa`; the earlier run on `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` is retained below.

**Pack status:** discovery complete; specification written. **Implementation and acceptance status (2026-09-29):** core implementation is deployed, but not all acceptance is complete. DEW-010 is **Complete** after hosted macOS CLI verification; DEW-016 is **Blocked** pending Android capture/edit, screen-reader, actual browser-zoom, and Google-provider evidence; DEW-017 is **Blocked** pending Google consent/provider actions, domain verification, publication, and any required review. Current source checks passed API/CLI (77/77), unit (65/65), browser (18/18), lint, production build, boundary, and native-runtime checks. The Firestore emulator suite passed 8/8 in the prior run. The emulator covers concurrent duplicate creates/renames and cross-user name isolation. Browser auth-finish and AI recovery tests use synthetic provider/API responses and are not live failure or sign-in evidence. An earlier fully production-verified application source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` was READY as deployment `dpl_BpiFAQzwJmMbzyW9WW1vMrzUTgYm`; Worker `f8e55e50-03d0-495f-b9e1-12f5e50feba9` remains deployed. The eight-group production verifier passed on application source `e0da35a48f9426a8899cd6e7959a451bf03dc5c1` / deployment `dpl_BpiFAQzwJmMbzyW9WW1vMrzUTgYm`; synthetic records and the temporary identity were removed, and temporary PATs were revoked. The signed edge-IP live proof remains from prior source `b97e963a2c9e88bf159924be0e84f4e8888f2a75` / deployment `dpl_EWXwfyxMof3hJW4a2yPbrcqonFLX`. Earlier production checks verified canonical routes, conditional writes, owner Firebase sign-in, AI explicit review/save, purchase-field persistence, and automatic retry schedule. The user reported successful sign-in/capture/edit on an iPhone 16 Pro/iOS 27 Safari and sign-in only on a Galaxy S21 Ultra/Chrome; Android capture/edit remain pending. Screen-reader and actual browser zoom remain unverified. Google OAuth branding remains unpublished in owner-only Testing. The purchase-field requirement R17 is tracked across DEW-002, 006, 007, 009, 014, and 016. This queue is for the canonical web repository, not the preserved Flutter history.

Read [Context](../Context.md), [ADR](../ADR.md), and [SPEC](../SPEC.md) first. Implement the first incomplete ticket whose dependencies are satisfied. Numerical order is a valid execution order; independent work may run in parallel only without bypassing dependencies. Update each ticket with real verification evidence before changing its status. Do not mark a ticket complete because its specification exists.

## Ordered tickets and traceability

| Ticket | Outcome | Dependencies | Requirements |
|---|---|---|---|
| [DEW-001](DEW-001-foundation.md) | Runnable server/client boundary and test foundation | None | R13, R14, R15 |
| [DEW-002](DEW-002-domain-contract.md) | Rich validated domain contract and pure calculations | 001 | R04, R15, R17 |
| [DEW-003](DEW-003-admission-auth.md) | Approved membership and passwordless identity | 001 | R01, R02 |
| [DEW-004](DEW-004-admin-notifications.md) | Request queue, approval, and admin email delivery | 003 | R01, R10 |
| [DEW-005](DEW-005-private-persistence.md) | Private Firestore CRUD and prototype persistence removal | 002, 003 | R02, R04, R12, R15 |
| [DEW-006](DEW-006-simple-capture.md) | Sparse human capture and reliable saved/unsaved states | 005 | R03, R13, R17 |
| [DEW-007](DEW-007-advanced-records.md) | Advanced detail, dashboard, reminders, archive/danger UI | 006 | R04, R09, R11, R17 |
| [DEW-008](DEW-008-personal-tokens.md) | Revocable, separately scoped automation credentials | 003, 005 | R02, R08, R09 |
| [DEW-009](DEW-009-rest-api.md) | Documented versioned API, batches, and portability contract | 002, 005, 008 | R07, R08, R15, R17 |
| [DEW-010](DEW-010-cli.md) | Thin cross-platform CLI | 009 | R07, R08, R09 |
| [DEW-011](DEW-011-byok-vault.md) | Encrypted credentials, consent, exact owner exception | 003 | R06 |
| [DEW-012](DEW-012-ai-extraction.md) | Bounded structured Gemini extraction without writes | 002, 011 | R05, R06 |
| [DEW-013](DEW-013-ai-review.md) | Lightweight single/batch review and explicit approval | 006, 009, 012 | R03, R05, R13, R15 |
| [DEW-014](DEW-014-portability.md) | Advanced file backup/import/export | 007, 009 | R04, R11, R15, R17 |
| [DEW-015](DEW-015-google-integrations.md) | Optional integration authorization and deliberate actions | 007, 014 | R11, R12 |
| [DEW-016](DEW-016-acceptance.md) | Security, integration, responsive, and recovery evidence | 004, 007, 010, 013, 014, 015 | R01–R13, R15, R17 |
| [DEW-017](DEW-017-release.md) | Verified canonical host, sender setup, showcase, release | 016 | R14, R16 |

There is no legacy Drive migration ticket. ADR-020 explicitly excludes it. Current-format file import and user-requested visible backup do not authorize historical discovery or reconciliation.

## Shared completion rules

Every ticket must preserve the five-group manual form, the separate reviewed AI mode, the per-user ownership boundary, and the common domain service. No new feature may be hidden inside an infrastructure ticket. Secrets stay out of source control and verification logs. UI, API, and CLI may have different interaction styles but not different data rules.

Use ticket status Not started → In progress → Complete, or Blocked with the exact missing input. Record actual commands, browser/device context, safe fixture descriptions, and external-service checks in the ticket's Verification section. Mocked provider tests are valuable but are not real-provider evidence. Partial live access must not stop independent implementation or justify fabricated success.

Deployment inputs, DNS permissions, recipient addresses, provider credentials, and billing consent are execution prerequisites, not unanswered product questions. This pack does not itself authorize provisioning paid services, sending test mail to arbitrary recipients, or a production cutover.

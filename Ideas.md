# Domain Expansion — Ideas and Deferred Scope

Non-binding possibilities only. Current required behavior is in [Context.md](Context.md) and [SPEC.md](SPEC.md). Do not build an item merely because it appears here.

## Branded authentication email delivery

Firebase sends passwordless links initially. Resend is already approved for administrator access-request alerts, but using it for authentication requires a separate explicit change if Firebase's templates or operating limits prove unsuitable. Firebase-generated links can still be retained if delivery changes. Do not silently switch the auth sender.

## Outbound webhooks and additional automation clients

User-configurable domain-change/renewal webhooks, an MCP server, and reusable agent skills may sit on the versioned API after concrete consumers exist. REST API and the official CLI are required now; these other clients are not. None should access Firestore directly or bypass scopes.

## Registrar integrations and price discovery

Registrar/DNS synchronization, receipt discovery, renewal-price lookup, WHOIS/RDAP enrichment, and actual registrar auto-renew changes are separate future projects. The current application records user-provided information; it does not verify ownership or operate the registrar.

## Richer AI source handling

Attachments, screenshots, invoices, direct mailbox access, and specialized document extraction are not required for the initial text command box. Any later source-specific workflow must retain explicit reviewed approval and clear provider-data disclosure.

## Additional AI providers

Start with Gemini and the accepted model/fallback policy. The replaceable adapter should permit later providers without presenting a provider marketplace or arbitrary endpoint configuration now. Shared paid AI subsidies for other users require a new decision; BYOK and the exact owner exception are the current policy.

## Additional reminder delivery

App-sent renewal emails, web push, reliably scheduled browser-closed notifications, native notification parity, and automatic two-way Calendar synchronization may be evaluated separately. Reminder configuration, in-app urgency, and explicit existing Calendar/Tasks workflows are in the current specification. Resend's approved notification role must not grow silently.

## Support access and collaboration

Explicit consent-based support access, team/shared portfolios, organizations, delegated portfolio roles, public portfolio sharing, and billing plans remain outside scope. Application administrators do not acquire portfolio access simply by managing invitations.

## Expanded storage and offline behavior

Full offline mutation queues, binary SQLite backup parity with Flutter, scheduled cloud backups, and cost-history analytics can be added only after a demonstrated need. The current cloud application has one authoritative Firestore store and explicit current-format portability, not a second live database.

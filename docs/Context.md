# Domain Expansion — Context

## Product Summary

**Domain Expansion** is a personal-first, local-only mobile application for tracking website domains, their registrars, DNS providers, renewal and expiration dates, costs, ownership relationships, renewal intent, and reminders.

**SEO subtitle:** Website Domain Tracker

The first release targets feature parity on:

- iPhone
- Android phones

The product does not require accounts, authentication, a backend, cloud synchronization, registrar APIs, or ownership verification.

## Product Goal

Provide a fast, reliable way to answer:

1. Which domain payment is next?
2. How much will it cost, and which domain is it for?
3. What is the expected total renewal cost over the next 12 months?
4. Which domains are active, inactive, transferred, owned, managed, renewing, or being allowed to expire?
5. When should the user be reminded about billing or expiration?

## Primary User

The initial product is designed around the creator's personal needs. It may remain usable by others, but broad consumer requirements must not expand the first release.

## Ubiquitous Language

### Domain

A user-entered record representing a website domain. The app does not verify whether the user owns or manages it.

### Ownership Type

The user's relationship to the domain:

- `owned`
- `managed`

Ownership type is independent from lifecycle state.

### Lifecycle State

The operational state of the domain:

- `active`
- `inactive`
- `transferred`

"Expiring" is not stored as a lifecycle state. It is derived from dates, renewal intent, and the current date.

### Renewal Intent

The state of the user's payment method relative to the domain:

- `renew`
- `let_expire`

There is no undecided state.

Changing `let_expire` back to `renew` must be supported.

### Expiration Date

The registrar-facing date when the domain expires.

### Billing Date

The expected date when the registrar charges the user's payment method.

Billing and expiration dates may differ. When only one is supplied, both concepts resolve to the supplied date.

### Effective Billing Date

`billing_date` when present; otherwise `expiration_date`.

### Effective Expiration Date

`expiration_date` when present; otherwise `billing_date`.

### Registration Cost

The amount initially paid to register the domain.

### Renewal Cost

The expected recurring amount charged to renew the domain.

### Reminder

A local notification scheduled relative to either the effective billing date or effective expiration date.

The default offsets are:

- 30 days before
- 14 days before
- 7 days before
- 1 day before

### Registrar

A free-text value describing where the domain is registered. Previously entered values become suggestions.

Seed suggestions:

- Cloudflare
- Namecheap
- Porkbun
- Name.com

### DNS Provider

A free-text value describing where DNS is managed. Previously entered values become suggestions.

Seed suggestions should include the same initial providers as the registrar list.

### Expanded

The confirmation message shown after the first domain is successfully added.

## Supported Currencies

Currency is stored per domain.

- USD — `$`
- GBP — `£`
- EUR — `€`
- INR — `₹`
- CNY — `¥`
- JPY — `¥`
- CAD — `C$`

No exchange rates, conversions, or external currency data are required.

Changing a domain's currency when registration or renewal cost is already stored must display a warning. Confirming the change clears the stored monetary values.

## Required Domain Fields

A domain cannot be saved without:

- Domain name
- Lifecycle state
- Ownership type
- Renewal intent
- At least one of billing date or expiration date

Optional fields include:

- Registrar
- DNS provider
- Registration date
- Billing date when expiration date exists
- Expiration date when billing date exists
- Registration cost
- Renewal cost
- Currency
- Notes
- Reminder customization

## Dashboard Priorities

The dashboard must prominently show:

### Next Payment

- Domain
- Effective billing date
- Renewal amount

Only domains with renewal intent `renew` and a future effective billing date qualify.

### Expected Renewal Cost — Next 12 Months

The total expected renewal cost for renewing domains with an effective billing date occurring during the next 12 months.

Totals must not combine unlike currencies into one misleading number. The UI must show separate totals per currency when more than one currency is present.

## Reports

A dedicated cost/report view provides deeper summaries beyond the dashboard.

Initial report candidates:

- Expected renewal cost by currency
- Payments due in the next 30 days
- Payments due in the next 90 days
- Payments due in the next 12 months
- Annualized renewal cost by currency
- Cost by registrar
- Domain count by lifecycle state
- Domain count by ownership type
- Domain count by renewal intent

## Filtering and Sorting

No projects, tags, folders, or custom groups are included.

Native filters may use:

- Lifecycle state
- Ownership type
- Renewal intent
- Registrar
- DNS provider
- Currency
- Has renewal cost
- Has registration cost
- Upcoming billing window
- Upcoming expiration window

Sort options should include:

- Domain name
- Billing date
- Expiration date
- Renewal cost
- Registration cost
- Registrar
- Recently created
- Recently updated

## Reminder Rules

Default reminder behavior:

- `renew`: reminders target the effective billing date
- `let_expire`: reminders target the effective expiration date

The user may customize reminder offsets and target behavior per domain.

Reminder behavior must be reversible and recalculated after relevant edits.

Notifications are local only.

## Import and Export

Supported full-fidelity formats:

- JSON
- YAML
- SQLite
- XLSX

CSV is explicitly excluded because exports must not lose relational or configuration data.

Every supported format must preserve:

- Domains
- Reminder configuration
- Registrar and DNS suggestions
- App metadata required for restoration
- Schema/export format version
- All supported fields

Import must:

1. Validate the file.
2. Show a preview.
3. Detect conflicts by normalized domain name.
4. Let the user choose one conflict policy for the import:
   - Skip
   - Replace
   - Merge
5. Require confirmation before committing.
6. Apply the import transactionally.

Merge means incoming non-empty values replace matching existing values, while missing incoming values leave existing values unchanged. Reminder collections are replaced by the incoming collection when the incoming record explicitly includes reminders.

## Non-Goals for 1.0

- Accounts
- Authentication
- Cloud sync
- Registrar APIs
- WHOIS or RDAP lookups
- Ownership verification
- Automatic email parsing
- Automatic renewal-price lookup
- Currency conversion
- Historical price tracking
- Total amount spent
- Attachments
- Desktop support
- Web support
- Widgets
- Projects, tags, or folders

# Domain Expansion — Version 1.0 Product and Implementation Specification

## 1. Objective

Build a polished local-first Flutter mobile application that tracks domains, their dates and costs, and schedules reliable local reminders.

The app must be useful for the creator's real domain portfolio and complete enough to serve as a finished first Flutter project.

## 2. Success Criteria

Version 1.0 is complete when a user can:

1. Create, view, edit, archive, and delete domain records.
2. Track owned and managed domains.
3. Track active, inactive, and transferred domains.
4. Mark each domain to renew or be allowed to expire.
5. Track registration and renewal costs.
6. Track billing and expiration dates with mutual fallback.
7. Receive customizable local reminders.
8. See the next expected payment.
9. See expected renewal cost over the next 12 months, separated by currency.
10. Filter, sort, and search domains.
11. Import and export complete data using JSON, YAML, SQLite, and XLSX.
12. Use equivalent functionality on iPhone and Android.

## 3. Technical Stack

Recommended packages may be adjusted only when implementation constraints require it.

- Flutter
- Dart
- Drift
- SQLite
- Riverpod
- go_router
- flutter_local_notifications
- timezone
- intl
- file_picker
- path_provider
- share_plus
- yaml
- archive or equivalent where needed
- spreadsheet_decoder or excel package for XLSX

## 4. Application Structure

Suggested feature-oriented structure:

```text
lib/
  app/
    app.dart
    router.dart
    theme.dart
  core/
    database/
    import_export/
    notifications/
    formatting/
    validation/
  features/
    dashboard/
    domains/
    reports/
    settings/
  shared/
    widgets/
    models/
```

Avoid speculative abstraction. Extract shared code only after a second real use appears.

## 5. Data Model

### 5.1 Domain Table

```text
id                         integer primary key
name                       text unique, required
normalized_name            text unique, required
ownership_type             text required
lifecycle_state            text required
renewal_intent             text required
registrar                   text nullable
dns_provider                text nullable
registration_date           date nullable
billing_date                date nullable
expiration_date             date nullable
registration_cost_minor     integer nullable
renewal_cost_minor          integer nullable
currency_code               text required, default USD
notes                       text nullable
is_archived                 boolean required, default false
created_at                  datetime required
updated_at                  datetime required
```

Validation:

- `name` must be trimmed and non-empty.
- `normalized_name` is lowercase, trimmed, and stripped of a trailing period.
- At least one of `billing_date` or `expiration_date` must be present.
- Money values must be zero or greater.
- Currency code must be supported.
- Ownership, lifecycle, and renewal intent must match supported values.

The app is not required to validate DNS syntax beyond basic normalization. Internationalized domains may be stored as entered.

### 5.2 Reminder Table

```text
id                 integer primary key
domain_id          integer required, foreign key cascade delete
days_before        integer required
target_type        text required
is_enabled         boolean required
created_at         datetime required
updated_at         datetime required
```

`target_type`:

- `default`
- `billing`
- `expiration`

For `default`, resolve based on renewal intent.

A unique constraint should prevent duplicate enabled reminders for the same domain, target, and offset.

### 5.3 Suggestion Table

```text
id                 integer primary key
suggestion_type    text required
value              text required
normalized_value   text required
created_at         datetime required
last_used_at       datetime required
```

Suggestion types:

- registrar
- dns_provider

Seed both types with:

- Cloudflare
- Namecheap
- Porkbun
- Name.com

### 5.4 App Metadata

Store:

- database schema version
- export schema version
- default reminder offsets
- default currency
- default notification time
- onboarding completed
- first domain confirmation shown

## 6. Date Semantics

A domain is valid when at least one of the two important dates exists.

```text
effectiveBillingDate =
  billingDate ?? expirationDate

effectiveExpirationDate =
  expirationDate ?? billingDate
```

A date-only value must remain a date-only value in storage and import/export. Do not introduce UTC shifts that change the calendar day.

Notification scheduling uses the user's local timezone and a configurable default notification time.

## 7. Cost Semantics

Store amounts in minor units.

Examples:

- `$12.99` USD → `1299`
- `£10.00` GBP → `1000`
- `¥1500` JPY → `1500`

Supported currencies:

| Code | Symbol |
|---|---|
| USD | $ |
| GBP | £ |
| EUR | € |
| INR | ₹ |
| CNY | ¥ |
| JPY | ¥ |
| CAD | C$ |

Never calculate a combined monetary total across different currencies.

### Currency Change Rule

When a record already has either cost:

1. User selects a different currency.
2. Show warning that saved cost values cannot be converted.
3. Cancel leaves all fields unchanged.
4. Confirm changes the currency and clears both cost fields.

## 8. Screens

### 8.1 Dashboard

Display:

- App title
- Next payment card
- Next-12-month expected cost card
- Upcoming domains
- Shortcut to add a domain
- Shortcut to reports
- Shortcut to all domains

#### Next Payment Query

Include non-archived domains where:

- lifecycle state is active
- renewal intent is renew
- effective billing date is today or later
- renewal cost exists

Sort by effective billing date ascending, then domain name.

Display:

- Domain
- Date
- Formatted amount

When no qualifying payment exists, show a clear empty state.

#### Next 12 Months Query

Include non-archived domains where:

- lifecycle state is active
- renewal intent is renew
- effective billing date falls from today through 12 calendar months from today
- renewal cost exists

Group and sum by currency.

### 8.2 Domain List

Capabilities:

- Search by domain name, registrar, or DNS provider
- Filter
- Sort
- Show archived toggle
- Add domain button

Each row displays:

- Domain
- Registrar when available
- Effective relevant date
- Renewal cost when available
- Ownership/lifecycle/renewal intent indicators

Avoid excessive badges.

### 8.3 Add/Edit Domain

Sections:

1. Identity
2. Relationship and state
3. Dates
4. Costs
5. Registrar and DNS
6. Reminders
7. Notes

Required-field validation should occur inline and on submit.

After the first successful domain creation, show:

> Expanded

### 8.4 Domain Detail

Display all stored data and derived values.

Actions:

- Edit
- Archive/unarchive
- Delete
- Duplicate
- Change renewal intent
- View scheduled reminders

Delete requires confirmation.

### 8.5 Reports

Initial sections:

- Expected renewal costs by currency for:
  - next 30 days
  - next 90 days
  - next 12 months
- Annualized renewal costs by currency
- Cost by registrar and currency
- Counts by lifecycle
- Counts by ownership
- Counts by renewal intent

No chart library is required. Lists and summary cards are sufficient for 1.0.

### 8.6 Import/Export

Separate tabs or sections for:

- Export
- Import

Export options:

- JSON
- YAML
- SQLite
- XLSX

Import flow:

1. Select file.
2. Detect format.
3. Parse into canonical in-memory export model.
4. Validate schema version and data.
5. Show counts and validation issues.
6. Detect conflicts.
7. Select skip, replace, or merge.
8. Confirm.
9. Import in one database transaction.
10. Rebuild scheduled notifications.
11. Show result summary.

### 8.7 Settings

- Default reminder offsets
- Default notification time
- Default currency
- Notification permission/status
- Import/export
- App version
- Database schema version

## 9. Reminder Behavior

### Default Creation

New domains receive enabled reminders at:

- 30 days
- 14 days
- 7 days
- 1 day

Target is `default`.

### Resolution

- Renewal intent `renew` → billing
- Renewal intent `let_expire` → expiration

### Notification Copy

Renewing:

> `{domain}` is expected to renew for `{amount}` in `{days}` days.

When renewal cost is missing:

> `{domain}` is expected to renew in `{days}` days.

Letting expire:

> `{domain}` is set to expire in `{days}` days.

Same-day variants should not say "in 0 days."

### Rescheduling Triggers

Rebuild a domain's notifications after changes to:

- Domain name
- Billing date
- Expiration date
- Renewal intent
- Renewal cost
- Currency
- Reminder offsets
- Reminder target
- Reminder enabled state
- Archive state
- Lifecycle state

Do not schedule reminders for archived, inactive, or transferred domains.

## 10. Import/Export Canonical Model

Every format maps to the same logical structure:

```text
export_version
exported_at
app_metadata
domains[]
  domain fields
  reminders[]
suggestions[]
```

### JSON

Human-readable UTF-8 JSON.

### YAML

Equivalent structure to JSON with no omitted fields that would alter meaning.

### SQLite

A copy or portable database containing the supported schema and metadata.

### XLSX

Workbook sheets:

- `Metadata`
- `Domains`
- `Reminders`
- `Suggestions`

Foreign-key relationships use stable exported domain IDs.

XLSX import must preserve all supported fields.

## 11. Merge Semantics

Conflict key: normalized domain name.

### Skip

Keep the existing record unchanged.

### Replace

Delete or overwrite the existing record and its reminders using the incoming record.

### Merge

- Incoming non-null scalar values replace existing values.
- Incoming null scalar values preserve existing values.
- Incoming reminders replace existing reminders only when reminders are explicitly present in the source.
- Suggestions are unioned case-insensitively.

All operations occur transactionally.

## 12. Error Handling

User-facing errors must explain:

- What failed
- Whether any data changed
- What the user can do next

Import errors must include row, sheet, record, or field location when practical.

A failed transactional import must leave the existing database unchanged.

## 13. Accessibility and UX

- Support system light and dark mode.
- Respect text scaling.
- Provide semantic labels for controls.
- Use minimum touch target sizes.
- Do not rely only on color for state.
- Keep destructive actions visually distinct and confirmed.
- Preserve entered form data when validation fails.

## 14. Testing

Minimum automated coverage:

### Unit Tests

- Domain normalization
- Effective date fallback
- Currency minor-unit formatting
- Dashboard next-payment selection
- 12-month totals by currency
- Renewal-intent reminder target resolution
- Merge semantics
- Import validation

### Database Tests

- Schema creation
- CRUD
- Constraints
- Cascade deletes
- Migration path
- Transaction rollback

### Widget Tests

- Add-domain validation
- Currency change warning
- Dashboard empty and populated states
- Import conflict policy selection

### Integration Tests

- Create → edit → schedule reminders
- Export → reset → import → compare data
- Import rollback on invalid data

## 15. Definition of Done

A ticket is done when:

- Acceptance criteria pass.
- Relevant tests exist and pass.
- Analyzer and formatter pass.
- No debug-only behavior remains.
- iPhone and Android behavior is checked when platform behavior is involved.
- Context.md and ADR.md are updated if the implementation changes shared understanding or a decision.

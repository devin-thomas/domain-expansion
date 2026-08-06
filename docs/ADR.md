# Domain Expansion — Architecture Decision Record

This file is the canonical record of accepted product and technical decisions.

---

## ADR-001 — Flutter for the Mobile Client

**Status:** Accepted

**Decision:** Build the application in Flutter with iPhone and Android feature parity.

**Rationale:** The project exists partly to learn Flutter while producing a useful local-first app from one codebase.

**Consequences:**

- iOS and Android are the only 1.0 targets.
- Platform-specific behavior must remain minimal.
- Desktop support is deferred to major releases.

---

## ADR-002 — SQLite Is the Source of Truth

**Status:** Accepted

**Decision:** Store application data locally in SQLite.

**Rationale:** The app requires structured records, filtering, sorting, migrations, transactional imports, and reliable offline behavior.

**Implementation direction:** Use Drift unless a concrete implementation issue justifies direct SQLite access.

**Consequences:**

- No backend is required.
- Schema migrations must be versioned and tested.
- SQLite export may provide a direct full-fidelity backup.

---

## ADR-003 — Local-Only Architecture

**Status:** Accepted

**Decision:** Version 1.0 has no accounts, authentication, backend, or cloud synchronization.

**Rationale:** These features do not contribute to the core learning or product goal and would substantially expand scope.

**Consequences:**

- The user owns and controls the local data.
- Backup and transfer are handled through import/export.
- App deletion may delete data unless the user exports it.

---

## ADR-004 — Separate Ownership and Lifecycle Axes

**Status:** Accepted

**Decision:** Store ownership type and lifecycle state separately.

**Ownership type:**

- owned
- managed

**Lifecycle state:**

- active
- inactive
- transferred

**Rationale:** A managed domain can independently be active, inactive, or transferred.

---

## ADR-005 — Expiringness Is Derived

**Status:** Accepted

**Decision:** Do not store `expiring` as a lifecycle state.

**Rationale:** Expiringness can be derived from the relevant date, renewal intent, reminder horizon, and current date. Persisting it would create stale or contradictory data.

---

## ADR-006 — Renewal Intent Is Binary

**Status:** Accepted

**Decision:** Renewal intent is one of:

- renew
- let_expire

**Rationale:** The field represents whether the user's payment method is intended to be charged. Domain purchasing systems do not expose an undecided payment state.

**Consequences:** The choice must be reversible.

---

## ADR-007 — Billing and Expiration Dates Use Mutual Fallback

**Status:** Accepted

**Decision:** Billing and expiration dates may be stored separately. At least one is required.

- Effective billing date = billing date, otherwise expiration date.
- Effective expiration date = expiration date, otherwise billing date.

**Rationale:** Registrars may charge before expiration, but many domains use the same date for both concepts.

**Consequences:** The UI should avoid forcing duplicate entry when dates are identical.

---

## ADR-008 — Registration and Renewal Costs Only

**Status:** Accepted

**Decision:** Version 1.0 stores:

- registration cost
- current expected renewal cost

**Rationale:** Historical pricing and total spend add a transaction-history model that is not needed for the first release.

---

## ADR-009 — Money Uses Integer Minor Units

**Status:** Accepted

**Decision:** Store monetary values as integer minor units plus an ISO-like currency code.

**Rationale:** Floating-point storage can introduce rounding errors.

**Notes:**

- USD, GBP, EUR, INR, CNY, and CAD use 100 minor units per major unit.
- JPY uses 1 minor unit per major unit.

---

## ADR-010 — Currency Is Per Domain

**Status:** Accepted

**Decision:** Each domain stores one currency from the supported set.

**Rationale:** Registration and renewal prices are associated with a registrar's billing currency.

**Consequences:**

- No exchange-rate conversion is performed.
- Reports must not combine unlike currencies.
- Changing currency with saved costs requires warning and confirmation.
- Confirmed currency changes clear registration and renewal cost values.

---

## ADR-011 — Registrar and DNS Provider Are Suggestible Free Text

**Status:** Accepted

**Decision:** Registrar and DNS provider are free-text fields with persisted suggestions.

**Seed values:**

- Cloudflare
- Namecheap
- Porkbun
- Name.com

**Rationale:** A fixed enum would become stale and unnecessarily constrain personal data.

---

## ADR-012 — Default Reminder Schedule

**Status:** Accepted

**Decision:** New domains receive reminder offsets of 30, 14, 7, and 1 day before the target date.

**Default target:**

- renew → effective billing date
- let_expire → effective expiration date

**Rationale:** Renewing and intentionally expiring domains require different actionable reminders.

**Consequences:** Reminder configuration is customizable per domain and rescheduled after relevant changes.

---

## ADR-013 — Full-Fidelity Portable Formats

**Status:** Accepted

**Decision:** Support import and export through:

- JSON
- YAML
- SQLite
- XLSX

**Rationale:** These formats can preserve all application data when designed correctly.

**Rejected:** CSV, because a simple flat file would lose relational or configuration data.

---

## ADR-014 — Explicit Import Conflict Policy

**Status:** Accepted

**Decision:** Imports detect duplicate normalized domain names and require a selected conflict policy:

- skip
- replace
- merge

**Rationale:** Silent duplicate handling is unsafe.

**Consequences:** Imports require preview and confirmation and must execute transactionally.

---

## ADR-015 — No Grouping Model in 1.0

**Status:** Accepted

**Decision:** Do not add projects, tags, folders, or custom groups.

**Rationale:** Filtering and sorting across basic domain fields meet the current need without extra schema or interface complexity.

---

## ADR-016 — Dashboard Has Two Primary Answers

**Status:** Accepted

**Decision:** The dashboard emphasizes:

1. Next payment: domain, date, and amount.
2. Expected renewal cost over the next 12 months.

**Rationale:** These are the most valuable recurring questions.

**Consequences:** A separate report view houses deeper cost analysis.

---

## ADR-017 — No Cross-Currency Aggregate

**Status:** Accepted

**Decision:** Costs in different currencies are displayed as separate totals.

**Rationale:** Adding unlike currencies without exchange-rate data produces a false total.

---

## ADR-018 — Mobile-Only Major Release Plan

**Status:** Accepted

**Decision:**

- 1.x: iPhone and Android
- 2.0.0: add one desktop platform
- 3.0.0: add the other desktop platform

**Unresolved:** Whether macOS or Windows ships first.

---

## ADR-019 — Product Naming

**Status:** Accepted

**Decision:**

- App name: Domain Expansion
- SEO subtitle: Website Domain Tracker
- First-domain confirmation: Expanded

**Rationale:** The name is memorable while the subtitle clearly states the utility.

---

## ADR-020 — Import/Export Schema Is Versioned

**Status:** Accepted

**Decision:** Every portable format includes an export/schema version.

**Rationale:** Versioning is required for future migrations and backward-compatible imports.

---

## ADR-021 — Direct SQLite Access for the Initial Implementation

**Status:** Accepted for implementation overlay

**Decision:** Use `sqflite` directly instead of Drift in the first coded slice.

**Rationale:** SQLite is the product requirement. The implementation environment could not run Dart code generation, and this small schema does not yet need a generated query layer.

**Consequences:**

- The database remains portable SQLite.
- Migrations and mapping are explicit.
- A later migration to Drift remains possible without changing product semantics.

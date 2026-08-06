# Domain Expansion

**Website Domain Tracker**

A local-first Flutter application for tracking domain ownership, lifecycle, renewal intent, billing and expiration dates, and costs.

## Implemented ticket slice

- DE-001 — project foundation
- DE-002 — SQLite schema and domain model
- DE-003 — domain CRUD
- DE-004 — search, core filters, and sorting
- DE-005 — dashboard
- DE-006 — local reminder scheduling
- DE-007 — reports
- DE-008 — canonical export model
- DE-009 — JSON and YAML import/export
- DE-010 — SQLite backup import/export
- DE-011 — XLSX import/export
- DE-012 — transactional import conflict policies
- DE-013 — settings and release polish

The repository uses direct `sqflite` access rather than Drift. SQLite was the hard requirement; direct access avoids generated source and keeps this first implementation small. This deviation is documented in `docs/ADR.md`.

## Bootstrap on the research Mac

From this directory:

```bash
chmod +x bootstrap.sh
./bootstrap.sh
flutter run
```

`bootstrap.sh` generates the standard iOS and Android host folders, installs packages, runs analysis, and runs tests.

## Current capabilities

- Local SQLite persistence
- Owned or managed relationship
- Active, inactive, or transferred lifecycle
- Renew or let-expire intent
- Billing/expiration mutual fallback
- Registration and renewal costs in seven currencies
- Currency-change warning that clears existing values
- Seeded and learned registrar/DNS suggestions in storage
- Create, edit, archive, unarchive, and delete
- Search, core filters, sorting, and archived-domain toggle
- Dashboard next-payment and 12-month currency-separated totals
- Initial 30/90/365-day and portfolio count reports
- Default reminder rows persisted at 30/14/7/1 days
- Local notification permission flow and rescheduling for billing/expiration reminders
- Per-domain reminder enable/disable controls
- Portfolio filters for providers, currency, cost presence, and date windows
- Settings for reminder defaults, notification time, app metadata, and backups
- Lossless JSON/YAML/XLSX exports and SQLite backups
- Import preview with skip, replace, and merge conflict policies

## Verification

From a Flutter-equipped machine:

```bash
chmod +x bootstrap.sh
./bootstrap.sh
```

Verified locally with Flutter 3.44.8 and Dart 3.12.2:

```bash
flutter analyze
flutter test
flutter build ios --simulator --debug
```

All three commands complete successfully. Android tooling is not installed in this environment; the Android host project is generated and ready for an Android SDK-equipped machine.

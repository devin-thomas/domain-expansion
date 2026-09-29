# Repository consolidation

Verified 2026-09-28. The active web implementation is now `https://github.com/devin-thomas/domain-expansion` on `main`. The former Flutter repository is `https://github.com/devin-thomas/domain-expansion-flutter`; its `first-fixes` branch is archived and preserves its GitHub history.

## Preserved history

- The archived Flutter `first-fixes` branch was observed at `e32209c294eb6debf0461a4358bb6f9e8a6e1b7d`.
- A full Git bundle backup is stored locally at `.local/deployment/domain-expansion-flutter.bundle`. `git bundle verify` succeeded against the expected Flutter history.
- The local read-only remote ref for the old Flutter repository is preserved. A published `legacy-flutter` branch is not required because the archived public repository retains the complete branch and commit history.
- The canonical web repository is the only active Domain Expansion repository. The Flutter repository remains a public archived reference; it was not deleted.
- The separate local Rust/React Takaya project remains outside this repository and was not touched or merged. Legacy Google Drive migration remains excluded by ADR-020.

## Deployment follow-up

Repository consolidation is complete. Continue with the production release gates in [RELEASE.md](RELEASE.md): verify the web application's Vercel production deployment, canonical-host routes, Firebase sign-in delivery, and Resend admin notification delivery. Keep local bundle backups and provider credentials out of public source control.

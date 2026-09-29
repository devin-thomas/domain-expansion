# Domain Expansion release

**State:** healthy — Technical release live; human acceptance deferred
**Updated:** Sep 29, 2026, 1:40 PM America/Chicago
**Task ID:** `domain-expansion-release`
**Repository:** `devin-thomas/domain-expansion`, branch `main`
**Application commit:** `4753e1b9bc214e9c4dab11bac5992fb500c2a83c`

## Action required

**No action required from you right now.** You chose to defer the remaining human acceptance checks until the final handoff. No further checks are being requested now.
Smallest action: None now. Review the deferred checks at final handoff.

## Current activity

The corrected build is live, and a read-only Google provider audit identified the exact remaining ownership and scope-declaration gaps. Search Console lists devthomas.site as Not verified; the OAuth app remains owner-only in Testing.
Next checkpoint: At final handoff, revisit the explicitly deferred device, accessibility, and Google provider checks. No immediate user action is needed.

## Milestones

- **complete — Canonical application and API release.** Application source 4753e1b is served by READY Vercel dpl_2ZWRrTPU8zkeXB2bcsg6yZg9ZcBb on the canonical alias. All six canonical routes returned HTTP 200. The public server bundle/map exposure is repaired: both paths now return HTML on the canonical and Vercel production aliases.
- **complete — Backend and production verification.** The eight-group production verifier passed on underlying application source 2c1cdc3 and reported synthetic cleanup. Emulator 8/8 passed on e644c23; API/CLI 77/77, unit 65/65, and hosted macOS CLI passed on that application implementation. The build-boundary source 4753e1b passed browser 19/19, lint, build, boundary, and native runtime.
- **complete — Desktop/CLI and completed device checks.** Windows and hosted macOS CLI acceptance passed. The user reported iPhone 16 Pro Safari sign-in, capture, and edit success, and Galaxy S21 Ultra Chrome sign-in success.
- **complete — UI accessibility source fixes.** Gemini key labeling, per-proposal Include labels, and live Google result announcements are committed as bc5601e; browser regressions for accessible names and feedback status pass in the 19/19 suite. The human screen-reader and browser-zoom walkthroughs remain deferred.
- **complete — Private release dashboard.** The portable dashboard is tracked in the canonical repository. Its dedicated loopback server and Tailscale Serve endpoint passed matching task-ID and timestamp checks; Chrome rendered the private page.
- **blocked — Google provider acceptance and publication.** Search Console lists devthomas.site as Not verified. The OAuth app remains External/Testing with one test user. Shared-project declarations still include broad calendar.events and restricted gmail.readonly, while calendar.events.owned is absent. Real consent/actions, declaration reconciliation, ownership verification, and publication are pending.

## Open gates

- Search Console ownership is Not verified; OAuth scope declarations need reconciliation; Google consent, real provider actions, and publication have not been completed. Impact: DEW-017 remains blocked; Google-integrated actions are not provider-accepted. Owner: User/provider acceptance at final handoff. Recovery: At final handoff, reconcile shared-project scopes, verify domain ownership, then decide whether to authorize real Google consent/provider actions and publication. Record each actual result separately. Independent work: The technical release and private status dashboard can continue now.
- Android capture/edit, a screen-reader walkthrough, and actual browser-level 200% zoom have not been verified. Impact: Human accessibility and Android acceptance remain open; CSS zoom emulation is not browser zoom evidence. Owner: User/device acceptance at final handoff. Recovery: Complete the checks at final handoff when the user is ready. Independent work: The technical release and private status dashboard can continue now.

## Watch items

- **Monitoring:** An earlier deployment exposed the compiled server bundle and source map. The current production aliases no longer return those assets; route checks do not establish whether prior copies were downloaded or whether credentials were embedded.
- **No action needed:** The user explicitly deferred remaining human checks to final handoff; there is no immediate user request.
- **Monitoring:** Earlier Firebase and Resend messages were observed in spam. Future inbox placement is unverified.
- **Agent handling:** Three screen-reader source fixes passed automated checks; no live screen-reader walkthrough is claimed.

## Decisions

- Defer remaining human acceptance checks until final handoff. The user asked to postpone those checks while implementation and verification continue. Recorded 2026-09-29T17:27:54Z; final for the current work phase; Can be resumed earlier if the user requests it.

## Outputs

- [Human-readable status](./STATUS.md)
- [Machine-readable status](./status.json)
- [Portable dashboard snapshot](./index.html)
- [Release notes and rollback record](../../RELEASE.md)

## Next up

1. At final handoff, perform the deferred Android capture/edit, screen-reader, and actual browser-level zoom checks.
2. At final handoff, reconcile OAuth declarations and Search Console ownership, then decide whether to authorize Google consent, provider actions, and publication.
3. Keep the dashboard available for the final handoff while the host is awake.

## Activity log

- 2026-09-29T17:23:31Z: Created a sanitized portable release dashboard from the current release record; live checks returned HTTP 200 for all six canonical routes.
- 2026-09-29T17:23:31Z: Recorded three screen-reader issues for active source remediation and preserved the user's decision to defer remaining human checks until final handoff.
- 2026-09-29T17:27:54Z: Committed and pushed accessibility fixes as bc5601e; lint, build, and all 18 browser tests passed.
- 2026-09-29T17:34:27Z: Verified Tailscale API/device status, local dashboard endpoint, private HTTPS Serve endpoint, and rendered Chrome view. Vercel commit status succeeded; the live settings accessibility tree named the Gemini key field.
- 2026-09-29T18:04:05Z: Deployed CLI purchase-detail, spreadsheet round-trip, and Google script-retry fixes as application source 2c1cdc3. Local API/CLI 77/77, unit 65/65, browser 18/18, lint/build, hosted macOS CLI, canonical alias, six routes, and both dashboard endpoints were verified.
- 2026-09-29T18:10:51Z: The current application implementation passed all eight live backend verifier groups on READY canonical deployment dpl_HFiEBsBNzkBF8AsZpVMBvueTpV7d. The verifier reported synthetic records and identity removed and temporary PATs revoked; all six canonical routes returned HTTP 200.
- 2026-09-29T18:18:37Z: Ran npm run test:emulator on checkout e644c23: all 8 Firestore emulator tests passed, including direct-client write denial, Admin SDK isolation, concurrent same-user create/rename races, and cross-user name isolation. Human and Google provider gates remain deferred.
- 2026-09-29T18:24:23Z: Release audit found that the canonical static host serves server.cjs and server.cjs.map. Build-artifact boundary repair and a related public-path audit are in progress; no credential exposure is claimed.
- 2026-09-29T18:32:17Z: Deployed build-boundary repair 4753e1b as READY dpl_2ZWRrTPU8zkeXB2bcsg6yZg9ZcBb. The canonical and Vercel production aliases now return HTML for former server-artifact paths; six canonical routes returned HTTP 200. Browser accessibility regressions passed 19/19.
- 2026-09-29T18:40:41Z: Read-only Google provider inspection confirmed Search Console marks devthomas.site Not verified, OAuth remains External/Testing with one test user, and shared scope declarations omit calendar.events.owned while retaining calendar.events and gmail.readonly. No provider settings or access were changed.

## Walk-away snapshot

Build-boundary source 4753e1b was served by READY deployment dpl_2ZWRrTPU8zkeXB2bcsg6yZg9ZcBb on the canonical alias. Six routes returned HTTP 200; former public server-artifact paths returned HTML on both production aliases. Underlying application source 2c1cdc3 passed the eight-group live backend verifier, API/CLI 77/77, unit 65/65, and hosted macOS CLI. Emulator 8/8 passed on e644c23; browser 19/19 and lint/build passed on 4753e1b. Unfinished: Google provider and remaining device/accessibility acceptance are deferred by user instruction. Next safe step: At final handoff, review the deferred checks; reconcile shared OAuth scopes and Search Console ownership before any Google publication or provider actions.
Touched: Build-boundary source 4753e1b is on origin/main. The dashboard folder is tracked; Tailscale Serve points to its dedicated loopback static server. No private host details or secrets are in the repository snapshot. Expected processes: One loopback Python static server and one Tailscale Serve mapping; local runtime metadata records their details. User action: None until final handoff.

## Delivery

Portable repository snapshot and private Tailscale Serve. Tailscale: Host-side private HTTPS endpoint verified with matching dashboard identity and timestamp; the tailnet URL is shared in chat, not committed. Persistence: Dashboard source and state are tracked on main; this update is committed as a checkpoint. Last verified: 2026-09-29T18:40:41Z; read-only Search Console and Google Auth Platform state, READY canonical Vercel alias, six live routes, public server-artifact paths no longer expose code, browser 19/19 and build/lint on 4753e1b, earlier emulator 8/8 and underlying implementation verifier. Limitation: Tailnet access depends on this host staying awake and connected. A second-device dashboard visit has not been independently tested.

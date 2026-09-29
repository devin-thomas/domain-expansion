# Domain Expansion release

**State:** blocked — Technical release live; final acceptance needs user participation
**Updated:** Sep 29, 2026, 2:27 PM America/Chicago
**Task ID:** `domain-expansion-release`
**Repository:** `devin-thomas/domain-expansion`, branch `main`
**Application commit:** `4753e1b9bc214e9c4dab11bac5992fb500c2a83c`

## Action required

**Galaxy DNS settings need a one-time check for dashboard access; final release acceptance also needs your participation.** The Galaxy screenshot shows DNS_PROBE_FINISHED_NXDOMAIN for the correct Tailscale hostname, before the dashboard is contacted. The hostname resolves on the host through Tailscale and public DNS, and the private HTTPS endpoint passes. DEW-016 and DEW-017 still have separate Google and device acceptance gates.
Smallest action: Open the exact dashboard link from chat in the full Chrome app on the Galaxy. If NXDOMAIN persists, enable 'Use Tailscale DNS settings' and set Chrome Secure DNS to automatic or temporarily off. Report only whether it loads.

## Current activity

The Galaxy screenshot isolated dashboard access failure to phone-side DNS lookup. Host-side Tailscale Serve, HTTPS, and DNS checks pass; final release acceptance remains blocked.
Next checkpoint: Confirm whether the dashboard loads after the Galaxy DNS settings check; resume Google and device acceptance when the user requests it.

## Milestones

- **complete — Canonical application and API release.** Application source 4753e1b is served by READY Vercel dpl_2ZWRrTPU8zkeXB2bcsg6yZg9ZcBb on the canonical alias. All six canonical routes returned HTTP 200. The public server bundle/map exposure is repaired: both paths now return HTML on the canonical and Vercel production aliases.
- **complete — Backend and production verification.** The eight-group production verifier passed on underlying application source 2c1cdc3 and reported synthetic cleanup. Emulator 8/8 passed on e644c23; API/CLI 77/77, unit 65/65, and hosted macOS CLI passed on that application implementation. The build-boundary source 4753e1b passed browser 19/19, lint, build, boundary, and native runtime.
- **complete — Desktop/CLI and completed device checks.** Windows and hosted macOS CLI acceptance passed. The user reported iPhone 16 Pro Safari sign-in, capture, and edit success, and Galaxy S21 Ultra Chrome sign-in success.
- **complete — UI accessibility source fixes.** Gemini key labeling, per-proposal Include labels, and live Google result announcements are committed as bc5601e; browser regressions for accessible names and feedback status pass in the 19/19 suite. The human screen-reader and browser-zoom walkthroughs remain deferred.
- **blocked — Private release dashboard.** The portable dashboard is tracked in the canonical repository. Its loopback server and Tailscale Serve endpoint pass matching task-ID and timestamp checks, but Galaxy Chrome reports DNS_PROBE_FINISHED_NXDOMAIN for the tailnet hostname. Phone access needs a DNS settings check.
- **blocked — Google provider acceptance and publication.** Search Console lists devthomas.site as Not verified. The OAuth app remains External/Testing with one test user. Shared-project declarations still include broad calendar.events and restricted gmail.readonly, while calendar.events.owned is absent. Real consent/actions, declaration reconciliation, ownership verification, and publication are pending.

## Open gates

- Galaxy Chrome reports DNS_PROBE_FINISHED_NXDOMAIN for the correct Tailscale hostname. Impact: The private dashboard does not load on the Galaxy despite a healthy host-side endpoint. Owner: Galaxy DNS configuration. Recovery: Retry in the full Chrome app. If NXDOMAIN persists, enable Tailscale DNS settings on the Galaxy and use Chrome Secure DNS automatic or temporarily off. Independent work: Host-side DNS, HTTPS, and Serve checks passed; no server-side change is indicated by the screenshot.
- Search Console ownership is Not verified; OAuth scope declarations need reconciliation; Google consent, real provider actions, and publication have not been completed. Impact: DEW-017 remains blocked; Google-integrated actions are not provider-accepted. Owner: User/provider acceptance at final handoff. Recovery: At final handoff, reconcile shared-project scopes, verify domain ownership, then decide whether to authorize real Google consent/provider actions and publication. Record each actual result separately. Independent work: No remaining autonomous work closes this gate; the technical release is live.
- Android capture/edit, a screen-reader walkthrough, and actual browser-level 200% zoom have not been verified. Impact: Human accessibility and Android acceptance remain open; CSS zoom emulation is not browser zoom evidence. Owner: User/device acceptance at final handoff. Recovery: Complete the checks at final handoff when the user is ready. Independent work: No remaining autonomous work replaces the physical-device and assistive-technology evidence.

## Watch items

- **Monitoring:** An earlier deployment exposed the compiled server bundle and source map. The current production aliases no longer return those assets; route checks do not establish whether prior copies were downloaded or whether credentials were embedded.
- **Monitoring:** Earlier Firebase and Resend messages were observed in spam. Future inbox placement is unverified.
- **Agent handling:** Three screen-reader source fixes passed automated checks; no live screen-reader walkthrough is claimed.
- **Monitoring:** Galaxy Chrome returned DNS_PROBE_FINISHED_NXDOMAIN. Host-side HTTPS returned 200 with valid TLS and matching dashboard identity; phone-side DNS recovery has not been verified.

## Decisions

- Defer remaining human acceptance checks until final handoff. The user asked to postpone those checks while implementation and verification continue. Recorded 2026-09-29T17:27:54Z; final for the current work phase; Can be resumed earlier if the user requests it.

## Outputs

- [Human-readable status](./STATUS.md)
- [Machine-readable status](./status.json)
- [Portable dashboard snapshot](./index.html)
- [Release notes and rollback record](../../RELEASE.md)

## Next up

1. Have the Galaxy retry in full Chrome; if NXDOMAIN persists, check Tailscale DNS and Chrome Secure DNS. Retain the verified host-side Serve route.
2. Wait for the user's 'resume final acceptance' reply; do not repeat background checks.
3. Reconcile OAuth declarations and Search Console ownership, then perform the approved Google consent and provider actions.
4. Complete Galaxy capture/edit, screen-reader, and actual browser-level zoom checks; close DEW-016/017 only with evidence.
5. Keep the dashboard available for the final handoff while the host is awake.

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
- 2026-09-29T19:00:23Z: Corrected the dashboard after the goal entered blocked status: final acceptance now shows user participation required, with one resume action and the outstanding provider/device gates listed.
- 2026-09-29T19:23:26Z: The user reported Galaxy dashboard access failure. Host loopback and private HTTPS endpoints returned the expected dashboard, HTTPS returned 200 with valid TLS through the tailnet IP, and Tailscale showed the Galaxy online on the same account. Galaxy Chrome behavior is pending.
- 2026-09-29T19:27:55Z: The Galaxy screenshot showed DNS_PROBE_FINISHED_NXDOMAIN for the correct tailnet hostname. The host resolves it via Tailscale and public DNS and serves the dashboard over valid HTTPS; the phone's DNS path is the remaining dashboard-access issue.

## Walk-away snapshot

Build-boundary source 4753e1b was served by READY deployment dpl_2ZWRrTPU8zkeXB2bcsg6yZg9ZcBb on the canonical alias. Six routes returned HTTP 200; former public server-artifact paths returned HTML on both production aliases. Underlying application source 2c1cdc3 passed the eight-group live backend verifier, API/CLI 77/77, unit 65/65, and hosted macOS CLI. Emulator 8/8 passed on e644c23; browser 19/19 and lint/build passed on 4753e1b. Unfinished: Galaxy dashboard access awaits a phone-side DNS settings check; final Google provider and device/accessibility acceptance remain blocked pending the user's participation. Next safe step: Retry the exact private link in full Galaxy Chrome; if NXDOMAIN persists, check Tailscale DNS and Chrome Secure DNS. Wait for 'resume final acceptance' before coordinating release checks.
Touched: Build-boundary source 4753e1b is on origin/main. The dashboard folder is tracked; Tailscale Serve points to its dedicated loopback static server. No private host details or secrets are in the repository snapshot. Expected processes: One loopback Python static server and one Tailscale Serve mapping; local runtime metadata records their details. User action: Retry in full Galaxy Chrome, then check Tailscale and Chrome DNS settings if NXDOMAIN persists; report whether the dashboard loads.

## Delivery

Portable repository snapshot and private Tailscale Serve. Tailscale: Host-side private HTTPS endpoint verified with matching dashboard identity and timestamp; the tailnet URL is shared in chat, not committed. Persistence: Dashboard source and state are tracked on main; this update is committed as a checkpoint. Last verified: 2026-09-29T19:27:55Z; local and tailnet HTTPS dashboard identity verified, with HTTP 200 and valid TLS through the tailnet IP. Host DNS resolved the tailnet hostname using Tailscale and public resolvers; Galaxy Chrome showed NXDOMAIN. Earlier evidence includes READY canonical Vercel alias, six live routes, public server-artifact repair, browser 19/19, emulator 8/8, and the underlying implementation verifier. Limitation: Galaxy Chrome reported DNS_PROBE_FINISHED_NXDOMAIN; phone-side DNS recovery is unverified. Host-side verification cannot establish phone rendering or reachability. Tailnet access also depends on this host staying awake and connected.

# Google OAuth release verification

Prepared September 29, 2026. This is a review packet and test script, not proof of consent, publication, domain ownership verification, or Google approval.

## Application and public disclosures

- Product: Domain Expansion, the private domain renewal tracker.
- Homepage: https://domains.devthomas.site/
- Privacy notice: https://domains.devthomas.site/privacy
- Public product demonstration: https://domains.devthomas.site/showcase
- Repository: https://github.com/devin-thomas/domain-expansion
- Google project: `gen-lang-client-0134385093`; preserve other applications using this shared project.
- Last observed provider state: External, Testing, owner-only test audience. Publication and real integration grants have not been completed.

The homepage describes the tracker, AI draft review, and optional integrations and links directly to the privacy notice. The notice explains requested permissions, browser-memory access tokens, reminder reconciliation, selected backup restore, stored references, external-item deletion, and Limited Use. AI Quick Add input sent to Gemini is explained separately from data received through Google OAuth permissions.

Google requires a functional public homepage, matching public privacy URLs, and authorized-domain ownership verification by a project owner or editor in Search Console. DNS control and Firebase custom-email domain verification do not establish Search Console ownership. Search Console evidence has not yet been obtained. See [Google verification requirements](https://support.google.com/cloud/answer/13464321?hl=en).

## Requested permissions and purpose

| Feature | Requested scope | User action and reason |
| --- | --- | --- |
| Calendar | `https://www.googleapis.com/auth/calendar.events.owned` | After preview and confirmation, create one selected renewal reminder in primary Calendar. Query its private marker to reconcile an interrupted write. |
| Tasks | `https://www.googleapis.com/auth/tasks` | After preview and confirmation, create one selected reminder in the default list. Find its exact marker, including completed or hidden reminders, to reconcile interrupted writes. |
| Sheets | `https://www.googleapis.com/auth/drive.file` | Create an app-owned spreadsheet containing the user's explicitly exported domain table. |
| Drive | `https://www.googleapis.com/auth/drive.file` | Save a user-requested visible JSON backup. On explicit restore, list matching accessible backups and download the selected file for import preview before commit. |

Each action requests only its own scope with `include_granted_scopes: false`. The token does not establish or change the Firebase account. No refresh token is retained. This application never requests Gmail, `drive.appdata`, full Drive, or full spreadsheets access.

Calendar read-only access cannot create the selected event. Access to app-created calendars would require a separate calendar and would not implement primary-calendar reminders. The owned-events scope is accepted by both [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) and [Events insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), so broader `calendar.events` is unnecessary. The scope itself includes owned calendars; the adapter confines its requests to `primary`.

Tasks read-only access cannot create a reminder: compare [Tasks list](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list) with [Tasks insert](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/insert). Sheets and Drive use Google's recommended [per-file scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

The shared project's last observed declarations still include preexisting `gmail.readonly` metadata. Before submission, reconcile it with any other client using that scope and the final requested scope list. Do not silently remove another application's scope or claim restricted-scope review is unnecessary based only on this app's code. Update the obsolete Calendar declaration to owned-events access when reviewing the final provider configuration.

## Consent and provider acceptance script

These actions require the pending approvals for Google permissions and creation of synthetic provider items. Publication remains a separate approval. Do not infer approval from this packet.

1. Check the Firebase owner and selected Google account. Inspect the current portfolio before export: use only the approved synthetic `release-google-20260928.example` fixture and synthetic purchase details. Stop if an export would include real or newly added records outside the approval.
2. Reload the deployed app to use owned-events access. Preview the fixture's November 1, 2026 reminder for its December 1 billing date. Confirm one event, inspect the Google consent screen, grant only the displayed feature permission, and verify primary Calendar. Repeat the app action to check reconciliation without another event.
3. Preview a Tasks reminder, grant Tasks access, and verify the default-list task. Repeat to check reconciliation and confirm the integration reference belongs to the correct domain revision.
4. Choose Sheets export, grant per-file access, and inspect the table and literal cell contents. Confirm synthetic purchase fields are included and credentials excluded.
5. Choose Drive backup, grant per-file access, and verify the visible dated JSON file. List backups, select that file, and inspect import preview before a separate commit. Backup creation alone does not prove restore acceptance.
6. Record actual outcomes, cancellation/denial behavior, and account boundaries. Stubbed endpoints do not prove provider acceptance. Never record tokens, email-link action codes, private portfolio contents, or credentials.

## Publication and submission packet

Before production publication or verification submission:

- Obtain the specific pending approval and inspect the final provider action.
- Verify `devthomas.site` in Search Console with a project owner/editor account and record status without exposing verification credentials.
- Check branding, canonical homepage/privacy URLs, authorized domains, client origin, project contacts, and reconciled scope declarations. Do not broaden access to work around failures.
- Complete approved provider tests and produce a demonstration video showing the exact product identity, action-specific consent, and real results. A storyboard or local test is not a demonstration video.
- Submit accurate scope justifications and real evidence if Google requires verification. Record submission and review status separately from publication and deployment. Google review is an external gate.

Refer to [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) and the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

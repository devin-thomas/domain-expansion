# Domain Expansion — Web Implementation Specification

**Status:** Discovery complete; implementation contract. Implementation and live-service acceptance are not yet complete.

**Authority:** [Context.md](Context.md), [ADR.md](ADR.md), and the owner's final instruction excluding legacy Drive migration. **Execution:** [tickets/README.md](tickets/README.md).

## 1. Objective and scope

Continue the existing AI Studio web implementation as a polished, invite-approved, passwordless domain tracker at `domains.devthomas.site`. Preserve its low-friction human interface while adding a richer canonical model, private Firestore persistence, reviewed AI capture, and authenticated automation.

Required outcomes:

| ID | Observable outcome |
|---|---|
| R01 | Request access, admin review, first sign-in email, and subsequent passwordless sign-in work without granting unapproved identities data access. |
| R02 | Each user's portfolio is isolated, including from the application admin role; Firestore is authoritative. |
| R03 | Quick Add has five main field groups and does not require advanced configuration. |
| R04 | Rich domain fields, state semantics, and currency-separated calculations survive every supported write path. |
| R05 | AI creates editable single/batch drafts and never saves without explicit user approval. |
| R06 | Non-owner AI uses encrypted BYOK with consent; the exact configured owner alone may use the internal credential. |
| R07 | REST API and official CLI operate on the same domain contract and authorization rules as the UI. |
| R08 | Independent read/write/delete scopes and revocable tokens constrain automation. |
| R09 | Archive is reversible; permanent deletion is deliberate and separately authorized. |
| R10 | Admin access requests produce both an in-app queue/badge and Resend email alerts with observable failure handling. |
| R11 | Advanced current-format portability and optional Google integrations do not obstruct ordinary capture. |
| R12 | There is no legacy Drive discovery/migration workflow or second live data store. |
| R13 | Mobile, keyboard, screen-reader, failure-state, and cross-device workflows have recorded acceptance evidence. |
| R14 | Canonical host, callbacks, verified senders, configuration, and service limits are validated before release. |
| R15 | Writes are validated, conflict-aware, retry-safe, and cannot overwrite unrelated account/security data. |
| R16 | The public showcase is retained and reflects verified capabilities without exposing private data. |

Out of scope: native-client redevelopment, legacy Drive migration, registrar account operations, ownership verification, billing/subscriptions, shared portfolios, arbitrary AI tools, attachment-specific AI intake, outbound webhooks, app-sent renewal emails, and a full offline mutation/synchronization engine. Deferred ideas do not add requirements.

## 2. Architecture and implementation discipline

Keep React, TypeScript, Vite, the existing visual language, and Vercel. No Next.js rewrite is necessary for this scope. Use Firebase Auth for identity, Firebase Admin in the server runtime, Firestore for persistence, Gemini behind a provider adapter, and Resend for admin-request mail only.

Separate public browser code, shared pure schemas/domain functions, and server-only credentials/services. A practical layout is `src/` for UI, `shared/` for runtime schemas and pure calculations, `server/` for authorization/domain/provider services, `api/` for Vercel handlers, and `cli/` for the thin command-line client. Adapt paths to the code without creating duplicate domain logic.

The browser and CLI call the same authenticated domain service. Initial Firestore rules deny all direct client reads and writes. Server-side Admin SDK access bypasses those rules; therefore service authorization is mandatory, not an optional second check [S4]. Firebase client SDK use for authentication remains valid.

Production API handlers must really execute on Vercel; bundling an Express development server into `dist` does not prove `/api/*` works there. Reuse server modules between the local dev adapter and production handlers. Route `/api/*` before SPA fallback and verify `/auth/finish`, `/showcase`, and authenticated deep links independently.

Use runtime validation as well as TypeScript types. Generate the public API description from, or test it against, the same schemas. Pin supported dependency versions during implementation; do not upgrade the entire repository gratuitously. Update `.env.example` then with placeholders, never credentials.

## 3. Human interface contract

### 3.1 Primary surfaces

The ordinary navigation emphasizes Dashboard, Domains, and Settings. Keep the existing useful responsiveness and showcase assets as the visual starting point. Admin is role-gated. Reports, data transfer, integrations, AI credentials, and developer tokens are reached through advanced settings or record detail rather than competing primary navigation items.

The dashboard shows next payment, next-12-month totals grouped by currency, and a compact upcoming list. Empty state offers Add domain and explains the first useful action without injecting demonstration domains into a real account. Success messages stay small; the first successful creation may retain the product's `Expanded` confirmation.

Use an account-scoped view cache only. Sign-out or account change clears visible private data, drafts, pending requests, and cached responses before another account renders. No cross-account localStorage catalog. A successful save means the server committed it; offline/failed requests are labeled unsaved and preserve the current in-memory edit for retry.

### 3.2 Quick Add

Two modes only: **Quick Add** and **✨ AI Quick Add**. Ordinary Quick Add exposes five groups: Domain; Registrar; Renewal date; Renewal cost + currency; Renewal intention. `More details` is collapsed by default for every fresh capture, including after editing an advanced record. It must not be required merely because the schema has more fields.

Domain and one effective date are required; registrar and costs may be unknown. Default ownership is owned, lifecycle active, intention renew, currency from user settings, and archive false. Do not pretend the registrar's actual auto-renew is known. Quick Add's Renewal date sets `expirationDate`; `billingDate` remains null and falls back to expiration. It does not create two independent copies of the same fact.

Do not silently populate a guessed renewal date. A placeholder may illustrate an example, but an example is not saved data. Dates are local calendar values. Successful capture takes one explicit Save action once valid; do not add a confirmation wizard for ordinary creation.

### 3.3 Advanced details

Group advanced fields by dates/costs, relationship/state, providers/notes, and reminders. Use a focused detail/edit surface or deliberate expansion. A simple edit must never erase advanced values it did not display. If billing and expiration differ, label them distinctly when editing; do not reuse an ambiguous date control that overwrites both.

Archive/unarchive stays reversible and discoverable without occupying every row. Permanent deletion is in a danger surface with the domain named, an irreversible warning, and explicit confirmation. Cancel leaves all state unchanged. Integration failure never rolls back a correctly saved domain.

### 3.4 AI review

Start with one input, a submit action, and understated provider/availability information. Avoid a general chatbot dashboard. Return one compact editable card per draft with domain, registrar, full proposed date, cost/currency, intention, and only relevant warnings. Individual cards can be corrected or excluded. A single Add selected action commits the valid selected set; the label states how many records will be added.

Missing required data blocks only the affected card. The user can explicitly choose Add valid (N), leaving incomplete drafts unsaved. A duplicate is not permission to update a record: show it and offer to open the existing record; no hidden overwrite. Re-submission replaces or revises the current draft set, not canonical records.

No auto-save, no auto-approved confidence threshold, and no persistent chat history. Closing a dirty review warns before discarding in-memory work. Failures preserve input/cards. Late results from a replaced submission, sign-out, or account switch cannot replace the current view.

## 4. Canonical domain schema

Use shared schema version 2 for the new canonical record. The public mutable fields are:

| Field | Type / rule |
|---|---|
| `name` | Non-empty normalized domain name, maximum 253 ASCII characters after IDNA normalization. |
| `registrar`, `dnsProvider` | Nullable free text, maximum 200 characters each. |
| `ownership` | `owned` or `managed`; default owned. |
| `lifecycle` | `active`, `inactive`, or `transferred`; default active. |
| `renewalIntent` | `renew` or `let_expire`; default renew. |
| `autoRenew` | Boolean or null; default null for unknown. |
| `registrationDate`, `billingDate`, `expirationDate` | Nullable valid `YYYY-MM-DD`; at least billing or expiration must exist. |
| `registrationCostMinor`, `renewalCostMinor` | Null or non-negative safe integer in that currency's minor units. |
| `currency` | USD, GBP, EUR, INR, CNY, JPY, or CAD; default from settings. |
| `notes` | String, default empty, bounded to 8 KiB UTF-8. |
| `isArchived` | Boolean, default false. |
| `reminders` | Validated reminder configuration described below. |

Server-owned fields: opaque stable `id`, `normalizedName`, `schemaVersion`, positive integer `revision`, `createdAt`, and `updatedAt`. Client attempts to set server fields, owner IDs, roles, credentials, unknown keys, or arbitrary document paths are rejected. External Calendar/Tasks references are separate server-controlled integration metadata.

Normalize consistently across UI, API, CLI, and imports: trim surrounding whitespace, extract the hostname from a pasted HTTP(S) URL, remove its trailing dot, lowercase, and use IDNA ASCII normalization. Do not strip meaningful subdomains such as `www` or guess a registrable root. Reject malformed hosts, wildcards, credentials in URLs, IP addresses, and empty names. No DNS/WHOIS/network lookup is needed to save a name. Normalization checks formatting, not ownership.

Enforce uniqueness per user, including archived records. A server-generated stable ID plus a per-user normalized-name index is the recommended implementation. A rename transaction must claim the new index and release the old one without changing the record ID. Concurrent creates of the same normalized name cannot create duplicates. The same domain can independently exist in two users' portfolios.

### 4.1 Dates and money

`effectiveBillingDate = billingDate ?? expirationDate`; `effectiveExpirationDate = expirationDate ?? billingDate`. Keep these derived, not independent user-editable facts. Date-only values never pass through UTC conversions that change the calendar day. Relative-language parsing uses the user's validated IANA timezone and server-provided current local date.

Represent money in minor units: USD 12.99 is 1299; JPY 1500 is 1500. All supported currencies except JPY use two decimal places. Parse input precisely; reject extra fractional digits rather than silently rounding. Null means unknown; zero means known free. Never combine unlike currencies or invent exchange rates.

Changing currency with stored amounts requires an explicit warning/acknowledgment and clears both old amounts. API callers use the non-persisted `clearCostsOnCurrencyChange: true` control; explicitly supplied new amounts may then be applied as newly entered values. Without acknowledgment, reject the currency-changing mutation atomically. Imports preview the same consequence and cannot reinterpret old numeric values silently.

### 4.2 State, reminders, and derived views

Ownership, lifecycle, renewal intention, archive, and actual auto-renew are independent. Changing intention does not toggle a registrar setting or lifecycle. Transferred/inactive/archived records are retained but excluded from active expected-spending summaries. Archive never deletes external resources. Permanent removal does not imply deleting Calendar events or Tasks without separate consent.

Reminder configuration stores enabled state, target (`default`, `billing`, or `expiration`), and unique positive day offsets; default offsets are 30, 14, 7, 1. Account defaults can be overridden per record. Bound offsets to 1..365 and at most 16 entries. Default target resolves to billing for renew and expiration for let_expire. Preserve explicit false, empty disabled configurations, and changes back from let_expire to renew.

Reminder dates and urgency are derived. Initial delivery is in-app urgency plus deliberate supported Calendar/Tasks actions; do not label a browser timer as reliable closed-browser notification scheduling. A separate email/push delivery system is not required by this schema.

Next payment selects the earliest non-archived active renewing record whose effective billing date is today or later; unknown cost is shown as Not entered, not zero. Break ties by normalized name. Next-12-month spending uses `[today, today plus 12 calendar months)` and groups known renewal costs by currency. Show the count of qualifying unknown-cost records. Past-due dates remain past due; never roll dates forward automatically. Advanced reports may expose 30/90-day windows, currency totals, and lifecycle/provider breakdowns using the same predicates. Month arithmetic must handle leap years deliberately.

## 5. Firestore, ownership, and concurrency

Paths are nested per user as specified in Context. `members/{uid}` controls `status: approved|suspended` and `role: member|admin`; access requests have `pending|approved|denied` status, timestamps, and minimal contact data. Credentials, token verifiers, approval bookkeeping, notification outbox, and rate/idempotency records are server-only. No user can write their own membership or admin role.

All requests derive UID from a verified Firebase ID token or a verified PAT. Verify Firebase project/audience, expiry/revocation, verified email, and current membership. Never trust a UID in a URL/body to expand the caller's authority. A foreign record identifier returns the same not-found response as a nonexistent record; no names/counts leak through error messages or existence checks.

No admin-role bypass exists in domain, export, credential, or AI handlers. An admin can use their own portfolio normally. Cloud IAM/service-account authority remains a separate privileged boundary; do not advertise end-to-end or zero-knowledge storage.

Every domain mutation revalidates the final full record and runs with membership/scope checks, normalized-name uniqueness, record revision, and an atomic Firestore transaction. Use `ETag`/`If-Match` for update/delete preconditions. Missing precondition returns 428; stale revision returns 412 without overwriting work. Distinct users' data is never included in one transaction.

Retry-safe POST writes require `Idempotency-Key`. Scope it to caller, method, and route, and bind it to a body hash. Repeating the same key/body returns the original outcome; changing the body returns 409. Retain results for at least 24 hours. Do not cache authentication/provider secrets in replay records. Atomic batches contain at most 100 records and 2 MiB total input; reject an invalid batch without partial writes. AI commits at most 25 selected records. Input-size limits are checked before expensive work.

Fresh accounts are empty. Remove prototype `appDataFolder` synchronization and shared localStorage adoption. Do not read, create, overwrite, or delete legacy Drive files during onboarding. Preserve external files; no historical reconciliation is part of acceptance.

## 6. Admission, passwordless sessions, and notifications

### 6.1 Request and approval

The public access form requires email and may offer one optional short reason. Bound lengths and reject control characters. Normalize lookup consistently with Firebase, without dropping dots or plus-tags. Duplicate requests do not create duplicate queue entries or repeated notification storms. Generic public responses do not reveal whether an email is approved, pending, denied, or registered.

Apply server-side per-IP and per-email throttles and bot protection to public request/sign-in endpoints. Initial adjustable defaults: five access submissions per IP per hour, one new notification per normalized email per 24 hours, and a 60-second sign-in resend cooldown. Persist/shared-enforce counters; in-memory-only serverless limits are insufficient. Configure additional provider protections and monitor abuse of direct Firebase endpoints as part of release.

The admin can list pending requests and approve or deny them. Approval requires a current approved admin session and recent authentication. Resolve/create the Firebase user server-side without setting `emailVerified` true prematurely, then idempotently bind approval/membership to that UID. A partially created Auth identity without membership has no product rights. Race/retry handling cannot create two grants.

After membership is stored, initiate the first Firebase email-link message automatically. Failure leaves approval intact and records a retryable mail state. A Deny action grants no membership. Suspension prevents both session and PAT usage without deleting data. Bootstrap the owner through trusted configuration/operator setup; never appoint the first visitor admin.

### 6.2 Firebase email flow

Use Firebase's supported email-link flow [S1]. A server mail adapter may invoke the documented `accounts.sendOobCode` with `EMAIL_SIGNIN`, the approved email, the fixed HTTPS continue URL, and the supported in-app handling flag [S2]. Generating a link in Admin is not the same as having Firebase deliver it; verify real delivery in the ticket.

Complete sign-in at `/auth/finish` using the SDK's email-link validation/completion. Same-device email may be stored temporarily for this purpose; another device prompts for it. Do not put email into the redirect URL or trust URL parameters as identity. Remove consumed auth parameters from browser history, use no-referrer policy on the callback, and redact action codes in logs/analytics. Expired/used links show a clear safe retry path. Allowlist callback origins; do not accept arbitrary continue URLs.

Firebase identity alone is not application admission. Recheck verified email and membership before exposing any data or rendering protected screens. Session tokens are never copied into CLI config. Sensitive actions such as minting PATs, replacing BYOK, and admin approval require recent sign-in (initial default: within ten minutes) or reauthentication.

### 6.3 Resend admin notifications

Write a durable notification outbox entry with the access request, then attempt delivery promptly. Resend's recipient and sender come from trusted server configuration, never request fields. Escape applicant text, identify it as unverified input, and link only to the authenticated admin page; email clicks cannot directly approve accounts.

Use a stable request-event idempotency key and record pending/accepted/failed delivery state. Resend deduplicates within a 24-hour window [S5]; retain application delivery state beyond that window and do not claim exactly-once delivery. Retry bounded transient failures; retain pending work for a protected retry worker and manual admin retry. Permanent failures are visible. A Resend outage cannot lose the request or corrupt membership. Provider acceptance is not proof of inbox delivery; perform an actual recipient check at release.

## 7. BYOK vault and AI availability

Only approved browser sessions can set, replace, inspect non-secret status, or remove their own Gemini credential. PATs have no vault permission. Accept the raw key over HTTPS, hold it briefly in request memory, and immediately clear it from the UI after submission. Do not save it in localStorage, URLs, analytics, or logs. Return configured/provider/updated status, not raw key or ciphertext.

Use authenticated encryption, initially AES-256-GCM with a new random nonce per encryption. Bind associated data to environment/project, UID, provider, and credential format version. Store ciphertext, nonce, authentication tag, key version, and non-secret metadata in `users/{uid}/privateCredentials/gemini`. Keep the master key/keyring in server-only deployment secrets, never Firestore or `VITE_*` [implementation security contract]. Missing keys or authentication failures fail closed; no plaintext fallback.

Provide key replacement/removal and an operator key-rotation procedure that retains old versions until re-encryption is verified. Removing a stored key blocks future AI calls; already dispatched provider requests cannot be recalled and must not be represented otherwise. Concurrent replacements use credential revisions. The exact `OWNER_UID` may select `OWNER_GEMINI_API_KEY`; role admin alone does not qualify.

Before first non-owner AI use, explain that submitted text goes to Google using the user's key, the app server processes that key/text, and provider billing/data terms apply. Record consent version/time. BYOK does not establish a no-training guarantee: current Gemini free and paid data-treatment terms differ [S6]. Declining or removing the key leaves manual capture operational. Never substitute the owner's key for missing, invalid, quota-limited, or suspended non-owner credentials.

## 8. AI extraction boundary

The initial configurable model IDs are `gemini-3.5-flash-lite` and fallback `gemini-3.8-flash`, matching the accepted policy and current published catalog [S6]. Keep provider URL/model configuration server-controlled; BYOK is not arbitrary endpoint/SSRF access.

`POST /api/ai/extract` requires an approved browser session, applicable consent, and a usable caller credential. Accept text plus validated locale/timezone context. Initial limits: 8 KiB input, 25 drafts, 8,192 output tokens, 20 seconds per provider attempt, and 45 seconds total. Initial per-user limit is ten extraction requests per minute, with configurable daily safeguards. These are adjustable defensive defaults, not promises of a provider free quota.

Use structured output and validate it again server-side [S7]. Return draft fields, per-field uncertainty/evidence where useful, and errors; never server-owned record/security fields. The model has no database write tool, external browsing, registrar operation, or access to other users' data. Send only the submitted text and minimal date/currency context. Unknown facts stay null. Reject unsupported output, malformed values, truncation, and excessive batches without silently dropping records.

A missing year may be offered as a clearly labeled inferred next occurrence using the user's current local date. It is not an established fact until approved. Ambiguous dates/currencies are surfaced; an accepted account currency may be displayed as a default rather than invented provenance. The model must not turn an expiration statement into an independent billing fact.

On transient timeouts, 429, or 5xx, use at most one bounded fallback attempt within the total deadline and with the same caller credential. Honor Retry-After when it fits; otherwise return retryable error. No fallback for invalid keys, denied access, missing model configuration, or exhausted billing; no credential rotation to evade provider quotas. Semantic validation failures return an editable/error state, not repeated spend. Errors are sanitized. Do not log prompts, drafts, full provider responses, or keys.

Extraction never writes domains. Human approval submits the edited selected records to the ordinary validated batch-create service with a new idempotency key. Revalidate against current portfolio state at commit time. Double-clicks and response-loss retries produce one committed set. A new conflicting record or stale user session results in no partial batch commit and leaves the drafts available for correction.

## 9. REST API and token contract

### 9.1 Authentication and scopes

The web API accepts Firebase bearer ID tokens; external automation uses a distinctive PAT format. Both resolve to a verified actor and current approved membership. PAT scopes are independent, without implicit hierarchy. A recommended default token has read + write, not delete, and a 90-day expiry; the user can choose a bounded expiration (maximum one year). Tokens are named, listable by safe metadata, and revocable immediately for new requests.

Use cryptographically random secrets with at least 256 bits of entropy and a non-recoverable SHA-256 or keyed verifier with constant-time comparison. A public token locator may identify the UID/token record for lookup, but never counts as proof before verification. Never return the verifier, log a token, or include it in an export. Show plaintext once upon creation; browser response is no-store. Token creation/revocation requires the user's browser session, not another PAT. Credential revocation and membership suspension are enforced on every new request.

### 9.2 Versioned domain endpoints

| Method and route | Permission | Required behavior |
|---|---|---|
| `GET /api/v1/domains` | read | Owner-only search/filter/sort with bounded cursor pagination. |
| `GET /api/v1/domains/{id}` | read | Canonical record plus ETag; foreign/missing IDs are indistinguishable. |
| `POST /api/v1/domains` | write | Validate/create; require Idempotency-Key; duplicate name is 409. |
| `PATCH /api/v1/domains/{id}` | write | Allowlisted partial fields, If-Match, final-state validation; archive/unarchive use isArchived. |
| `DELETE /api/v1/domains/{id}` | delete | Deliberate permanent removal with If-Match; no collection delete. |
| `POST /api/v1/domains/batch` | write | Bounded atomic create of selected records, same validation and idempotency. |
| `POST /api/v1/import/preview` | write | Validate current-format domain import and report proposed changes; no writes. |
| `POST /api/v1/import/commit` | write | Apply explicitly selected preview with idempotency and revision checks; no deletion of omitted records. |
| `GET /api/v1/export` | read | Export caller's domain data, including requested archived records; never secrets or another user's settings. |

Literal subroutes such as batch must not be captured as record IDs. API tokens cannot call admin, session, vault, token-management, AI-extraction, or notification-worker endpoints. A write-only caller receives new ID/revision/write result, not unrelated existing record data; read scope is needed for full retrieval.

Support `q`, lifecycle, ownership, renewal intention, registrar, DNS provider, currency, archived selection, and due-window filters. Default excludes archived. Support name, effective date, cost, and updated-time sorting with stable ID tie-breaks. Initial page size 50, maximum 100. Validate/allowlist all query parameters and cursor contents; bind cursors to UID, filters, and ordering. A filter/search must cover the caller's full collection, not just the first fetched page. A bounded scan implementation may return a continuation cursor rather than silently truncate; no external search service is required.

Structured response errors contain code, safe message, requestId, retryable flag, and field issues when applicable. Status semantics: 400 malformed input; 401 missing/invalid authentication; 403 membership/scope denial; 404 missing resource; 409 duplicate/idempotency conflict; 412 stale revision; 413 payload limit; 422 invalid values; 428 missing precondition; 429 throttled with Retry-After; 502/503 sanitized upstream/unavailable service. Successful creation is 201; permanent deletion is 204. Ownership checks occur before resource-specific diagnostics.

Initial adjustable API throttles: 120 reads and 60 writes per user per minute, shared across tokens. Read/write limits do not substitute for provider limits. Reject untrusted origins for browser-only endpoints; do not put bearer credentials in query strings. Private responses use no-store and must never enter a public CDN cache.

### 9.3 API documentation

Publish a versioned OpenAPI description and CLI examples during DEW-009/010. Cover required fields/defaults, null vs omitted PATCH behavior, enum values, money/date semantics, scopes, error bodies, revisions, pagination, idempotency, import limits, and deletion. Test examples against the actual handlers. An omitted PATCH field is unchanged; explicit null clears only nullable fields. Replacement imports cannot bypass field allowlists or ownership.

## 10. CLI

Provide a thin Node-based CLI usable on the owner's Windows and macOS systems. The command name is `domain-expansion`. Required commands: list, get, add, update, archive, unarchive, delete, import, and export, plus help/version. All operations call the public API; never connect directly to Firestore or copy web Firebase sessions.

Allow endpoint configuration and `DOMAIN_EXPANSION_TOKEN` environment input or a protected local config file; do not encourage tokens in shell history/arguments. Redact debug output, enforce HTTPS outside explicit localhost development, and refuse to forward tokens across redirects/untrusted hosts. Document file permissions and removal. No npm publication is required merely to run a locally installed CLI.

Offer readable terminal output and machine-readable output for scripts. Errors go to stderr and use nonzero exit codes. Support expected revision and idempotency flags; generate a key for new write operations and preserve it during retries. Do not silently retry uncertain writes with fresh keys.

`archive` and `unarchive` need write, not delete. `delete` requires `--permanent`; interactive use names the target and confirms. Noninteractive use additionally requires `--yes` and an explicit revision/precondition (or a deliberate current-record fetch using read scope). EOF or missing confirmation makes no request. A read/write-only token fails permanent deletion even with every confirmation flag.

CLI imports offer dry-run/preview and use the same bounded commit service; omission of existing records never removes them. Handle paginated exports completely. State partial file/network failure clearly and avoid replacing an existing output file with an incomplete export.

## 11. Advanced portability and Google integrations

### 11.1 File data transfer

Retain the advanced Import/Export surface, not extra primary capture UI. JSON and YAML provide versioned full-fidelity non-secret domain/settings backups. Upgrade XLSX round-trip structure to separate Domains, Reminders, and Settings/Metadata sheets. Preserve date-only strings, minor units/currency, null vs zero, archive, false values, notes, and reminder targets/offsets. API-token exports/imports cover domains only; optional app display/reminder settings restore is browser-session-only. Never include membership, UID authority, tokens, provider credentials, or encryption data.

Retain existing CSV and SQL exports as clearly labeled domain-table exports, not full application backups; do not advertise lossless restore through those tabular formats. Retained tabular imports require explicit validation and must never guess a missing date as today or thirty days later. No binary SQLite engine or execution of uploaded SQL is required. Prevent spreadsheet formula injection and unsafe YAML object construction. Bound file input and parsed structures, including decompression sizes.

Preview before committing, detect conflicts by normalized name, and preserve the existing records until the user chooses a policy. Default generic conflict policy is Skip. Replace means replace validated public domain fields of matching records, not clear the portfolio. Merge uses incoming explicit non-null/non-empty values; false and zero are real values. Missing values do not clear existing values. Show exact changes, including costs/currency and reminder replacements. Store no long-lived imported file by default.

A preview is tied to caller, content hash, selected policies, and affected revisions; revalidate these before commit. Expire preview authorization after 15 minutes. At most 100 records per atomic commit; larger files are rejected with an explicit limit, not partially imported. No record omitted from a file is deleted. Full backup restores include all non-secret fields within the supported schema; incompatible versions return a clear error instead of silently truncating. This is ordinary current-format portability, not legacy Drive migration.

### 11.2 Optional Google features

Preserve deliberate Calendar, Tasks, Sheets, and visible Drive backup actions from the prototype. Connect the relevant Google account on demand; use only relevant scopes. Do not use a new Firebase Google sign-in as the integration consent flow: the Domain Expansion UID must remain unchanged. Do not require drive.appdata simply to use Calendar or Sheets. Use an integration-only OAuth token adapter and reconnect when needed; persistent background refresh tokens are not required in this build.

Calendar and Tasks operate only on an explicitly selected domain/action. Use effective dates and reminder semantics; show the selected destination and distinguish created external reminders from mere in-app urgency. External success/failure is independent of saving the domain. Prevent duplicate side effects on an uncertain retry using stable IDs/reconciliation where the API supports it; otherwise show the uncertainty before another creation.

Google Sheets export reads only the current user's selected data. Visible Drive backup writes a new explicitly requested current-format backup. Restore of a user-selected current backup routes through the same validated file preview/commit rules. No hidden appDataFolder scan, live second database, automatic external deletion, or blocking Google consent at first login.

## 12. Implementation defaults, configuration, and release

The numerical limits and module/route conventions above are explicit engineering defaults. Adjust them with recorded rationale and matching tests; do not treat that permission as authority to add product features, silently change providers, or enable paid infrastructure.

Required configuration categories:

- Client Firebase project/app configuration and the production web origin; public Firebase configuration is not an admin credential.
- Server Firebase Admin credentials or supported workload identity, scoped to the intended project/environment; Firestore rules/indexes and service IAM.
- `OWNER_UID`, trusted bootstrap identity, and `ADMIN_NOTIFICATION_EMAIL`; do not infer these from the first signup or commit author.
- `RESEND_API_KEY`, verified Resend From address, fixed admin-page link origin, and protected notification retry credentials/schedule.
- Versioned BYOK encryption keyring/current key ID and `OWNER_GEMINI_API_KEY` if the owner exception is enabled.
- Gemini primary/fallback model IDs, request limits, public endpoint abuse protections, and API throttles.
- Google integration OAuth client/authorized origins and only required API enablement.

Keep authentication and Gemini projects/configuration conceptually separate: enabling Firebase billing does not grant permission to change another user's Gemini data handling or spend. Secrets stay out of client assets, source maps, request logs, exports, and example files. Use separate preview/test resources; previews must not send real user mail or use production credentials by default.

### 12.1 Release gates

Verify the actual Firebase project and operator access; retaining a working project is preferable to an unrequested project migration. Confirm quota and billing choices explicitly. Firebase currently documents only five email-link sign-in emails/day on Spark versus higher Blaze limits [S3]. The plan does not authorize changing billing, and Firebase remains the selected sender unless the owner changes that decision.

Configure and verify `domains.devthomas.site` on Vercel, HTTPS, Firebase authorized domains, and the actual callback route. Custom authentication email domains require template/DNS verification [S8]. Confirm that the desired sender local part is supported in the selected template configuration; do not claim exact branding from a screenshot alone. Coordinate SPF/DKIM records for Firebase and Resend without breaking existing mail. Never add competing SPF records blindly or repoint the web host to Firebase Hosting merely to customize an email domain.

Test request → admin inbox → approve → Firebase inbox → sign-in on the canonical host and a second device. Prove initial and repeat sessions, expiry, suspension, and account switching. Verify Google integration callbacks without changing the application UID. Confirm real primary-model extraction and bounded fallback behavior with non-sensitive fixtures and the intended credentials. Do not expose demo/private data on `/showcase` or create public preview bypass links as part of this pack.

Remove obsolete visible claims such as Zero Central User Database and Storage: Google Drive appDataFolder from the implemented UI/metadata. Update the package identity and README when implementation actually lands. Keep full release rollback/checklist evidence without adding excluded legacy migration. Reverting to the old unguarded data architecture is not an acceptable rollback for admitted users.

## 13. Verification and definition of done

DEW-001 establishes reproducible commands for typecheck, unit tests, emulator tests, API/CLI contract tests, browser tests, and production build. Existing commands are not evidence that new tests exist. Tickets record exact command, result, fixture context, and remaining limits.

Required adversarial matrix: anonymous caller; Firebase identity with no membership; approved user A/B; application admin acting against another user; suspended member with an old valid session; read-only PAT; write-only PAT; read/write PAT; delete PAT; revoked/expired PAT; wrong-project Firebase token; caller-supplied owner/role fields. Test rules and server handlers separately. In particular, Admin SDK tests must prove enforcement even though Firestore rules are bypassed.

Required data fixtures: zero and unknown costs; JPY; leap day/month-end; timezone date boundaries; missing dates; different billing/expiration; all lifecycle/intention combinations; archive reversal; duplicate names/races; stale revisions; retry after lost response; atomic batch failure; import fields with false/zero; currency changes; malicious text/formulas; cross-user cursors/exports.

Required AI fixtures: one and many drafts, ambiguous date/year, missing required fields, nonexistent/invalid key, revoked consent/key, owner exception isolation, provider throttle/timeout/fallback, malformed/truncated output, injected instructions, late result after account switch, and double-click approval. Assert zero domain writes before approval and no owner-key fallback for other users.

UI evidence covers iPhone-sized Safari including the owner's iPhone 16 Pro when available, Android Chrome, desktop keyboard, and 200% zoom. Baseline viewport checks include 390x844 and 1440x900. Five ordinary form groups remain visible with advanced details collapsed; focus moves predictably, dialogs trap/restore focus, labels are accessible, errors are textual, and touch targets/scrolling remain usable. Device emulation is not proof of physical-device acceptance; record what was actually tested.

Finish only when required ticket acceptance criteria have evidence, API documentation agrees with handlers, real service checks have passed or are explicitly marked blocked, no secret/user-data leakage is found, and the canonical host serves the verified build. A successful documentation commit does not mark any implementation ticket complete.

## 14. Technical reference checks

Official documentation checked while preparing this pack on September 26, 2026. These establish supported mechanisms, not successful provisioning or account-specific availability.

- [S1 — Firebase web email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth): link completion, verified email, safe email handling, and authorized callback domains.
- [S2 — Identity Platform accounts.sendOobCode](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendOobCode): Firebase-supported EMAIL_SIGNIN delivery request.
- [S3 — Firebase Authentication limits](https://firebase.google.com/docs/auth/limits): email sending and link-generation limits are distinct; recheck before release.
- [S4 — Firestore rules and queries](https://firebase.google.com/docs/firestore/security/rules-query): server client libraries bypass security rules.
- [S5 — Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys): bounded provider deduplication window, not durable exactly-once delivery.
- [S6 — Gemini API pricing/catalog](https://ai.google.dev/gemini-api/docs/pricing): accepted model IDs and key-tier-dependent data handling; no fixed free-capacity guarantee.
- [S7 — Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output): constrained output still needs application validation.
- [S8 — Firebase custom authentication email domain](https://firebase.google.com/docs/auth/email-custom-domain): template/DNS setup and verification.

Repository baseline inspected: `28a27a1ea5ad48c7d4a25974847be4ee77b38d86`, including Context, ADR, Ideas, package/runtime files, current domain types, and import/export services. Preserve current working code while implementing this contract incrementally.

# Domain Expansion — Architecture Decision Record

## ADR-001 - Continue from the AI Studio web repository

**Status:** Accepted

**Decision:** `devin-thomas/domain-expansion-ai-studio` is the canonical implementation base. The original Flutter repository remains a reference/donor implementation.

**Rationale:** The AI Studio version is the actively evolved responsive web product, already deployed on Vercel and already shaped by Surface Sweep/showcase work. The Flutter version contains stronger domain semantics but is not the desired interaction or delivery model.

**Consequences:** Forward implementation happens in the AI Studio repository. Valuable Flutter semantics are migrated selectively into the web product without merging the two codebases.

## ADR-002 - Use Firestore as canonical persistence

**Status:** Accepted

**Decision:** Firestore becomes the authoritative application database.

**Rationale:** The product should behave like a regular authenticated web application and should not require a live Google Drive OAuth token to persist normal domain data.

**Consequences:** localStorage and Google Drive are no longer co-equal sources of truth. Firestore security rules, ownership boundaries, migrations, and backup behavior must be specified.

## ADR-003 - Gate access through approval plus passwordless email

**Status:** Accepted

**Decision:** Public visitors may request access. An administrator approves or denies requests. Only approved identities may access protected product data. Approved users authenticate through Firebase passwordless email links.

**Rationale:** This preserves a deliberately gated product while allowing organic interest to be captured rather than rejecting all unknown users.

**Consequences:** Firebase authentication alone is insufficient authorization. Access-request state and approved-member state must be enforced server-side and/or by Firestore security rules.

## ADR-004 - Use the portfolio subdomain

**Status:** Accepted

**Decision:** The intended production URL is `domains.devthomas.site`, with an authentication sender target such as `Domain Expansion <auth@devthomas.site>`.

**Rationale:** The product should function as a consistent professional portfolio piece without requiring a separate standalone domain purchase.

**Consequences:** Vercel, Firebase Auth authorized domains, email action links, and relevant redirect URLs must be configured for this host.

## ADR-005 - Preserve a simple human interface over a rich data model

**Status:** Accepted

**Decision:** The canonical domain model may contain advanced semantics from the original Flutter implementation, but primary screens and Quick Add must expose only a small number of impactful items.

**Rationale:** The AI Studio version became more human-usable by intentionally reducing visible scope. Richer capability is valuable only when it does not obstruct fast capture.

**Consequences:** Advanced fields move behind `More details`, advanced edit/detail screens, or dedicated advanced workflows. A rich schema must not imply a rich default form.

## ADR-006 - Treat automation as a first-class API surface

**Status:** Accepted

**Decision:** Build a versioned REST API and an official CLI that consumes it. Agents and scripts use scoped personal access tokens rather than automating the UI or talking directly to Firestore.

**Rationale:** Domain entry and retrieval should be easy to automate and should have a stable contract independent of the UI.

**Consequences:** API authorization, token lifecycle, scopes, rate/error behavior, and CLI configuration become required specification topics.

## ADR-007 - Make Google Drive migration/backup optional rather than live persistence

**Status:** Accepted

**Decision:** Provide a deliberate one-time migration from legacy Google Drive `appDataFolder` data into Firestore. After migration, Drive may serve advanced backup/restore workflows but is not a live second database.

**Rationale:** Two live stores create synchronization and token-lifecycle complexity that is unnecessary once Firestore is canonical.

**Consequences:** The migration must be previewed, validated, explicit, and idempotent enough to recover safely from interruption or retry.

## ADR-008 - Add AI Quick Add as reviewed structured extraction

**Status:** Accepted

**Decision:** Add a separate AI Quick Add mode, visually marked with sparkles, that converts natural-language domain instructions into a structured draft. The user reviews/corrects the draft before explicit approval writes canonical data.

**Rationale:** Natural-language capture can be faster than filling even a simplified form, and the project already has a proven extraction/review pattern from Wayfarer. AI uncertainty must not silently corrupt canonical domain records.

**Consequences:** AI runs server-side behind a replaceable provider adapter. Structured-output validation is mandatory. Provider output is untrusted proposed data until approved.


## ADR-009 - Keep AI approval explicit and lightweight

**Status:** Accepted

**Decision:** AI Quick Add never auto-saves. It returns a compact editable review state and requires explicit approval before writing canonical data.

**Rationale:** The feature exists to make capture faster without allowing uncertain model output to become authoritative data.

**Consequences:** The review UI must be simpler than a general-purpose AI review workflow and optimized for one-click approval when the extracted values are already correct.

## ADR-010 - Support batch AI extraction

**Status:** Accepted

**Decision:** One AI Quick Add submission may produce one or many proposed domain records.

**Rationale:** Batch natural-language capture can save substantial time with little additional conceptual complexity.

**Consequences:** Extraction output and review state must support arrays of drafts, per-item validation, individual correction, and efficient approval of multiple valid drafts.

## ADR-011 - Use owner exception plus BYOK for AI provider access

**Status:** Accepted

**Decision:** The owner/admin account may use a privately configured server-side Gemini credential. Other approved users must deliberately configure their own supported AI provider credential before AI Quick Add is enabled for them.

**Rationale:** The owner accepts the data-handling implications of the private Gemini project, while other users should not have their domain information sent through that project without their own explicit provider relationship.

**Consequences:** AI availability is account-dependent. BYOK credential storage, encryption, rotation, revocation, and provider-error behavior must be specified before implementation.

## ADR-012 - Email the administrator on access requests

**Status:** Accepted

**Decision:** New access requests appear in the admin interface and also trigger an external email notification to the administrator.

**Rationale:** The gated access model is intended to surface unexpected product interest without requiring the administrator to repeatedly check an admin page.

**Consequences:** The implementation needs a reliable admin-notification delivery path independent from the applicant-facing Firebase passwordless authentication email.


## ADR-013 - Use a lightweight Gemini extraction model with fallback

**Status:** Accepted

**Decision:** AI Quick Add initially uses Gemini 3.5 Flash-Lite as the primary extraction model and Gemini 3.8 Flash as fallback, behind the replaceable server-side provider adapter.

**Rationale:** Domain extraction is a small structured-inference task where latency and cost matter more than heavyweight reasoning.

**Consequences:** Model selection is configuration rather than product logic. Fallback should be invoked only for appropriate provider failures, and all outputs remain subject to the same structured validation and explicit user approval.


## ADR-014 - Persist BYOK credentials encrypted server-side

**Status:** Accepted

**Decision:** Approved non-owner users may persist their AI provider credential encrypted server-side. Firestore must never store the raw credential in plaintext, and the raw credential is not returned to the browser after setup.

**Rationale:** Requiring the key every session would undermine the convenience of AI Quick Add, while browser-only persistence would make multi-device use fragile.

**Consequences:** The implementation needs a server-only encryption secret, credential lifecycle endpoints, rotation/revocation behavior, and secret-safe logging/error handling.

## ADR-015 - Keep user domain portfolios private from administrators by default

**Status:** Accepted

**Decision:** Administrative access to requests and account approval does not automatically grant read access to another user's domain records.

**Rationale:** Product administration and user-data access are separate privileges. The gated invitation model should not imply that the product owner reads every approved user's portfolio.

**Consequences:** Firestore rules and server APIs must enforce per-user ownership. Any future support-access mechanism must be explicit rather than implied by the admin role.

## ADR-016 - Use Resend for administrator access-request notifications

**Status:** Accepted

**Decision:** Firebase continues to deliver passwordless authentication emails. Resend delivers administrator-facing access-request notification emails.

**Rationale:** Access-request notifications are application email, not authentication email, and benefit from a clean dedicated delivery path.

**Consequences:** Resend becomes a narrowly scoped server-side dependency with its own secret, sender configuration, failure handling, and delivery observability.

## ADR-017 - Restore the richer canonical domain model without restoring UI clutter

**Status:** Accepted

**Decision:** The canonical web data model restores the richer domain concepts from the original Flutter implementation, including separate billing/expiration dates, registration/renewal costs, DNS provider, ownership, lifecycle, auto-renew, notes, archive state, and reminder overrides.

**Rationale:** A rich data model improves automation, reporting, migration, and future integrations, while the AI Studio version proved that exposing every field during normal capture harms usability.

**Consequences:** UI complexity is intentionally lower than schema complexity. Quick Add remains sparse, advanced fields are gated, and API/CLI consumers may access the richer model without forcing those fields into primary human workflows.

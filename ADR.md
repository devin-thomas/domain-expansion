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

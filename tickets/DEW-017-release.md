# DEW-017 — Verify the canonical host and release the portfolio-ready product

**Status:** Blocked

## Goal

Serve the verified application on the intended professional URL with working admission/email flows and an honest public showcase.

## Scope

Prepare and, only with appropriate authorization, perform canonical Vercel domain configuration, Firebase callback/authorized-domain setup, verified email sender setup, protected retry operations, and final deployment smoke tests. Update user/operator/API/CLI documentation and showcase content to reflect actual completed behavior.

Contract: SPEC sections 12–13; R14, R16.

## Acceptance Criteria

- `domains.devthomas.site` resolves to the intended Vercel project with HTTPS; direct visits to `/auth/finish`, `/showcase`, and API routes work.
- Real request → admin inbox → Approve → Firebase inbox → passwordless sign-in succeeds on the canonical host, including second-device completion.
- Desired Firebase sender branding is actually verified; Resend remains the admin notification provider. SPF/DKIM changes do not break existing domain mail.
- Firebase's email-link quota and any billing choice are checked explicitly. No paid upgrade or auth-provider switch happens silently.
- Owner UID, recipient, provider/encryption secrets, Firebase project, preview isolation, and retry configuration are documented without committing values.
- Public showcase uses safe synthetic evidence of implemented features only; protected app data and provider keys are never public.
- Obsolete Zero Central User Database/Drive-primary copy and generic package identity are corrected where the implementation changed them.
- README, API contract, CLI help, ticket statuses, and actual deployment agree. Record rollback/recovery procedures without restoring an unguarded legacy architecture.
- All required prior evidence is complete. Missing DNS, credentials, physical checks, or service access is explicitly Blocked, not presented as a finished launch.

## Dependencies

[DEW-016](DEW-016-acceptance.md).

## Verification

Blocked on 2026-09-27. No deployment identifier, host probe, inbox receipt, or quota check exists for this change.

Missing inputs:

- Authority to set DNS so `domains.devthomas.site` reaches the intended Vercel project.
- Firebase authorized-domain and sender verification for `Domain Expansion <auth@devthomas.site>`.
- A real admin recipient and Resend credentials, plus permission to send the admission mail.
- Firebase email-link quota review and explicit billing consent before any paid change.
- `OWNER_UID` and the server secrets named in `docs/RELEASE.md`, supplied outside git.
- A second device to finish a real email link.
- Physical phone checks, which DEW-016 also leaves unclaimed.

Automated evidence for DEW-001 through DEW-016 is in those tickets. Rollback steps are in `docs/RELEASE.md`. This ticket does not change billing or DNS.

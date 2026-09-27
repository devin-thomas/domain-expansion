# Domain Expansion — Ideas and Deferred Scope

Items here are valuable possibilities, not current requirements.

## Branded Resend Authentication Email

If Firebase Authentication's built-in passwordless email customization is not visually sufficient, generate the Firebase sign-in link server-side and deliver a fully branded Domain Expansion email through Resend.

Do not add this dependency merely for passwordless functionality; Firebase delivery is the initial path.

## Outbound Webhooks

Expose user-configurable outbound event webhooks for events such as domain created, updated, upcoming renewal, renewal intention changed, or access approved.

Deferred until a concrete event consumer requires them. The initial automation contract is REST API + CLI.

## Registrar / DNS Provider Integrations

Automated registrar or DNS-provider synchronization could reduce manual entry, but should remain outside the current build unless promoted through later discovery.

## Automatic Renewal Price Discovery

Use registrar APIs, receipts, or other integrations to help populate future renewal costs.

Deferred because the current product prioritizes trustworthy explicit records and fast entry.

## Richer AI Intake Sources

Extend AI Quick Add beyond typed natural language to optional pasted emails, screenshots, receipts, invoices, or registrar notices.

If promoted later, preserve the same extract → review → approve boundary rather than auto-saving model output.

## Additional Automation Clients

Thin clients, agent skills, MCP servers, or workflow integrations may be built over the versioned REST API once the API is stable.

They should not bypass the canonical service/API rules by becoming direct Firestore clients.

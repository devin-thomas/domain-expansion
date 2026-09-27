export function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Domain Expansion API',
      version: '1.0.0',
      description:
        'Versioned domain API. Money is integer minor units. Dates are YYYY-MM-DD. Null means unknown. Omitted PATCH fields stay unchanged. Explicit null clears nullable fields. Archive is isArchived. Permanent deletion requires domains:delete and If-Match. Writes require Idempotency-Key. Browser sessions use Firebase ID tokens; automation uses dew1 personal access tokens.',
    },
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'requestId', 'retryable'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                requestId: { type: 'string' },
                retryable: { type: 'boolean' },
                issues: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    paths: {
      '/api/health': { get: { summary: 'Process health', responses: { '200': { description: 'ok' } } } },
      '/api/openapi.json': { get: { summary: 'This document', responses: { '200': { description: 'OpenAPI' } } } },
      '/api/access/request': { post: { summary: 'Request access. Response does not reveal account state.', responses: { '202': { description: 'Accepted' }, '429': { description: 'Throttled' } } } },
      '/api/auth/email-link': { post: { summary: 'Ask Firebase to send a sign-in email when the address is approved.', responses: { '202': { description: 'Generic acceptance' } } } },
      '/api/session': { get: { security: [{ bearer: [] }], summary: 'Current actor', responses: { '200': { description: 'Actor' } } } },
      '/api/admin/requests': { get: { security: [{ bearer: [] }], summary: 'Admin queue. No portfolios.', responses: { '200': { description: 'Requests' } } } },
      '/api/admin/requests/{id}/approve': { post: { security: [{ bearer: [] }], summary: 'Approve and start the Firebase sign-in email', responses: { '200': { description: 'Approved' } } } },
      '/api/admin/requests/{id}/deny': { post: { security: [{ bearer: [] }], summary: 'Deny without membership', responses: { '200': { description: 'Denied' } } } },
      '/api/v1/domains': {
        get: { security: [{ bearer: [] }], summary: 'List the caller portfolio. Requires domains:read.', parameters: [{ name: 'q' }, { name: 'cursor' }, { name: 'limit' }, { name: 'archived' }, { name: 'sort' }], responses: { '200': { description: 'Page' } } },
        post: { security: [{ bearer: [] }], summary: 'Create. Requires domains:write and Idempotency-Key.', responses: { '201': { description: 'Created' }, '409': { description: 'Duplicate or idempotency conflict' } } },
      },
      '/api/v1/domains/batch': { post: { security: [{ bearer: [] }], summary: 'Atomic create of up to 100 records, or 25 when source is ai.', responses: { '201': { description: 'Created' } } } },
      '/api/v1/domains/{id}': {
        get: { security: [{ bearer: [] }], summary: 'Read one record. Foreign ids look missing.', responses: { '200': { description: 'Record and ETag' }, '404': { description: 'Not found' } } },
        patch: { security: [{ bearer: [] }], summary: 'Partial update. Requires If-Match.', responses: { '200': { description: 'Updated' }, '412': { description: 'Stale revision' }, '428': { description: 'Missing If-Match' } } },
        delete: { security: [{ bearer: [] }], summary: 'Permanent delete. Requires domains:delete and If-Match.', responses: { '204': { description: 'Deleted' } } },
      },
      '/api/v1/import/preview': { post: { security: [{ bearer: [] }], summary: 'Validate an import and write nothing to the portfolio.', responses: { '200': { description: 'Preview' } } } },
      '/api/v1/import/commit': { post: { security: [{ bearer: [] }], summary: 'Apply a preview. Omitted records are not deleted.', responses: { '200': { description: 'Committed' } } } },
      '/api/v1/export': { get: { security: [{ bearer: [] }], summary: 'Export the caller domains. Settings require a browser session.', responses: { '200': { description: 'File' } } } },
      '/api/v1/summary': { get: { security: [{ bearer: [] }], summary: 'Dashboard summary for the caller only.', responses: { '200': { description: 'Summary' } } } },
      '/api/v1/settings': {
        get: { security: [{ bearer: [] }], summary: 'Caller settings. Session only.', responses: { '200': { description: 'Settings' } } },
        put: { security: [{ bearer: [] }], summary: 'Replace caller settings. Session only.', responses: { '200': { description: 'Saved' } } },
      },
      '/api/v1/domains/{id}/integrations': { post: { security: [{ bearer: [] }], summary: 'Record an external id after an explicit integration action. Requires If-Match.', responses: { '200': { description: 'Updated' } } } },
      '/api/tokens': {
        get: { security: [{ bearer: [] }], summary: 'List token metadata. Secrets are not returned.', responses: { '200': { description: 'Tokens' } } },
        post: { security: [{ bearer: [] }], summary: 'Create a personal access token. Plaintext is returned once.', responses: { '201': { description: 'Token' } } },
      },
      '/api/tokens/{id}/revoke': { post: { security: [{ bearer: [] }], summary: 'Revoke one personal access token.', responses: { '200': { description: 'Revoked' } } } },
      '/api/credentials/gemini': {
        get: { security: [{ bearer: [] }], summary: 'Credential status. The raw key is never returned.', responses: { '200': { description: 'Status' } } },
        put: { security: [{ bearer: [] }], summary: 'Store a consented Gemini key. Recent session required.', responses: { '200': { description: 'Stored' } } },
        delete: { security: [{ bearer: [] }], summary: 'Remove the stored Gemini key.', responses: { '200': { description: 'Removed' } } },
      },
      '/api/ai/extract': { post: { security: [{ bearer: [] }], summary: 'Propose drafts. Does not write domains.', responses: { '200': { description: 'Drafts' } } } },
      '/api/admin/requests/{id}/resend-signin': { post: { security: [{ bearer: [] }], summary: 'Retry the Firebase sign-in email for an approved request.', responses: { '200': { description: 'Retried' } } } },
      '/api/admin/members/{uid}/suspend': { post: { security: [{ bearer: [] }], summary: 'Suspend membership. The portfolio is retained.', responses: { '200': { description: 'Suspended' } } } },
      '/api/admin/members/{uid}/reinstate': { post: { security: [{ bearer: [] }], summary: 'Reinstate a suspended member.', responses: { '200': { description: 'Reinstated' } } } },
      '/api/admin/notifications/{id}/retry': { post: { security: [{ bearer: [] }], summary: 'Retry one failed admin notification from a recent admin session.', responses: { '200': { description: 'Retried' } } } },
      '/api/internal/notifications/retry': { post: { summary: 'Protected worker retry. Requires the notification retry secret.', responses: { '200': { description: 'Processed' } } } },
    },
  };
}

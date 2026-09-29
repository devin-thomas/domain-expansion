import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../../shared/openapi';
import { call, session, startHarness } from '../helpers';

describe('OpenAPI domain mutation contract', () => {
  it('references create and patch schemas and their required concurrency headers', () => {
    const document = openApiDocument() as any;
    const create = document.paths['/api/v1/domains'].post;
    const patch = document.paths['/api/v1/domains/{id}'].patch;
    const schemas = document.components.schemas;

    expect(create.requestBody.content['application/json'].schema.$ref).toBe('#/components/schemas/DomainInput');
    expect(create.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }));
    expect(create.responses).toHaveProperty('201');
    expect(create.responses).toHaveProperty('400');
    expect(create.responses).toHaveProperty('409');
    expect(create.responses).toHaveProperty('422');

    expect(patch.requestBody.content['application/json'].schema.$ref).toBe('#/components/schemas/DomainPatch');
    expect(patch.parameters).toContainEqual(expect.objectContaining({ name: 'If-Match', in: 'header', required: true }));
    expect(patch.responses).toHaveProperty('200');
    expect(patch.responses).toHaveProperty('412');
    expect(patch.responses).toHaveProperty('428');

    expect(schemas.DomainInput.required).toContain('name');
    expect(schemas.DomainPatch.required).toBeUndefined();
    expect(schemas.DomainInput.properties.purchaseEmail).toMatchObject({ type: ['string', 'null'], pattern: expect.any(String) });
    expect(schemas.DomainInput.properties.paymentMethod).toMatchObject({ type: ['string', 'null'], maxLength: 2000 });
    expect(schemas.DomainPatch.properties.clearCostsOnCurrencyChange).toMatchObject({ type: 'boolean', const: true });
  });

  it('matches create and patch API behavior for the optional payment fields', async () => {
    const harness = await startHarness();
    try {
      const token = await session(harness.base, { uid: 'contract-user', email: 'contract@example.com' });
      const missingKey = await call(harness.base, token, 'POST', '/api/v1/domains', {
        body: { name: 'missing-key.example', expirationDate: '2027-09-28' },
      });
      expect(missingKey.status).toBe(400);

      const invalidEmail = await call(harness.base, token, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'invalid-email' },
        body: { name: 'invalid-email.example', expirationDate: '2027-09-28', purchaseEmail: 'invalid' },
      });
      expect(invalidEmail.status).toBe(422);

      const created = await call(harness.base, token, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'payment-create' },
        body: {
          name: 'payment-contract.example',
          expirationDate: '2027-09-28',
          purchaseEmail: ' billing@example.com ',
          paymentMethod: '4111111111111111',
        },
      });
      expect(created.status).toBe(201);
      expect(created.headers.get('etag')).toBe('"1"');
      expect(created.body).toMatchObject({ purchaseEmail: 'billing@example.com', paymentMethod: '4111111111111111' });

      const missingPrecondition = await call(harness.base, token, 'PATCH', `/api/v1/domains/${created.body.id}`, {
        body: { paymentMethod: 'Changed method' },
      });
      expect(missingPrecondition.status).toBe(428);

      const patched = await call(harness.base, token, 'PATCH', `/api/v1/domains/${created.body.id}`, {
        headers: { 'if-match': '"1"' },
        body: { purchaseEmail: null, paymentMethod: null },
      });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ purchaseEmail: null, paymentMethod: null });
    } finally {
      await harness.close();
    }
  });

  it('keeps null fields on merge and clears them on replace imports', async () => {
    const harness = await startHarness();
    try {
      const token = await session(harness.base, { uid: 'merge-user', email: 'merge@example.com' });
      const created = await call(harness.base, token, 'POST', '/api/v1/domains', {
        headers: { 'idempotency-key': 'merge-seed' },
        body: {
          name: 'merge-payment.example',
          expirationDate: '2027-09-28',
          purchaseEmail: 'billing@example.com',
          paymentMethod: 'Card ending 4242',
        },
      });
      const backup = JSON.stringify({
        format: 'domain-expansion-backup',
        schemaVersion: 2,
        domains: [{ name: 'merge-payment.example', expirationDate: '2027-09-28', purchaseEmail: null, paymentMethod: null }],
      });

      const previewMerge = await call(harness.base, token, 'POST', '/api/v1/import/preview', {
        body: { format: 'json', content: backup, policy: 'merge' },
      });
      expect(previewMerge.status).toBe(200);
      expect(previewMerge.body.rows[0].changes).toEqual([]);
      const committedMerge = await call(harness.base, token, 'POST', '/api/v1/import/commit', {
        headers: { 'idempotency-key': 'merge-null' },
        body: { previewId: previewMerge.body.previewId, contentHash: previewMerge.body.contentHash },
      });
      expect(committedMerge.status).toBe(200);
      expect(committedMerge.body.applied[0]).toMatchObject({ purchaseEmail: 'billing@example.com', paymentMethod: 'Card ending 4242' });

      const previewReplace = await call(harness.base, token, 'POST', '/api/v1/import/preview', {
        body: { format: 'json', content: backup, policy: 'replace' },
      });
      expect(previewReplace.status).toBe(200);
      const committedReplace = await call(harness.base, token, 'POST', '/api/v1/import/commit', {
        headers: { 'idempotency-key': 'replace-null' },
        body: { previewId: previewReplace.body.previewId, contentHash: previewReplace.body.contentHash },
      });
      expect(committedReplace.status).toBe(200);
      expect(committedReplace.body.applied[0]).toMatchObject({ purchaseEmail: null, paymentMethod: null });
      expect(created.body.id).toBe(committedReplace.body.applied[0].id);
    } finally {
      await harness.close();
    }
  });
});

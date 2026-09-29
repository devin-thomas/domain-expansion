import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { waitUntil } from '@vercel/functions';
import { createDeps } from './createApp';
import { handleApi } from './http';

let depsPromise: ReturnType<typeof createDeps> | undefined;

export async function handleProductionRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    depsPromise ??= createDeps();
    const deps = await depsPromise;
    await handleApi(request, response, deps, waitUntil);
  } catch (error) {
    depsPromise = undefined;
    const requestId = randomUUID();
    console.error('runtime request failed', { requestId, name: error instanceof Error ? error.name : 'error' });
    if (response.writableEnded) return;
    response.statusCode = 503;
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify({ error: { code: 'service_unavailable', message: 'Domain Expansion is temporarily unavailable', requestId, retryable: true } }));
  }
}

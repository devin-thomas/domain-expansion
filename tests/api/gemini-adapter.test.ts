import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiPort } from '../../server/adapters';
import { call, session, startHarness } from '../helpers';

const API_KEY = 'synthetic-gemini-key';
const originalFetch = global.fetch;

function providerResponse(text: string, finishReason = 'STOP') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function request() {
  return {
    model: 'gemini-3.5-flash-lite',
    apiKey: API_KEY,
    system: 'Return JSON.',
    user: 'example.test',
    timeoutMs: 100,
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Gemini HTTP adapter', () => {
  it('sends the key only in x-goog-api-key, never in the request URL', async () => {
    let capturedUrl = '';
    let capturedHeaders = new Headers();
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return providerResponse('{"drafts":[]}');
    }) as typeof fetch;

    const result = await createGeminiPort().generate(request());

    expect(result).toEqual({ ok: true, text: '{"drafts":[]}', truncated: false });
    expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(capturedUrl).not.toContain(API_KEY);
    expect(new URL(capturedUrl).search).toBe('');
    expect(capturedHeaders.get('x-goog-api-key')).toBe(API_KEY);
  });

  it('aborts a pending provider fetch at the requested attempt timeout', async () => {
    let receivedSignal: AbortSignal | null = null;
    global.fetch = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      receivedSignal = init?.signal as AbortSignal;
      const rejectAsAborted = () => reject(new DOMException('The request was aborted', 'AbortError'));
      if (receivedSignal.aborted) rejectAsAborted();
      else receivedSignal.addEventListener('abort', rejectAsAborted, { once: true });
    })) as typeof fetch;

    const result = await createGeminiPort().generate({ ...request(), timeoutMs: 20 });

    expect(result).toEqual({ ok: false, kind: 'timeout', status: 504 });
    expect(receivedSignal?.aborted).toBe(true);
  });

  it.each([
    { status: 408, kind: 'timeout' },
    { status: 401, kind: 'auth' },
    { status: 403, kind: 'auth' },
    { status: 429, kind: 'throttle' },
    { status: 500, kind: 'upstream' },
    { status: 503, kind: 'upstream' },
  ] as const)('maps HTTP $status to provider failure kind $kind', async ({ status, kind }) => {
    global.fetch = (async () => new Response('', {
      status,
      headers: status === 429 ? { 'retry-after': '2' } : undefined,
    })) as typeof fetch;

    const result = await createGeminiPort().generate(request());

    expect(result).toMatchObject({ ok: false, status, kind });
    if (status === 429) expect(result).toMatchObject({ retryAfterMs: 2_000 });
  });

  it('maps Gemini MAX_TOKENS to a truncated result for server-side rejection', async () => {
    global.fetch = (async () => providerResponse('{"drafts":[', 'MAX_TOKENS')) as typeof fetch;

    const result = await createGeminiPort().generate(request());

    expect(result).toEqual({ ok: true, text: '{"drafts":[', truncated: true });
  });

  it('classifies malformed provider JSON as non-transient', async () => {
    global.fetch = (async () => new Response('{not-json', { status: 200 })) as typeof fetch;

    const result = await createGeminiPort().generate(request());

    expect(result).toEqual({ ok: false, kind: 'bad', status: 502 });
  });

  it.each([
    ['null response envelope', 'null'],
    ['non-array candidates', '{"candidates":{}}'],
    ['null candidate', '{"candidates":[null]}'],
    ['non-object content', '{"candidates":[{"content":[]}]}'],
    ['non-array parts', '{"candidates":[{"content":{"parts":{}}}]}'],
    ['null part', '{"candidates":[{"content":{"parts":[null]}}]}'],
    ['non-string text part', '{"candidates":[{"content":{"parts":[{"text":7}]}}]}'],
    ['non-string finish reason', '{"candidates":[{"finishReason":7}]}'],
  ])('classifies a %s as non-transient', async (_label, responseBody) => {
    global.fetch = (async () => new Response(responseBody, { status: 200 })) as typeof fetch;

    const result = await createGeminiPort().generate(request());

    expect(result).toEqual({ ok: false, kind: 'bad', status: 502 });
  });

  it('keeps a valid envelope without candidates on the extraction validation path', async () => {
    global.fetch = (async () => new Response('{"promptFeedback":{"blockReason":"OTHER"}}', { status: 200 })) as typeof fetch;

    const result = await createGeminiPort().generate(request());

    expect(result).toEqual({ ok: true, text: '', truncated: false });
  });

  it('runs one extraction fallback through real adapter HTTP responses with the same BYOK key', async () => {
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'gemini-fallback-user', email: 'fallback@example.com' });
      const credential = await call(harness.base, member, 'PUT', '/api/credentials/gemini', {
        body: { apiKey: API_KEY, consent: true, consentVersion: '2026-09-26' },
      });
      expect(credential.status).toBe(200);
      harness.deps.ai = createGeminiPort();

      const providerRequests: { url: URL; headers: Headers }[] = [];
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname !== 'generativelanguage.googleapis.com') return originalFetch(input, init);
        providerRequests.push({ url, headers: new Headers(init?.headers) });
        if (providerRequests.length === 1) return new Response('', { status: 429 });
        return providerResponse('{"drafts":[]}');
      }) as typeof fetch;

      const result = await call(harness.base, member, 'POST', '/api/ai/extract', {
        body: { text: 'fallback.example renews in May' },
      });

      expect(result.status).toBe(200);
      expect(result.body.model).toBe('gemini-3.8-flash');
      expect(providerRequests.map(({ url }) => url.pathname)).toEqual([
        '/v1beta/models/gemini-3.5-flash-lite:generateContent',
        '/v1beta/models/gemini-3.8-flash:generateContent',
      ]);
      expect(providerRequests.every(({ url }) => url.search === '')).toBe(true);
      expect(providerRequests.map(({ headers }) => headers.get('x-goog-api-key'))).toEqual([API_KEY, API_KEY]);
    } finally {
      await harness.close();
    }
  });

  it('returns a retryable response without waiting or falling back when Retry-After exceeds the total deadline', async () => {
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'gemini-retry-after-user', email: 'retry-after@example.com' });
      await call(harness.base, member, 'PUT', '/api/credentials/gemini', {
        body: { apiKey: API_KEY, consent: true, consentVersion: '2026-09-26' },
      });
      harness.deps.ai = createGeminiPort();
      let providerCalls = 0;
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        if (new URL(String(input)).hostname !== 'generativelanguage.googleapis.com') return originalFetch(input, init);
        providerCalls += 1;
        return new Response('', { status: 429, headers: { 'retry-after': '44.5' } });
      }) as typeof fetch;

      const started = Date.now();
      const result = await call(harness.base, member, 'POST', '/api/ai/extract', { body: { text: 'retry.example' } });

      expect(Date.now() - started).toBeLessThan(2_000);
      expect(result.status).toBe(429);
      expect(result.body.error.retryable).toBe(true);
      expect(providerCalls).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it('does not spend a fallback attempt when the successful HTTP response contains malformed JSON', async () => {
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'gemini-malformed-user', email: 'malformed@example.com' });
      await call(harness.base, member, 'PUT', '/api/credentials/gemini', {
        body: { apiKey: API_KEY, consent: true, consentVersion: '2026-09-26' },
      });
      harness.deps.ai = createGeminiPort();
      let providerCalls = 0;
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        if (new URL(String(input)).hostname !== 'generativelanguage.googleapis.com') return originalFetch(input, init);
        providerCalls += 1;
        return new Response('{not-json', { status: 200 });
      }) as typeof fetch;

      const result = await call(harness.base, member, 'POST', '/api/ai/extract', { body: { text: 'malformed.example' } });

      expect(result.status).toBe(503);
      expect(result.body.error.code).toBe('ai_unavailable');
      expect(result.body.error.retryable).toBe(false);
      expect(providerCalls).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it('does not spend fallback attempts for malformed Gemini envelope shapes', async () => {
    const malformedBodies = [
      'null',
      '{"candidates":{}}',
      '{"candidates":[null]}',
      '{"candidates":[{"content":{"parts":[null]}}]}',
      '{"candidates":[{"content":{"parts":[{"text":7}]}}]}',
    ];
    const harness = await startHarness();
    try {
      const member = await session(harness.base, { uid: 'gemini-envelope-user', email: 'envelope@example.com' });
      await call(harness.base, member, 'PUT', '/api/credentials/gemini', {
        body: { apiKey: API_KEY, consent: true, consentVersion: '2026-09-26' },
      });
      harness.deps.ai = createGeminiPort();
      let providerCalls = 0;
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        if (new URL(String(input)).hostname !== 'generativelanguage.googleapis.com') return originalFetch(input, init);
        const responseBody = malformedBodies[providerCalls];
        providerCalls += 1;
        return new Response(responseBody, { status: 200 });
      }) as typeof fetch;

      for (let index = 0; index < malformedBodies.length; index += 1) {
        const result = await call(harness.base, member, 'POST', '/api/ai/extract', { body: { text: `malformed-${index}.example` } });
        expect(result.status).toBe(503);
        expect(result.body.error.code).toBe('ai_unavailable');
        expect(result.body.error.retryable).toBe(false);
        expect(providerCalls).toBe(index + 1);
      }
    } finally {
      await harness.close();
    }
  });
});

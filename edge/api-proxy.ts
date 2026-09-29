import {
  createEdgeClientIpHeaders,
  EDGE_CLIENT_IP_HEADER,
  EDGE_CLIENT_IP_SIGNATURE_HEADER,
  EDGE_CLIENT_IP_TIME_HEADER,
  isValidEdgeClientIp,
} from '../shared/edge-client-ip';

export const EDGE_REVISION_HEADER = 'x-domain-expansion-revision';

interface EdgeEnvironment {
  EDGE_CLIENT_IP_SECRET: string;
}

export async function forwardOriginRequest(request: Request, secret: string, now = new Date()): Promise<Request> {
  const headers = new Headers(request.headers);
  const revision = headers.get('if-match');
  headers.delete('if-match');
  headers.delete('x-domain-expansion-if-match');
  headers.delete(EDGE_REVISION_HEADER);
  if (revision !== null) headers.set(EDGE_REVISION_HEADER, revision);
  const clientIp = headers.get('cf-connecting-ip');
  headers.delete(EDGE_CLIENT_IP_HEADER);
  headers.delete(EDGE_CLIENT_IP_TIME_HEADER);
  headers.delete(EDGE_CLIENT_IP_SIGNATURE_HEADER);
  if (!clientIp || !isValidEdgeClientIp(clientIp)) throw new Error('Cloudflare client IP unavailable');
  const signedHeaders = await createEdgeClientIpHeaders(clientIp, secret, now);
  for (const [name, value] of Object.entries(signedHeaders)) headers.set(name, value);
  headers.set('x-forwarded-for', clientIp);
  return new Request(request, { headers, cache: 'no-store', redirect: 'manual' });
}

export default {
  async fetch(request: Request, env: EdgeEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return fetch(request);
    if (!/^[a-f\d]{64}$/i.test(env.EDGE_CLIENT_IP_SECRET ?? '') || !isValidEdgeClientIp(request.headers.get('cf-connecting-ip') ?? '')) {
      return Response.json({ error: { code: 'edge_unavailable', message: 'API routing is temporarily unavailable.' } }, { status: 503 });
    }
    // Strip the HTTP condition before Vercel sees it; the API still validates the revision.
    return fetch(await forwardOriginRequest(request, env.EDGE_CLIENT_IP_SECRET));
  },
};

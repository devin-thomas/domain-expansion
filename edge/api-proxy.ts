export const EDGE_REVISION_HEADER = 'x-domain-expansion-revision';

export function forwardOriginRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  const revision = headers.get('if-match');
  headers.delete('if-match');
  headers.delete('x-domain-expansion-if-match');
  headers.delete(EDGE_REVISION_HEADER);
  if (revision !== null) headers.set(EDGE_REVISION_HEADER, revision);
  const clientIp = headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  return new Request(request, { headers, cache: 'no-store', redirect: 'manual' });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return fetch(request);
    // Strip the HTTP condition before Vercel sees it; the API still validates the revision.
    return fetch(forwardOriginRequest(request));
  },
};

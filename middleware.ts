import { next } from '@vercel/functions';

export const FORWARDED_IF_MATCH_HEADER = 'x-domain-expansion-if-match';

export function forwardApiPreconditionHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  const ifMatch = headers.get('if-match');
  headers.delete(FORWARDED_IF_MATCH_HEADER);
  headers.delete('if-match');
  if (ifMatch !== null) headers.set(FORWARDED_IF_MATCH_HEADER, ifMatch);
  return headers;
}

export const config = { matcher: ['/api/:path*'] };

export default function middleware(request: Request): Response {
  const pathname = new URL(request.url).pathname;
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return next();
  return next({ request: { headers: forwardApiPreconditionHeaders(request.headers) } });
}

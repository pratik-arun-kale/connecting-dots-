import { NextResponse, type NextRequest } from 'next/server';

/**
 * Forwards the dashboard's own /api/* to the API (API_UPSTREAM_URL), so the
 * browser only ever talks to this origin. The refresh cookie is then
 * same-site and sent on every reload; called across sites (*.vercel.app to
 * *.run.app), SameSite=Strict would drop it and sign everyone out.
 *
 * Unset API_UPSTREAM_URL (local development, where NEXT_PUBLIC_API_BASE_URL
 * points straight at the API): nothing is forwarded.
 *
 * With PROXY_SHARED_SECRET set (the same value as the API's), the request
 * also carries X-Proxy-Secret and the browser's address in X-Client-IP, so
 * the API's per-IP limits count each visitor rather than this server
 * (services/api/app/core/rate_limit.py). Both headers are always replaced,
 * never passed on from the browser.
 */
export function proxy(request: NextRequest) {
  const upstream = process.env.API_UPSTREAM_URL;
  if (!upstream) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, upstream);
  const headers = new Headers(request.headers);
  headers.delete('x-proxy-secret');
  headers.delete('x-client-ip');

  const secret = process.env.PROXY_SHARED_SECRET;
  const ip = clientIp(request);
  if (secret && ip) {
    headers.set('x-proxy-secret', secret);
    headers.set('x-client-ip', ip);
  }

  return NextResponse.rewrite(target, { request: { headers } });
}

/**
 * The visitor's address, only where a platform vouches for it. Vercel sets
 * x-real-ip itself, replacing anything the browser sent. Elsewhere (next
 * start with nothing in front) any header could be made up, so none is
 * reported and the API falls back to the address it sees.
 */
function clientIp(request: NextRequest): string | null {
  if (process.env.VERCEL !== '1') return null;
  return request.headers.get('x-real-ip')?.trim() || null;
}

export const config = {
  matcher: '/api/:path*',
};

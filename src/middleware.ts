/**
 * Next.js middleware — edge-level session refresh and route gating.
 *
 * Runs BEFORE every non-static request. Refreshes the Supabase session
 * cookie (so expired tokens rotate before hitting handlers) and
 * redirects unauthenticated requests on protected paths to /login with
 * ?next=<pathname>.
 *
 * Cloned discipline from BFT's src/auth/RouteGuard.tsx: server-side
 * gating IS the security boundary. Client RouteGuard is UX only —
 * loading state + friendly redirect — it never protects data. This
 * middleware is the security wall.
 *
 * Public paths (no auth required):
 *   /login
 *   /auth/callback
 *   /unauthorized
 *   /_next/*, /api/whoami, static assets, favicons
 *
 * Everything else requires a session; role-level gating happens per-
 * page (the /internal tree already uses a different discipline;
 * layer that in as more roles land).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = new Set(['/login', '/auth/callback', '/unauthorized']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // /api/whoami is public so the client can call it BEFORE it knows
  // whether it has a session (whoami itself returns 401 when there
  // isn't one; middleware would double-401 otherwise).
  if (pathname === '/api/whoami') return true;
  return false;
}

export async function middleware(req: NextRequest) {
  // supabase-ssr requires a mutable response to attach refreshed
  // cookies to. Start with a pass-through response and let
  // createServerClient set cookies via setAll below.
  let res = NextResponse.next({ request: req });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Copy set-cookie instructions to BOTH the incoming request
          // (so a downstream getUser() sees the refreshed token) and
          // the outgoing response (so the browser stores it).
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session cookie. IMPORTANT: getUser() (not getSession)
  // per Supabase-SSR guidance — getUser hits the auth server and
  // validates the token, so a stolen-but-revoked token doesn't pass.
  const { data: { user } } = await sb.auth.getUser();

  const pathname = req.nextUrl.pathname;

  if (isPublic(pathname)) return res;

  if (!user) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  // Match everything except Next internals, static, and image
  // optimisation. Matcher is negative-only per Next.js convention;
  // isPublic() above handles the app-level allowlist.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)'],
};

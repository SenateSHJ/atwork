/**
 * /auth/callback — magic-link exchange endpoint.
 *
 * Cloned pattern from BFT's src/pages/AuthCallbackPage.tsx
 * (2026-08-31), moved to a Next.js Route Handler so the code→session
 * exchange happens server-side. Supabase magic-link tokens carry a
 * `code` in the redirect URL that must be swapped for a session
 * (exchangeCodeForSession); doing it server-side means the session
 * cookie is set before the browser renders anything, so post-login
 * redirects never see 'resolving'.
 *
 * BFT's callback ran client-side, waited on AuthProvider, then
 * checked AAL for MFA. atWork skips the MFA branch (single user,
 * MFA layer deferred) and routes by role: internal → /monthly-reports,
 * everything else → /unauthorized.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseRoute } from '@/lib/supabase/route';
import type { UserRole } from '@/lib/auth/types';

const ROLE_LANDING: Record<UserRole, string> = {
  internal: '/monthly-reports',
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const sb = await supabaseRoute();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  const { data: { user } } = await sb.auth.getUser();
  const role = user?.app_metadata?.role as UserRole | undefined;
  if (!user || !role) {
    return NextResponse.redirect(`${origin}/unauthorized`);
  }

  // Honour ?next if it's a same-origin path; otherwise route by role.
  const landing = (next && next.startsWith('/') && !next.startsWith('//'))
    ? next
    : (ROLE_LANDING[role] ?? '/unauthorized');
  return NextResponse.redirect(`${origin}${landing}`);
}

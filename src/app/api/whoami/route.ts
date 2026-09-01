/**
 * /api/whoami — server-verified identity endpoint.
 *
 * Cloned shape from BFT's supabase/functions/whoami/index.ts
 * (2026-08-31). Reads the session cookie via @supabase/ssr's server
 * client, calls auth.getUser() to validate, returns { userId, email,
 * role } from app_metadata.
 *
 * app_metadata (not user_metadata) because app_metadata is server-
 * controlled — the user cannot modify it via JWT tampering. The role
 * value seeded here matches BFT's convention: 'internal' for
 * dashboard staff.
 *
 * Returns:
 *   200 { success: true, data: { userId, email, role } }
 *   401 { success: false, error: 'Authentication required',
 *         code: 'AUTH.MISSING_TOKEN.W' }
 */

import { NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/supabase/route';
import type { UserRole } from '@/lib/auth/types';

export async function GET(): Promise<NextResponse> {
  const sb = await supabaseRoute();
  const { data: { user }, error } = await sb.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { success: false, error: 'Authentication required', code: 'AUTH.MISSING_TOKEN.W' },
      { status: 401 },
    );
  }

  const role = (user.app_metadata?.role as UserRole | undefined) ?? null;
  if (!role) {
    // User authenticated but no role in app_metadata — provisioning
    // gap. Fail closed rather than default to any role.
    return NextResponse.json(
      { success: false, error: 'No role assigned', code: 'AUTH.NO_ROLE.W' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      userId: user.id,
      email:  user.email ?? null,
      role,
    },
  });
}

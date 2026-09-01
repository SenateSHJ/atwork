// Server-side Supabase client for Next.js Route Handlers, Server
// Components, and Middleware. Reads + writes cookies via
// @supabase/ssr's createServerClient. Distinct from supabaseServer()
// in ./server.ts which uses the service-role key for background
// jobs; this one uses the anon key + user's session cookie for
// authenticated request-scoped access.
//
// Pattern lifted from Supabase's own Next.js App Router guide; the
// only atWork-specific piece is the env var names, which match the
// existing ./server.ts convention.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function supabaseRoute() {
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll called from a Server Component. Middleware refreshes
          // the session cookie separately so ignoring the failure here
          // is safe (Supabase's own guide documents this pattern).
        }
      },
    },
  });
}

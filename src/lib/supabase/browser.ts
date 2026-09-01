'use client';

// Browser Supabase client using @supabase/ssr's cookie-backed session
// storage. Cloned pattern from BFT's src/auth/supabase.ts, adapted
// for Next.js App Router (Supabase-SSR reads cookies so the server
// components + middleware see the same session as the client).
//
// Trust the SSR defaults — autoRefreshToken + persistSession true,
// storage is cookies (not localStorage). BFT's cookie-vs-storage
// history (docs/login-and-mfa.md §9) doesn't apply here because
// Next.js middleware needs cookies to gate server-rendered routes;
// cookies are the right primitive for App Router.

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton so React re-renders don't create new clients.
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!_client) _client = createBrowserClient(url, key);
  return _client;
}

/**
 * whoami client — cloned from BFT's src/auth/whoami.ts (2026-08-31).
 *
 * Calls /api/whoami to obtain the authoritative role from the server-
 * side session. Used by AuthProvider so the client UI gates on a
 * server-verified claim rather than a client-decoded JWT (which is
 * spoofable in DevTools).
 *
 * Returns null on any non-2xx or network error — callers fail closed
 * (treat as unauthenticated) rather than fabricate a claim shape.
 *
 * Kept as a fetch call rather than reading the session directly on
 * the client because BFT's history shows any client-derived role is
 * a security regression: the server's app_metadata.role is the only
 * value the server backend will honour anyway.
 */

import type { UserRole } from './types';

export interface Whoami {
  userId: string;
  email:  string | null;
  role:   UserRole;
}

interface WhoamiResponse {
  success: boolean;
  data?:   Whoami;
  error?:  string;
  code?:   string;
}

// 5s per attempt (BFT convention, docs/login-and-mfa.md §9). Combined
// with AuthProvider's retry chain this bounds worst-case resolve
// time; a stalled network can't hold 'resolving' open indefinitely.
const WHOAMI_TIMEOUT_MS = 5_000;

export async function fetchWhoami(): Promise<Whoami | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHOAMI_TIMEOUT_MS);
  try {
    const res = await fetch('/api/whoami', {
      method: 'GET',
      // No Bearer header — Next.js route handler reads the session
      // from the cookie set by @supabase/ssr, so credentials must be
      // 'include' rather than 'omit' (this is the divergence from
      // BFT's Vite implementation which used a Bearer header).
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as WhoamiResponse;
    if (!body?.success || !body.data) return null;
    return body.data;
  } catch {
    // Includes AbortError (timeout) + genuine network failures.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

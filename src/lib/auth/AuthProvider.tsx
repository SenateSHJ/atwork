'use client';

/**
 * AuthProvider — cloned from BFT's src/auth/AuthProvider.tsx (2026-08-31).
 *
 * Preserves the three-state machine from BFT's 2026-08-11 refactor
 * ('resolving' | 'authenticated' | 'unauthenticated'). Guards inspect
 * state, not user, so a slow whoami never resolves as unauthenticated
 * mid-flight — that was BFT's login-loop root cause.
 *
 * Preserves BFT's server-verified role principle: role comes from
 * /api/whoami (server reads app_metadata) rather than a client-side
 * JWT decode. Any client decode is spoofable in DevTools.
 *
 * Skipped from BFT's version (deliberately, for atWork scope):
 *   - ViewSwitcher: BFT is multi-tenant; atWork is single-tenant.
 *   - React Query cache clear on signOut: atWork doesn't use RQ.
 *   - Dev bypass block: Scott can use magic-link locally.
 *   - MFA gating: atWork is single-user; layer MFA in when there's
 *     more than one user, following BFT's pattern
 *     (docs/auth/AUTH-INVARIANTS.md live-AAL rule).
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { fetchWhoami } from './whoami';
import type { AuthUser } from './types';

export type AuthState = 'resolving' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  state:   AuthState;
  user:    AuthUser | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Retry policy for whoami — BFT convention, total ≤ 6s. A session-
// present + whoami transiently failing must not resolve to
// 'unauthenticated' on the first blip.
const WHOAMI_RETRY_DELAYS_MS = [0, 500, 1500, 4000];

async function resolveUserWithRetry(session: Session): Promise<AuthUser | null> {
  for (let i = 0; i < WHOAMI_RETRY_DELAYS_MS.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, WHOAMI_RETRY_DELAYS_MS[i]));
    const whoami = await fetchWhoami();
    if (whoami) {
      return {
        id:    session.user.id,
        email: whoami.email ?? session.user.email ?? '',
        role:  whoami.role,
      };
    }
    console.warn(`[AuthProvider] whoami attempt ${i+1}/${WHOAMI_RETRY_DELAYS_MS.length} failed`);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('resolving');
  const [user, setUser]   = useState<AuthUser | null>(null);

  // Monotonic sequence: prevents a stale session's late-arriving
  // whoami from overwriting a newer session's state.
  const resolveSeqRef = useRef(0);

  const resolveSession = useCallback(async (s: Session | null) => {
    const seq = ++resolveSeqRef.current;
    if (!s) {
      setUser(null);
      setState('unauthenticated');
      return;
    }
    setState(prev => (prev === 'authenticated' ? prev : 'resolving'));
    const u = await resolveUserWithRetry(s);
    if (seq !== resolveSeqRef.current) return;
    if (u) {
      setUser(u);
      setState('authenticated');
    } else {
      setUser(null);
      setState('unauthenticated');
    }
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    let subscription: { unsubscribe: () => void } | null = null;

    const boot = async () => {
      const { data: { session } } = await sb.auth.getSession();
      await resolveSession(session);

      const { data } = sb.auth.onAuthStateChange((_event, s) => {
        void resolveSession(s);
      });
      subscription = data.subscription;
    };
    void boot();

    return () => subscription?.unsubscribe();
  }, [resolveSession]);

  const signOut = useCallback(async () => {
    try {
      await supabaseBrowser().auth.signOut();
    } catch (e) {
      console.warn('[AuthProvider] signOut server-side call failed; client session cleared anyway:', e);
    }
  }, []);

  const value = useMemo(() => ({ state, user, signOut }), [state, user, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

'use client';

/**
 * RouteGuard — cloned from BFT's src/auth/RouteGuard.tsx (2026-08-31).
 *
 * atWork's edge-level gating is done in Next.js middleware.ts. This
 * component is the CLIENT-SIDE guard for components that need to
 * inspect auth state directly (e.g. showing a loading skeleton
 * during 'resolving' rather than a bare shell).
 *
 * BFT's version also read AAL live at guard time for MFA. Skipped
 * here — atWork isn't gated on MFA yet. When MFA lands, layer the
 * live-AAL read back in per BFT's discipline (docs/auth/AUTH-
 * INVARIANTS.md); do NOT cache AAL in React state.
 */

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import type { UserRole } from './types';

interface RouteGuardProps {
  children?:     ReactNode;
  allowedRoles?: UserRole[];
}

export function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const { state, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state === 'unauthenticated') {
      const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
      return;
    }
    if (state === 'authenticated' && allowedRoles && !allowedRoles.includes(user!.role)) {
      router.replace('/unauthorized');
    }
  }, [state, user, allowedRoles, router, pathname]);

  if (state === 'resolving') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', fontSize: 14, color: '#5A6E75' }}>
        Loading…
      </div>
    );
  }
  if (state === 'unauthenticated') return null;                // effect will redirect
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return null;   // effect will redirect
  return <>{children}</>;
}

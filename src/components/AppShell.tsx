'use client';

/**
 * AppShell — decides whether to render the sidebar + main-content
 * wrapper based on the current pathname. Login, callback, and
 * unauthorized pages skip the shell so they render full-viewport
 * (their designs already own the whole screen). Everything else gets
 * the sidebar + margin-left main container.
 *
 * Kept as a client component so usePathname works. The root layout
 * stays a server component; AppShell wraps children inside it.
 */

import { usePathname } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { colors, typography } from '@/tokens';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import type { ReactNode } from 'react';

const NO_SHELL_PATHS = new Set(['/login', '/unauthorized']);

function shellHidden(pathname: string | null): boolean {
  if (!pathname) return false;
  if (NO_SHELL_PATHS.has(pathname)) return true;
  // /auth/callback is a route handler that always redirects; never
  // actually renders a page. Defensive skip in case Next.js ever
  // renders a loading UI for it.
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideShell = shellHidden(pathname);

  if (hideShell) {
    // Public / unauthenticated pages render bare. Still wrapped in
    // AuthProvider so any client component below can read state
    // (e.g. login's post-sent screen might want to check whether
    // a session already arrived and redirect).
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <AuthProvider>
      <div
        className="app-shell"
        style={{
          display: 'flex',
          minHeight: '100vh',
          fontFamily: typography.fontFamily.sans,
        }}
      >
        <Nav />
        <main
          className="app-main"
          style={{
            marginLeft: '280px',
            flex: 1,
            minHeight: '100vh',
            backgroundColor: colors.background.page,
            overflow: 'auto',
          }}
        >
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}

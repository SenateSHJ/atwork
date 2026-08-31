import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'atWork — Dashboard',
  description: 'Marketing performance dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions like ColorZilla inject
          attributes onto <body> before hydration (cz-shortcut-listen="true"),
          causing a false-positive React hydration mismatch. Suppression is
          scoped to this element only — children still validate normally.
          AppShell is client-side so it can pathname-gate the sidebar vs
          public pages (login / unauthorized), and wrap the tree in
          AuthProvider for client components that read auth state. */}
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

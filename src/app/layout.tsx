import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { colors, typography } from '@/tokens';

export const metadata: Metadata = {
  title: 'atWork — Dashboard',
  description: 'Marketing performance dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}

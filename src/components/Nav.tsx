'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { colors, typography, spacing } from '../tokens';

const SIDEBAR_WIDTH = '280px';
const MOBILE_BREAKPOINT = 900;

type Tier = 'client' | 'internal';

const CLIENT_NAV = [
  { label: 'Meta Ads',        to: '/meta'             },
  { label: 'Google Ads',      to: '/google-ads'       },
  { label: 'Website',         to: '/ga4'              },
  { label: 'Monthly Reports', to: '/monthly-reports'  },
];

const INTERNAL_NAV = [
  { label: 'Overview',         to: '/internal'                  },
  { label: 'Health',           to: '/internal/health'           },
  { label: 'Weld Connections', to: '/internal/weld-connections' },
  { label: 'Data Tables',      to: '/internal/data-tables'      },
];

const TIER_ENTRY: Record<Tier, string> = {
  client:   '/meta',
  internal: '/internal',
};

// Hamburger + close icons — inline SVG so we don't pull another dep.
function HamburgerIcon({ open }: { open: boolean }) {
  const stroke = colors.text.primary;
  const common = { stroke, strokeWidth: 2, strokeLinecap: 'round' as const };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <>
          <line x1="6"  y1="6"  x2="18" y2="18" {...common} />
          <line x1="18" y1="6"  x2="6"  y2="18" {...common} />
        </>
      ) : (
        <>
          <line x1="4" y1="7"  x2="20" y2="7"  {...common} />
          <line x1="4" y1="12" x2="20" y2="12" {...common} />
          <line x1="4" y1="17" x2="20" y2="17" {...common} />
        </>
      )}
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const currentTier: Tier = pathname.startsWith('/internal') ? 'internal' : 'client';
  const nav = currentTier === 'internal' ? INTERNAL_NAV : CLIENT_NAV;

  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Track viewport width so we render the desktop sidebar vs the mobile
  // top-bar+drawer without any CSS-vs-inline-style specificity fights.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Close the drawer any time the route changes (link tap on mobile).
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isMobile]);

  // ─── Desktop sidebar (unchanged from original) ─────────────────────────────
  if (!isMobile) {
    return (
      <aside
        className="app-sidebar"
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: colors.background.panel,
          borderRight: `1px solid ${colors.border.default}`,
          overflowY: 'auto',
        }}
      >
        <TierSwitcher currentTier={currentTier} />
        <Logo />
        <NavLinks nav={nav} pathname={pathname} />
      </aside>
    );
  }

  // ─── Mobile: top bar + slide-in drawer ─────────────────────────────────────
  return (
    <>
      {/* Fixed top bar with logo + hamburger */}
      <header
        className="app-mobile-topbar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${spacing.md}`,
          backgroundColor: colors.background.card,
          borderBottom: `1px solid ${colors.border.default}`,
        }}
      >
        <Link href={TIER_ENTRY[currentTier]} style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/atwork-logo.png"
            alt="atWork"
            style={{ height: 32, width: 'auto', display: 'block' }}
          />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(v => !v)}
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <HamburgerIcon open={drawerOpen} />
        </button>
      </header>

      {/* Backdrop */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: colors.background.overlay,
            zIndex: 45,
          }}
        />
      )}

      {/* Drawer — slides in from the right */}
      <aside
        className="app-mobile-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(320px, 85vw)',
          zIndex: 50,
          backgroundColor: colors.background.card,
          borderLeft: `1px solid ${colors.border.default}`,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-out',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          boxShadow: drawerOpen ? '-8px 0 24px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: `0 ${spacing.sm}`, borderBottom: `1px solid ${colors.border.default}` }}>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            style={{ background: 'transparent', border: 'none', padding: 8, cursor: 'pointer' }}
          >
            <HamburgerIcon open={true} />
          </button>
        </div>
        <TierSwitcher currentTier={currentTier} />
        <NavLinks nav={nav} pathname={pathname} />
      </aside>
    </>
  );
}

// ─── Sub-components (shared between desktop + mobile) ────────────────────────

function TierSwitcher({ currentTier }: { currentTier: Tier }) {
  return (
    <div style={{ padding: spacing.md, borderBottom: `1px solid ${colors.border.default}` }}>
      <div
        style={{
          display: 'flex',
          border: `1px solid ${colors.border.default}`,
          borderRadius: 0,
          overflow: 'hidden',
        }}
      >
        {(['client', 'internal'] as Tier[]).map(tier => {
          const isActive = tier === currentTier;
          return (
            <Link
              key={tier}
              href={TIER_ENTRY[tier]}
              style={{
                flex: 1,
                padding: `${spacing.xs} ${spacing.sm}`,
                fontSize: typography.fontSize.sm,
                fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.medium,
                backgroundColor: isActive ? colors.brand.primary   : colors.background.card,
                color:           isActive ? colors.brand.primaryText : colors.text.primary,
                textDecoration: 'none',
                textAlign: 'center',
                textTransform: 'capitalize',
              }}
            >
              {tier}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div style={{ padding: `${spacing.lg} ${spacing.lg} ${spacing.md}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/atwork-logo.png"
        alt="atWork"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          maxHeight: 60,
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

function NavLinks({ nav, pathname }: { nav: { label: string; to: string }[]; pathname: string }) {
  return (
    <nav style={{ flex: 1, paddingTop: spacing.sm }}>
      {nav.map(item => {
        const isActive = item.to === '/'
          ? pathname === '/'
          : item.to === '/internal'
            ? pathname === '/internal'
            : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            href={item.to}
            style={{
              display: 'block',
              padding: `${spacing.sm} ${spacing.lg}`,
              fontSize: typography.fontSize.sm,
              fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.normal,
              color: isActive ? colors.brand.primary : '#000000',
              backgroundColor: isActive ? colors.brand.primaryFaint : 'transparent',
              textDecoration: 'none',
              borderRight: isActive
                ? `3px solid ${colors.brand.primary}`
                : '3px solid transparent',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

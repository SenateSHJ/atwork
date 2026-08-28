'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, typography, spacing } from '../tokens';

const SIDEBAR_WIDTH = '280px';

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

export function Nav() {
  const pathname = usePathname();
  const currentTier: Tier = pathname.startsWith('/internal') ? 'internal' : 'client';
  const nav = currentTier === 'internal' ? INTERNAL_NAV : CLIENT_NAV;

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
      {/* Tier switcher — mirrors BFT ViewSwitcher placement (top of sidebar,
          under a border-bottom divider). Segmented, no auth. */}
      <div
        style={{
          padding: spacing.md,
          borderBottom: `1px solid ${colors.border.default}`,
        }}
      >
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

      {/* Logo */}
      <div style={{ padding: `${spacing.lg} ${spacing.lg} ${spacing.md}` }}>
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

      {/* Nav */}
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
    </aside>
  );
}

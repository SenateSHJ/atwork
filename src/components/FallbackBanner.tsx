/**
 * FallbackBanner.tsx
 *
 * Skill: stale-data warning shown when the live summary endpoint returns
 * `fallback: true` (Bronze-tier last-synced data, not Gold live data).
 *
 * Dismissal persists for the rest of the browser session via sessionStorage —
 * the dismissal carries across tier navigation but resets on next login.
 *
 * Consumers: HQSummaryPage, AgencySummaryPage, StudioSummaryPage.
 *
 * @param {boolean}    active     - true when the summary response carries `fallback: true`
 * @param {boolean}    dismissed  - true once the user clicked the × this session
 * @param {() => void} onDismiss  - called when the × is clicked
 */
import { colors, spacing, typography } from '../tokens';

interface FallbackBannerProps {
  active:    boolean;
  dismissed: boolean;
  onDismiss: () => void;
}

export const FALLBACK_BANNER_STORAGE_KEY = 'bft-fallback-banner-dismissed';

export function FallbackBanner({ active, dismissed, onDismiss }: FallbackBannerProps) {
  if (!active || dismissed) return null;

  return (
    <div
      style={{
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'space-between',
        backgroundColor: colors.status.warningFaint,
        border:          `1px solid ${colors.status.warning}`,
        borderRadius:    4,
        padding:         `${spacing.sm} ${spacing.md}`,
        marginBottom:    spacing.md,
      }}
    >
      <span style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>
        ⚠ Live data unavailable — showing last-synced figures from Bronze. Data may be up to 48 hours old.
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background:  'none',
          border:      'none',
          cursor:      'pointer',
          fontSize:    typography.fontSize.lg,
          lineHeight:  1,
          color:       colors.text.secondary,
          padding:     `0 ${spacing.xs}`,
          marginLeft:  spacing.md,
          flexShrink:  0,
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Read the persisted dismissal state from sessionStorage.
 * Used as the useState initializer in each summary page.
 */
export function readBannerDismissed(): boolean {
  return typeof sessionStorage !== 'undefined'
    && sessionStorage.getItem(FALLBACK_BANNER_STORAGE_KEY) === 'true';
}

/**
 * Persist the dismissal and update local state.
 * Used as the onClick handler in each summary page.
 */
export function persistBannerDismissed(setDismissed: (v: boolean) => void): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(FALLBACK_BANNER_STORAGE_KEY, 'true');
  }
  setDismissed(true);
}

// Design tokens — cloned from bft-dashboard-new/src/tokens.ts with only the
// brand palette swapped to atWork. Structure, typography scale, spacing scale,
// radii, shadows, breakpoints and z-index are unchanged.

// ─── Colours ─────────────────────────────────────────────────────────────────

export const colors = {
  brand: {
    // atWork accent (orange)
    primary:      '#E8752A',
    primaryDark:  '#C15E1F',
    primaryFaint: '#FBEDD8',
    primaryText:  '#FFFFFF',
  },

  text: {
    primary:   '#013E51',   // atWork ink — headings, body
    secondary: '#5A6E75',   // muted
    disabled:  '#9CA3AF',
    inverse:   '#FFFFFF',
  },

  background: {
    page:    '#F2E8DA',   // atWork sand
    panel:   '#F9FAFB',
    card:    '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.4)',
  },

  border: {
    default: '#DDD5C8',   // atWork sand-derived border
    strong:  '#C4B99E',
    focus:   '#E8752A',   // matches brand.primary
  },

  status: {
    success:      '#10B981',
    successFaint: '#D1FAE5',
    warning:      '#F59E0B',
    warningFaint: '#FEF3C7',
    error:        '#EF4444',
    errorFaint:   '#FEE2E2',
    info:         '#3B82F6',
    infoFaint:    '#DBEAFE',
  },

  table: {
    rowAlt:   '#FAF6EE',   // sand-lightened
    rowHover: '#F2E8DA',
  },

  ui: {
    // Scorecard blue-variant background — atWork ink (deep, high-contrast)
    teal:    '#013E51',
    // Filter button / active state — atWork accent
    tealAlt: '#E8752A',
    // Card borders + chart header bars — kept black for the same weight BFT uses
    black:   '#013E51',
  },

  chart: [
    '#013E51',   // atWork ink   — primary series
    '#E8752A',   // atWork accent — second series
    '#A8D5E2',   // atWork sky   — third series
    '#10B981',   // emerald      — fourth series
    '#F59E0B',   // amber        — fifth series
  ] as const,

  chartDark: [
    '#001F2A',
    '#C15E1F',
    '#7BB4C2',
    '#059669',
    '#D97706',
  ] as const,
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    mono: `ui-monospace, 'Cascadia Code', 'Fira Mono', monospace`,
  },
  fontSize: {
    xs:    '12px',
    sm:    '14px',
    base:  '16px',
    lg:    '18px',
    xl:    '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
  },
  fontWeight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  lineHeight: {
    tight:  1.25,
    normal: 1.5,
    loose:  1.75,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const spacing = {
  '0':   '0px',
  px:    '1px',
  xs:    '4px',
  sm:    '8px',
  md:    '16px',
  lg:    '24px',
  xl:    '32px',
  '2xl': '48px',
  '3xl': '64px',
  '4xl': '96px',
} as const;

// ─── Border radius ────────────────────────────────────────────────────────────

export const borderRadius = {
  none: '0px',
  sm:   '4px',
  md:   '8px',
  lg:   '12px',
  xl:   '16px',
  full: '9999px',
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const shadow = {
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
} as const;

// ─── Breakpoints ─────────────────────────────────────────────────────────────

export const breakpoints = {
  sm:    '640px',
  md:    '768px',
  lg:    '1024px',
  xl:    '1280px',
  '2xl': '1536px',
} as const;

// ─── Z-index ─────────────────────────────────────────────────────────────────

export const zIndex = {
  base:     0,
  raised:   10,
  dropdown: 100,
  sticky:   200,
  modal:    300,
  toast:    400,
} as const;

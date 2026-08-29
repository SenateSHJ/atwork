// Client-safe date helpers only. ATWORK_CONFIG has moved to
// ./client-config.ts (server-only, imports PRISM which pulls node:crypto).
// This file must stay free of PRISM imports so page.tsx (client) can use it.

// Month name — "2026-07" or "2026-07-01" -> "July 2026".
export function atworkMonthLabel(month: string): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[(m || 1) - 1]} ${y || ''}`.trim();
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last  = new Date(y, m,     0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last) };
}

export function priorMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

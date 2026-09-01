'use client';

import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing } from '../../tokens';

// Table date-column format — "21-Jul-2026" for ISO dates, pass-through for
// anything else (totals row uses "Total" as the date value).
function fmtDate(v: unknown): string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? format(parseISO(v), 'd-MMM-yyyy')
    : String(v ?? '');
}

interface DailyRow {
  date:         string;
  leads:        number;
  spend_aud:    number;
  impressions:  number;
  clicks:       number;
  reach:        number;
  cpl_blended:  number | null;
  cpl_meta:     number | null;
  cpl_website:  number | null;
  ctr:          number | null;
  cpc:          number | null;
  cpm:          number | null;
}

// Generic mode column config (opt-in via `columns` prop). Absent columns → legacy
// 12-column DailyRow behavior is preserved byte-for-byte for existing callers.
export interface DSTColumn {
  key:      string;
  label:    string;
  align?:   'left' | 'right';
  numeric?: boolean;
  // Widened to ReactNode so columns can render richer content (iframes, links,
  // badges). String returns still work — React coerces primitives to text nodes.
  render?:  (row: Record<string, unknown>) => React.ReactNode;
}

interface DailySummaryTableProps {
  data:         DailyRow[] | Record<string, unknown>[];
  columns?:     DSTColumn[];
  sortable?:    boolean;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  autoHeight?:  boolean;
  showTotals?:  boolean;
  // Generic mode only: caller-provided pre-computed totals row (rendered
  // through the same `columns` render functions with totals-cell styling).
  totalsRow?:   Record<string, unknown>;
  // Generic mode only: show first N rows with a Show More button (matches
  // the legacy 12-column behavior — same button, same styling).
  paginate?:    number;
}

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semibold,
  color: colors.text.inverse,               // white on teal
  backgroundColor: colors.ui.teal,          // atWork brand teal
  borderBottom: `1px solid ${colors.ui.teal}`,
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  color: colors.text.primary,
  borderBottom: `1px solid ${colors.border.default}`,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const fmt = (v: number | null, prefix = '', decimals = 2) =>
  v == null ? '—' : `${prefix}${v.toFixed(decimals)}`;

const fmtInt = (v: number) => v.toLocaleString();

export function DailySummaryTable({
  data, columns, sortable, initialSort, autoHeight, showTotals = true,
  totalsRow, paginate,
}: DailySummaryTableProps) {
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState(initialSort);

  // Compute sorted rows for generic mode unconditionally so hook order is stable.
  const sortedGenericRows = useMemo(() => {
    if (!columns || !data?.length) return [] as Record<string, unknown>[];
    const rows = data as Record<string, unknown>[];
    if (!sort) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, columns, sort]);

  if (!data || data.length === 0) {
    return <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>No data</div>;
  }

  // ─── Generic column-driven mode (opt-in via `columns` prop) ──────────────
  if (columns) {
    const sorted = sortedGenericRows;
    const visibleGenericRows = paginate && !expanded ? sorted.slice(0, paginate) : sorted;
    const handleHeaderClick = (key: string) => {
      if (!sortable) return;
      setSort(prev => prev && prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' });
    };
    const totalTd: React.CSSProperties = {
      ...td,
      color: '#ffffff',
      fontWeight: typography.fontWeight.bold,
      border: `1px solid ${colors.ui.teal}`,
    };

    // Layout rules for the generic mode:
    //   - headers never wrap (whiteSpace: nowrap on th is inherited from
    //     the base style); columns size to their content
    //   - dimension cells cap at DIM_MAX_WIDTH and ellipsis-truncate long
    //     text; hover shows full value via the title attribute
    //   - the outer wrapper allows horizontal scroll if a table ever grows
    //     wider than its container (dormant on current data)
    // Dimension cells now wrap so long text stays visible instead of being
    // ellipsis-cut. Cap width so a single very long value can't blow out
    // the whole column. verticalAlign top keeps multi-line rows aligned to
    // the header baseline when neighbouring cells are single-line.
    const DIM_MAX_WIDTH = 320;
    const dimCell: React.CSSProperties = {
      maxWidth: DIM_MAX_WIDTH,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      verticalAlign: 'top',
    };

    // Extract full text of a cell for the hover title attribute — used on
    // dimension cells that may ellipsis-truncate.
    const cellContent = (c: DSTColumn, row: Record<string, unknown>): React.ReactNode =>
      c.render ? c.render(row) : String(row[c.key] ?? '');
    // For title tooltips / sort keys we still want a string form.
    const cellText = (c: DSTColumn, row: Record<string, unknown>): string => {
      const val = c.render ? c.render(row) : row[c.key];
      return typeof val === 'string' || typeof val === 'number' ? String(val) : '';
    };

    return (
      <div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columns.map(c => {
                  const isSorted = sort?.key === c.key;
                  const arrow = !sortable ? '' : isSorted ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={c.key}
                      style={{
                        ...th,
                        textAlign: c.align ?? (c.numeric ? 'right' : 'left'),
                        cursor: sortable ? 'pointer' : undefined,
                        userSelect: sortable ? 'none' : undefined,
                        // Header text is white on teal; sort arrow just gets full opacity.
                        opacity: isSorted ? 1 : 0.85,
                      }}
                      onClick={() => handleHeaderClick(c.key)}
                    >
                      {c.label}{arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleGenericRows.map((row, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 1 ? colors.table.rowAlt : 'transparent' }}>
                  {columns.map(c => {
                    const content    = cellContent(c, row);
                    const titleAttr  = cellText(c, row);
                    return (
                      <td
                        key={c.key}
                        title={!c.numeric && titleAttr ? titleAttr : undefined}
                        style={{
                          ...td,
                          ...(c.numeric ? {} : dimCell),
                          textAlign: c.align ?? (c.numeric ? 'right' : 'left'),
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {totalsRow && (
                <tr style={{ backgroundColor: colors.ui.teal, borderTop: `2px solid ${colors.ui.teal}` }}>
                  {columns.map(c => {
                    return (
                      <td
                        key={c.key}
                        style={{
                          ...totalTd,
                          ...(c.numeric ? {} : dimCell),
                          textAlign: c.align ?? (c.numeric ? 'right' : 'left'),
                        }}
                      >
                        {c.render ? c.render(totalsRow) : String(totalsRow[c.key] ?? '')}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {paginate && sorted.length > paginate && (
          <div style={{ textAlign: 'center', marginTop: spacing.sm }}>
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                backgroundColor: colors.ui.teal,
                color: '#ffffff',
                border: 'none',
                borderRadius: 0,
                padding: '8px 20px',
                fontWeight: typography.fontWeight.semibold,
                cursor: 'pointer',
                fontSize: typography.fontSize.sm,
                marginBottom: spacing.sm,
              }}
            >
              {expanded ? 'Show Less' : 'Show More'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Legacy 12-column DailyRow behavior (default, unchanged) ─────────────
  const dRows = data as DailyRow[];
  const totalLeads       = dRows.reduce((sum, r) => sum + r.leads, 0);
  const totalSpend       = dRows.reduce((sum, r) => sum + r.spend_aud, 0);
  const totalImpressions = dRows.reduce((sum, r) => sum + r.impressions, 0);
  const totalClicks      = dRows.reduce((sum, r) => sum + r.clicks, 0);
  const totalReach       = dRows.reduce((sum, r) => sum + r.reach, 0);
  const totalCplBlended  = totalLeads > 0 ? totalSpend / totalLeads : null;
  const totalCtr         = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const totalCpc         = totalClicks > 0 ? totalSpend / totalClicks : null;
  const totalCpm         = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null;

  const visibleRows = autoHeight || expanded ? dRows : dRows.slice(0, 10);

  const totalTd: React.CSSProperties = {
    ...td,
    color: '#ffffff',
    fontWeight: typography.fontWeight.bold,
    border: `1px solid ${colors.ui.teal}`,
  };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'right', width: 40 }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Date</th>
              <th style={th}>Leads</th>
              <th style={th}>Spend (AUD)</th>
              <th style={th}>Impressions</th>
              <th style={th}>Clicks</th>
              <th style={th}>Reach</th>
              <th style={th}>CPL (Blended)</th>
              <th style={th}>CPL (Meta)</th>
              <th style={th}>CPL (Web)</th>
              <th style={th}>CTR</th>
              <th style={th}>CPC</th>
              <th style={th}>CPM</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={row.date} style={{ backgroundColor: i % 2 === 1 ? colors.table.rowAlt : 'transparent' }}>
                <td style={{ ...td, textAlign: 'right', color: colors.text.secondary }}>{i + 1}</td>
                <td style={{ ...td, textAlign: 'left' }}>{fmtDate(row.date)}</td>
                <td style={td}>{fmtInt(row.leads)}</td>
                <td style={td}>${fmtInt(Math.round(row.spend_aud))}</td>
                <td style={td}>{fmtInt(row.impressions)}</td>
                <td style={td}>{fmtInt(row.clicks)}</td>
                <td style={td}>{fmtInt(row.reach)}</td>
                <td style={td}>{fmt(row.cpl_blended, '$')}</td>
                <td style={td}>{fmt(row.cpl_meta, '$')}</td>
                <td style={td}>{fmt(row.cpl_website, '$')}</td>
                <td style={td}>{row.ctr != null ? `${row.ctr.toFixed(2)}%` : '—'}</td>
                <td style={td}>{fmt(row.cpc, '$')}</td>
                <td style={td}>{fmt(row.cpm, '$')}</td>
              </tr>
            ))}
            {showTotals && (
              <tr style={{ backgroundColor: colors.ui.teal, borderTop: `2px solid ${colors.ui.teal}` }}>
                <td style={{ ...totalTd, textAlign: 'right' }}>—</td>
                <td style={{ ...totalTd, textAlign: 'left' }}>Total</td>
                <td style={totalTd}>{fmtInt(totalLeads)}</td>
                <td style={totalTd}>${fmtInt(Math.round(totalSpend))}</td>
                <td style={totalTd}>{fmtInt(totalImpressions)}</td>
                <td style={totalTd}>{fmtInt(totalClicks)}</td>
                <td style={totalTd}>{fmtInt(totalReach)}</td>
                <td style={totalTd}>{fmt(totalCplBlended, '$')}</td>
                <td style={totalTd}>—</td>
                <td style={totalTd}>—</td>
                <td style={totalTd}>{totalCtr != null ? `${totalCtr.toFixed(2)}%` : '—'}</td>
                <td style={totalTd}>{fmt(totalCpc, '$')}</td>
                <td style={totalTd}>{fmt(totalCpm, '$')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!autoHeight && dRows.length > 10 && (
        <div style={{ textAlign: 'center', marginTop: spacing.sm }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              backgroundColor: colors.ui.teal,
              color: '#ffffff',
              border: 'none',
              borderRadius: 0,
              padding: '8px 20px',
              fontWeight: typography.fontWeight.semibold,
              cursor: 'pointer',
              fontSize: typography.fontSize.sm,
              marginBottom: spacing.sm,
            }}
          >
            {expanded ? 'Show Less' : 'Show More'}
          </button>
        </div>
      )}
    </div>
  );
}

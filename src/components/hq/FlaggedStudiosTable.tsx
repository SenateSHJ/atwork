'use client';

import { useState } from 'react';
import { colors, typography, spacing } from '../../tokens';

interface StudioRow {
  studio_name:  string;
  agency_name:  string;
  cpl_blended:  number | null;
  cpl_meta:     number | null;
  cpl_website:  number | null;
}

interface FlaggedStudiosTableProps {
  data:              StudioRow[];
  blendedBenchmark:  number;
  metaBenchmark:     number;
  websiteBenchmark:  number | null;
}

const th: React.CSSProperties = {
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semibold,
  color: colors.text.secondary,
  borderBottom: `1px solid ${colors.border.default}`,
  border: `1px solid ${colors.border.default}`,
  backgroundColor: '#f5f5f5',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  color: colors.text.primary,
  borderBottom: `1px solid ${colors.border.default}`,
  whiteSpace: 'nowrap',
};

export function FlaggedStudiosTable({
  data,
  blendedBenchmark,
  metaBenchmark,
  websiteBenchmark,
}: FlaggedStudiosTableProps) {
  const [expanded, setExpanded] = useState(false);

  const flagged = (Array.isArray(data) ? data : []).filter(s => {
    const blendedBad = s.cpl_blended != null && s.cpl_blended > blendedBenchmark;
    const metaBad    = s.cpl_meta != null && s.cpl_meta > metaBenchmark;
    const websiteBad = websiteBenchmark != null && s.cpl_website != null && s.cpl_website > websiteBenchmark;
    return blendedBad || metaBad || websiteBad;
  });

  if (flagged.length === 0) {
    return (
      <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
        No studios flagged above benchmark.
      </div>
    );
  }

  const visibleRows = expanded ? flagged : flagged.slice(0, 10);

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'right', width: 40 }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Studio</th>
              <th style={{ ...th, textAlign: 'left' }}>Agency</th>
              <th style={{ ...th, textAlign: 'right' }}>CPL Blended</th>
              <th style={{ ...th, textAlign: 'right' }}>CPL Meta</th>
              <th style={{ ...th, textAlign: 'right' }}>CPL Website</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={`${row.studio_name}-${row.agency_name}`} style={{ backgroundColor: i % 2 === 1 ? '#f9f9f9' : '#ffffff' }}>
                <td style={{ ...td, textAlign: 'right', color: colors.text.secondary }}>{i + 1}</td>
                <td style={td}>{row.studio_name}</td>
                <td style={td}>{row.agency_name}</td>
                <td style={{
                  ...td, textAlign: 'right',
                  color: row.cpl_blended != null && row.cpl_blended > blendedBenchmark ? colors.status.error : colors.text.primary,
                }}>
                  {row.cpl_blended != null ? `$${row.cpl_blended.toFixed(2)}` : '—'}
                </td>
                <td style={{
                  ...td, textAlign: 'right',
                  color: row.cpl_meta != null && row.cpl_meta > metaBenchmark ? colors.status.error : colors.text.primary,
                }}>
                  {row.cpl_meta != null ? `$${row.cpl_meta.toFixed(2)}` : '—'}
                </td>
                <td style={{
                  ...td, textAlign: 'right',
                  color: websiteBenchmark != null && row.cpl_website != null && row.cpl_website > websiteBenchmark
                    ? colors.status.error : colors.text.primary,
                }}>
                  {row.cpl_website != null ? `$${row.cpl_website.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {flagged.length > 10 && (
        <div style={{ textAlign: 'center', marginTop: spacing.sm }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              backgroundColor: colors.ui.teal,
              color: '#ffffff',
              border: 'none',
              borderRadius: 4,
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

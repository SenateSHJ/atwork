import { colors, typography, spacing } from '../../tokens';

interface StudioRow {
  studio: string;
  agency: string;
  cpl:    number;
}

interface StudioLeaderboardTableProps {
  title: string;
  data:  StudioRow[];
}

const th: React.CSSProperties = {
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semibold,
  color: colors.text.secondary,
  borderBottom: `1px solid ${colors.border.default}`,
  border: `1px solid ${colors.border.default}`,
  backgroundColor: '#f5f5f5',
};

const td: React.CSSProperties = {
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  color: colors.text.primary,
  borderBottom: `1px solid ${colors.border.default}`,
};

export function StudioLeaderboardTable({ title, data }: StudioLeaderboardTableProps) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `2px solid ${colors.ui.black}`,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {/* Black header bar */}
      <div
        style={{
          backgroundColor: colors.ui.black,
          padding: `${spacing.sm} ${spacing.md}`,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            color: colors.text.inverse,
            fontWeight: typography.fontWeight.semibold,
            fontSize: typography.fontSize.base,
          }}
        >
          {title}
        </span>
      </div>

      {/* Table body */}
      <div style={{ backgroundColor: colors.background.card, overflowX: 'auto' }}>
        {data.length === 0 ? (
          <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm, textAlign: 'center' }}>
            No data available
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'right', width: 40 }}>#</th>
                <th style={{ ...th, textAlign: 'left' }}>Studio Name</th>
                <th style={{ ...th, textAlign: 'left' }}>Agency Name</th>
                <th style={{ ...th, textAlign: 'right' }}>CPL (Blended)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={`${row.studio}-${row.agency}`}
                  style={{ backgroundColor: i % 2 === 1 ? '#f9f9f9' : '#ffffff' }}
                >
                  <td style={{ ...td, textAlign: 'right', color: colors.text.secondary }}>{i + 1}</td>
                  <td style={td}>{row.studio}</td>
                  <td style={td}>{row.agency}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(row.cpl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

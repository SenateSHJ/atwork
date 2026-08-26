import { colors, typography, spacing } from '../../tokens';

interface AgencyRow {
  agency_name:  string;
  studio_count: number;
}

interface StudiosPerAgencyTableProps {
  data: AgencyRow[];
}

const thBase: React.CSSProperties = {
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.bold,
  color: colors.text.primary,
  backgroundColor: '#f5f5f5',
  border: `1px solid ${colors.border.default}`,
};

const tdBase: React.CSSProperties = {
  padding: `10px ${spacing.sm}`,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.medium,
  border: `1px solid ${colors.border.default}`,
};

export function StudiosPerAgencyTable({ data }: StudiosPerAgencyTableProps) {
  if (!data || data.length === 0) {
    return <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>No data</div>;
  }

  const total = data.reduce((sum, r) => sum + r.studio_count, 0);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thBase, textAlign: 'right', width: 40 }}>#</th>
            <th style={{ ...thBase, textAlign: 'center' }}>Agency Name</th>
            <th style={{ ...thBase, textAlign: 'center', width: 140 }}>Count of Studios</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.agency_name}
              style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f9f9f9' }}
            >
              <td style={{ ...tdBase, textAlign: 'right', color: colors.text.secondary }}>{i + 1}</td>
              <td style={{ ...tdBase, textAlign: 'center' }}>{row.agency_name}</td>
              <td style={{ ...tdBase, textAlign: 'center' }}>{row.studio_count.toLocaleString()}</td>
            </tr>
          ))}
          {/* Total row */}
          <tr style={{ backgroundColor: colors.ui.teal, borderTop: `2px solid ${colors.ui.teal}` }}>
            <td style={{ ...tdBase, textAlign: 'right', color: '#ffffff', fontWeight: typography.fontWeight.bold, border: `1px solid ${colors.ui.teal}` }}>
              Total
            </td>
            <td style={{ ...tdBase, textAlign: 'center', color: '#ffffff', fontWeight: typography.fontWeight.bold, border: `1px solid ${colors.ui.teal}` }}>
              Total Studios
            </td>
            <td style={{ ...tdBase, textAlign: 'center', color: '#ffffff', fontWeight: typography.fontWeight.bold, border: `1px solid ${colors.ui.teal}` }}>
              {total.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

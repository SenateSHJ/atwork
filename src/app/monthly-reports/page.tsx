'use client';

import { useState, useEffect } from 'react';
import { colors, typography, spacing } from '@/tokens';
import { ChartContainer } from '@/components/ChartContainer';
import {
  fetchMonthlyReport, getDefaultMonth, getAvailableMonths,
  type MonthlyReport, type SectionReport,
} from './actions';
import { atworkMonthLabel } from './adapters/config';

export default function MonthlyReportsPage() {
  const [month, setMonth]                     = useState<string | null>(null);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [report, setReport]                   = useState<MonthlyReport | null>(null);
  const [loading, setLoading]                 = useState(false);

  useEffect(() => {
    (async () => {
      const [def, opts] = await Promise.all([getDefaultMonth(), getAvailableMonths()]);
      setAvailableMonths(opts);
      setMonth(def);
    })();
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    fetchMonthlyReport(month)
      .then(setReport)
      .catch(e => { console.error(e); setReport(null); })
      .finally(() => setLoading(false));
  }, [month]);

  if (!month) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.xl} ${spacing.lg}`, textAlign: 'center', color: colors.text.secondary }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.md} ${spacing.lg}` }}>

      <h1 style={{
        textAlign: 'center',
        fontWeight: typography.fontWeight.bold,
        fontSize: typography.fontSize['3xl'],
        color: colors.text.primary,
        marginBottom: spacing.sm,
      }}>
        Monthly Report — {atworkMonthLabel(month)}
      </h1>
      {report && (
        <p style={{ textAlign: 'center', color: colors.text.secondary, fontSize: typography.fontSize.sm, marginBottom: spacing.lg }}>
          vs. {report.priorLabel}
        </p>
      )}

      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: spacing.sm, marginBottom: spacing.lg,
      }}>
        <label style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Month:</label>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          disabled={loading}
          style={{
            height: '36.5px',
            padding: '0 12px',
            border: `1px solid ${colors.border.default}`,
            borderRadius: 0,
            fontSize: typography.fontSize.sm,
            backgroundColor: colors.background.card,
            color: colors.text.primary,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {availableMonths.map(m => (
            <option key={m} value={m}>{atworkMonthLabel(m)}</option>
          ))}
        </select>
        {loading && <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>Loading…</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <ReportSection title="Meta Ads"   section={report?.meta}    loading={loading} />
        <ReportSection title="Google Ads" section={report?.gads}    loading={loading} />
        <ReportSection title="Website"    section={report?.website} loading={loading} />
      </div>
    </div>
  );
}

function ReportSection({ title, section, loading }: { title: string; section: SectionReport | undefined; loading: boolean }) {
  return (
    <ChartContainer title={title}>
      {loading || !section ? (
        <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
          Loading summary…
        </div>
      ) : (
        <div style={{
          padding: `${spacing.sm} ${spacing.md}`,
          color: colors.text.primary,
          fontSize: typography.fontSize.base,
          lineHeight: 1.6,
        }}>
          {section.basisSubtitle && (
            <p style={{
              margin: `0 0 ${spacing.sm}`,
              color: colors.text.secondary,
              fontSize: typography.fontSize.sm,
              fontStyle: 'italic',
            }}>
              {section.basisSubtitle}
            </p>
          )}
          {section.paragraphs.map((p, i) => (
            <p key={i} style={{ margin: `0 0 ${spacing.md}`, textAlign: 'justify' }}>{p}</p>
          ))}
        </div>
      )}
    </ChartContainer>
  );
}

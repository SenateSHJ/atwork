'use client';

import { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip as RTooltip } from 'recharts';
import { colors, typography, spacing, shadow } from '@/tokens';
import { ChartContainer } from '@/components/ChartContainer';
import {
  fetchMonthlyReport, getDefaultMonth, getAvailableMonths,
  type MonthlyReport, type SectionReport,
  type ChipTile, type ScorecardTile, type TrendPoint, type DriverRow,
  type ParagraphItem, type RecommendationRow, type FlagRow, type EvidenceSummary,
  type Direction,
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
      // Allow ?month=YYYY-MM to override the default (last complete month).
      // Useful for shareable links to a specific report and for headless
      // dumps of a chosen month without programmatic dropdown interaction.
      const urlMonth = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('month')
        : null;
      // Well-formedness check on the URL param; dropdown-membership check
      // deliberately NOT applied so the caller can request the current
      // (in-progress) month, which is absent from getAvailableMonths().
      const initial = urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : def;
      setMonth(initial);
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
        <ReportSection title="Meta Ads"   section={report?.meta}     loading={loading} />
        <ReportSection title="Google Ads" section={report?.gads}     loading={loading} />
        <ReportSection title="LinkedIn"   section={report?.linkedin} loading={loading} />
        <ReportSection title="Website"    section={report?.website}  loading={loading} />
      </div>
    </div>
  );
}

// ─── Section shell ────────────────────────────────────────────────────

function ReportSection({ title, section, loading }: { title: string; section: SectionReport | undefined; loading: boolean }) {
  return (
    <ChartContainer title={title}>
      {loading || !section ? (
        <div style={{ padding: spacing.md, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
          Loading summary…
        </div>
      ) : (
        <SectionBody section={section} />
      )}
    </ChartContainer>
  );
}

function SectionBody({ section }: { section: SectionReport }) {
  // ADR 0043 shell decision: state.kind governs which layout renders.
  // suppressed = minimal shell (banner + surviving anchor paragraph only)
  // partial    = banner + surviving prose + flags (skip verdict/chips/scorecard)
  // normal     = full layout
  if (section.state.kind === 'suppressed') {
    return <SuppressedShell section={section} />;
  }
  if (section.state.kind === 'partial') {
    return <PartialShell section={section} />;
  }
  return <NormalShell section={section} />;
}

// ─── Normal shell (state === 'normal') ────────────────────────────────

function NormalShell({ section }: { section: SectionReport }) {
  return (
    <div style={{ padding: `${spacing.sm} ${spacing.md}`, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      <BasisSubtitle text={section.basisSubtitle} />
      {section.verdict && <VerdictBlock text={section.verdict} />}
      {section.chips.length > 0 && <ChipRow chips={section.chips} />}
      {section.scorecard.length > 0 && <ScorecardGrid tiles={section.scorecard} />}
      {/* Flags land ABOVE narrative so caveats are read before the numbers they qualify. */}
      {section.flags.length > 0 && <FlagBand flags={section.flags} />}
      {section.paragraphs.length > 0 && <ParagraphList paragraphs={section.paragraphs} flags={section.flags} />}
      {section.recommendations.length > 0 && <RecommendationList recs={section.recommendations} />}
      {(section.trends.volume.length > 0 || section.trends.outcome.length > 0) && <TrendsBlock trends={section.trends} />}
      {section.decomposition.length > 0 && <DecompositionBlock rows={section.decomposition} />}
      <EvidenceDisclosure evidence={section.evidence} />
    </div>
  );
}

// ─── Partial shell (state === 'partial') ──────────────────────────────

function PartialShell({ section }: { section: SectionReport }) {
  return (
    <div style={{ padding: `${spacing.sm} ${spacing.md}`, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      <BasisSubtitle text={section.basisSubtitle} />
      <SuppressionBanner state={section.state} />
      {/* On partial, verdict/chips/scorecard/trends/decomposition are skipped
          because the inputs feeding them may themselves be suppressed. Flags
          and surviving prose remain — they carry the "why this is degraded"
          signal the reader needs. */}
      {section.flags.length > 0 && <FlagBand flags={section.flags} />}
      {section.paragraphs.length > 0 && <ParagraphList paragraphs={section.paragraphs} flags={section.flags} />}
      <EvidenceDisclosure evidence={section.evidence} />
    </div>
  );
}

// ─── Suppressed shell (state === 'suppressed') ────────────────────────

function SuppressedShell({ section }: { section: SectionReport }) {
  // Per ADR 0043 the anchor paragraph survives suppression. Show it if
  // present, and nothing else — the banner tells the reader why.
  const anchor = section.paragraphs.find(p => p.slot === 'anchor');
  return (
    <div style={{ padding: `${spacing.sm} ${spacing.md}`, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      <BasisSubtitle text={section.basisSubtitle} />
      <SuppressionBanner state={section.state} />
      {anchor && (
        <p style={{ margin: 0, color: colors.text.primary, fontSize: typography.fontSize.base, lineHeight: 1.6 }}>
          {anchor.text}
        </p>
      )}
    </div>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────

function BasisSubtitle({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p style={{
      margin: 0,
      color: colors.text.secondary,
      fontSize: typography.fontSize.sm,
      fontStyle: 'italic',
    }}>{text}</p>
  );
}

function VerdictBlock({ text }: { text: string }) {
  return (
    <div style={{
      padding: `${spacing.md} ${spacing.md}`,
      background: colors.brand.secondary,
      color: colors.text.inverse,
      borderRadius: 0,
      boxShadow: shadow.sm,
    }}>
      <p style={{
        margin: 0,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        lineHeight: 1.4,
      }}>{text}</p>
    </div>
  );
}

function ChipRow({ chips }: { chips: ChipTile[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
      {chips.map((c, i) => (
        <span key={i} style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.xs,
          padding: `${spacing.xs} ${spacing.sm}`,
          background: colors.brand.secondaryFaint,
          border: `1px solid ${colors.border.default}`,
          fontSize: typography.fontSize.xs,
          color: colors.text.primary,
        }}>
          <DirectionMark direction={c.direction} />
          <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
          <span style={{ color: colors.text.secondary, fontVariantNumeric: 'tabular-nums' }}>·{c.materiality}</span>
        </span>
      ))}
    </div>
  );
}

function ScorecardGrid({ tiles }: { tiles: ScorecardTile[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      gap: spacing.sm,
    }}>
      {tiles.map((t, i) => (
        <div key={i} style={{
          padding: spacing.sm,
          border: `1px solid ${colors.border.default}`,
          background: colors.background.card,
          boxShadow: shadow.sm,
        }}>
          <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.label}</div>
          <div style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{t.value}</div>
          {t.deltaPct !== null && (
            <div style={{ fontSize: typography.fontSize.xs, marginTop: 2, color: deltaColor(t.deltaDir) }}>
              <DirectionMark direction={t.deltaDir} /> {formatPct(t.deltaPct)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Flags are load-bearing per Scott: they carry caveats that stop misreading
// numbers above them, so they render above the narrative body and are styled
// prominently. paired_signals list the rule ids whose findings each flag
// qualifies — useful for a reader tracing why a particular sentence carries
// a caveat.
function FlagBand({ flags }: { flags: FlagRow[] }) {
  return (
    <div style={{
      border: `2px solid ${colors.status.warning}`,
      background: colors.status.warningFaint,
      padding: spacing.sm,
    }}>
      <div style={{
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.xs,
      }}>Read with caveat</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {flags.map((f, i) => (
          <li key={i} style={{
            paddingLeft: spacing.sm,
            borderLeft: `3px solid ${colors.status.warning}`,
          }}>
            <p style={{ margin: 0, fontSize: typography.fontSize.sm, color: colors.text.primary }}>{f.situation}</p>
            {f.question && (
              <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.sm, color: colors.text.secondary, fontStyle: 'italic' }}>
                {f.question}
              </p>
            )}
            {f.pairedSignals.length > 0 && (
              <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.xs, color: colors.text.secondary }}>
                Qualifies: {f.pairedSignals.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Paragraphs render as prose paragraphs. Category label appears as a small
// prefix so a reader can see which slot (anchor/composition/attribution/…)
// each paragraph came from without reading a full stylesheet.
//
// The "⚠ see caveat" badge cross-references paragraphs with flags EXACTLY
// via paragraph.emittingRules (PRISM Paragraph.emitting_rules per ADR 0070)
// against flag.pairedSignals (both are rule ids). Prior implementation
// substring-matched slot names, which over-marked when two rules shared a
// slot (Meta's attribution slot carries describeOutcomeDecomposition and
// describeSpendDecomposition paragraphs; a flag paired with only one would
// mis-mark the other). PRISM 380f743 added emitting_rules; the badge match
// is now exact.
function ParagraphList({ paragraphs, flags }: { paragraphs: ParagraphItem[]; flags: FlagRow[] }) {
  const paragraphHasFlag = (p: ParagraphItem) =>
    flags.some(f => f.pairedSignals.some(rule => p.emittingRules.includes(rule)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {paragraphs.map((p, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
            <span style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              color: colors.brand.secondary,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>{p.slot}</span>
            {paragraphHasFlag(p) && (
              <span title="A flag above qualifies this paragraph" style={{
                fontSize: typography.fontSize.xs,
                color: colors.status.warning,
                fontWeight: typography.fontWeight.bold,
              }}>⚠ see caveat</span>
            )}
          </div>
          <p style={{ margin: 0, textAlign: 'justify', color: colors.text.primary, fontSize: typography.fontSize.base, lineHeight: 1.6 }}>
            {p.text}
          </p>
        </div>
      ))}
    </div>
  );
}

function RecommendationList({ recs }: { recs: RecommendationRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      <div style={{
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>Recommended</div>
      {recs.map((r, i) => (
        <div key={i} style={{
          padding: spacing.sm,
          border: `1px solid ${colors.border.default}`,
          background: colors.background.card,
          boxShadow: shadow.sm,
        }}>
          <p style={{ margin: 0, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text.primary }}>
            {r.actionTitle}
          </p>
          <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: 1.5 }}>
            {r.rationale}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrendsBlock({ trends }: { trends: { volume: TrendPoint[]; outcome: TrendPoint[] } }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
      {trends.volume.length > 0 && <MiniTrend title="Spend trend"    points={trends.volume} />}
      {trends.outcome.length > 0 && <MiniTrend title="Outcome trend" points={trends.outcome} />}
    </div>
  );
}

function MiniTrend({ title, points }: { title: string; points: TrendPoint[] }) {
  const data = points.map(p => ({ label: p.label, value: p.value ?? 0 }));
  return (
    <div style={{
      padding: spacing.sm,
      border: `1px solid ${colors.border.default}`,
      background: colors.background.card,
      boxShadow: shadow.sm,
    }}>
      <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ height: 60 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <RTooltip formatter={(v: number) => v.toLocaleString()} labelFormatter={(l: string) => l} />
            <Line type="monotone" dataKey="value" stroke={colors.brand.secondary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DecompositionBlock({ rows }: { rows: DriverRow[] }) {
  const sorted = [...rows].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const maxAbs = Math.max(...sorted.map(r => Math.abs(r.contribution)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.text.primary }}>Decomposition</div>
      {sorted.map((r, i) => {
        const width = (Math.abs(r.contribution) / maxAbs) * 100;
        const label = r.entityName ?? r.driver;
        const positive = r.contribution >= 0;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'center', gap: spacing.sm, fontSize: typography.fontSize.sm }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}{r.role ? <span style={{ color: colors.text.secondary, marginLeft: spacing.xs }}>({r.role})</span> : null}</span>
            <div style={{ height: 12, background: colors.brand.secondaryFaint, position: 'relative' }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: positive ? 0 : `${100 - width}%`,
                width: `${width}%`,
                background: positive ? colors.brand.secondary : colors.status.warning,
              }} />
            </div>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: positive ? colors.text.primary : colors.status.warning }}>
              {positive ? '+' : ''}{Math.round(r.contribution).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Evidence is the audit trail — reachable, not prominent. Rendered as a
// collapsible <details> so the reader can open it to see the numbers behind
// the prose without those numbers competing with the narrative for attention.
function EvidenceDisclosure({ evidence }: { evidence: EvidenceSummary }) {
  const anyContent =
    evidence.topEntities.length > 0 ||
    evidence.dailyPoints > 0 ||
    Object.keys(evidence.references).length > 0;
  if (!anyContent) return null;
  return (
    <details style={{
      border: `1px solid ${colors.border.default}`,
      background: colors.background.card,
      borderRadius: 0,
      padding: `${spacing.xs} ${spacing.sm}`,
    }}>
      <summary style={{
        cursor: 'pointer',
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>Evidence ({evidence.topEntities.length} entities · {evidence.dailyPoints} daily points · {Object.keys(evidence.references).length} references)</summary>
      <div style={{ marginTop: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {evidence.topEntities.length > 0 && (
          <div>
            <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, marginBottom: 4 }}>Top entities</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.xs }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Name</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Spend</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Conv</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>CPA</th>
                </tr>
              </thead>
              <tbody>
                {evidence.topEntities.map((e, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                    <td style={{ padding: '4px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{e.name}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.spend !== null ? '$' + Math.round(e.spend).toLocaleString() : '—'}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.conversions ?? '—'}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.cpa !== null ? '$' + Math.round(e.cpa).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {Object.keys(evidence.references).length > 0 && (
          <div>
            <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, marginBottom: 4 }}>Numeric references</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4, fontSize: typography.fontSize.xs, fontVariantNumeric: 'tabular-nums' }}>
              {Object.entries(evidence.references).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: colors.brand.secondaryFaint }}>
                  <span style={{ color: colors.text.secondary }}>{k}</span>
                  <span style={{ color: colors.text.primary }}>{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function SuppressionBanner({ state }: { state: SectionReport['state'] }) {
  const headline = state.kind === 'suppressed'
    ? 'This section has been suppressed for the selected month.'
    : 'Part of this section has been suppressed for the selected month.';
  return (
    <div style={{
      margin: 0,
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.status.warningFaint,
      border: `2px solid ${colors.status.warning}`,
      fontSize: typography.fontSize.sm,
      color: colors.text.primary,
    }}>
      <p style={{ margin: 0, fontWeight: typography.fontWeight.semibold }}>{headline}</p>
      {state.reasons.length > 0 && (
        <ul style={{ margin: `${spacing.xs} 0 0`, paddingLeft: spacing.md, color: colors.text.secondary }}>
          {state.reasons.map((r, i) => (
            <li key={i} style={{ margin: 0 }}>{r.note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function DirectionMark({ direction }: { direction: Direction }) {
  const glyph = direction === 'up' ? '▲' : direction === 'down' ? '▼' : direction === 'flat' ? '■' : '·';
  const color = direction === 'up' ? colors.status.success : direction === 'down' ? colors.status.error : colors.text.secondary;
  return <span aria-hidden style={{ color, fontSize: '0.85em' }}>{glyph}</span>;
}

function deltaColor(dir: Direction): string {
  return dir === 'up' ? colors.status.success : dir === 'down' ? colors.status.error : colors.text.secondary;
}

function formatPct(fraction: number): string {
  const pct = fraction * 100;
  const abs = Math.abs(pct);
  return (pct >= 0 ? '+' : '−') + (abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)) + '%';
}

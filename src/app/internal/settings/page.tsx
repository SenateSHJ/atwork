// Server component. Reads the current PRISM settings for the atWork client
// via the service role and renders a read-only snapshot. Full interactive
// editing (via PRISM's SettingsPageShell + writeLayout / writeChannel etc.)
// needs a client-side Supabase factory we don't have yet — atWork sits behind
// Vercel SSO, not Supabase user auth, so wiring the write path is deferred.
//
// This page proves the plumbing:
//   - reporting.* schema is reachable
//   - @prism/executive-summaries readSettings hydrates cleanly
//   - the "unseeded" empty state renders correctly until reporting.client is
//     populated for slug 'atwork'.
//
// When editing is added, we'll wrap PRISM's SettingsPageShell in a client
// component that dispatches writes through Next.js server actions with the
// service role client, keeping the service role key server-only.

import { readSettings } from '@prism/executive-summaries/settings';
import { supabaseServer } from '@/lib/supabase/server';
import { colors, typography, spacing, shadow } from '@/tokens';

const CLIENT_SLUG      = 'atwork';
const ENGINE_VERSION   = '0.6.0-alpha';

export default async function SettingsPage() {
  let payload: Awaited<ReturnType<typeof readSettings>> | null = null;
  let error:   string | null = null;
  try {
    payload = await readSettings({
      getSupabase: async () => supabaseServer(),
      clientSlug:  CLIENT_SLUG,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${spacing.md} ${spacing.lg}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border.default}`, paddingBottom: spacing.md, marginBottom: spacing.lg }}>
        <div>
          <h1 style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.semibold, color: colors.text.primary, margin: 0 }}>
            PRISM Settings
          </h1>
          <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, margin: `${spacing.xs} 0 0 0` }}>
            Client: <span style={{ fontFamily: 'monospace' }}>{CLIENT_SLUG}</span>
          </p>
        </div>
        <p style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, margin: 0 }}>
          PRISM engine <span style={{ fontFamily: 'monospace' }}>v{ENGINE_VERSION}</span>
        </p>
      </div>

      {error && (
        <Card>
          <SectionHeading>Error loading settings</SectionHeading>
          <pre style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error}
          </pre>
        </Card>
      )}

      {payload && !payload.seeded && (
        <Card>
          <SectionHeading>Unseeded</SectionHeading>
          <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: 1.5 }}>
            The PRISM <code>reporting.*</code> schema is in place but no client
            row exists for <code>{CLIENT_SLUG}</code> yet. Seed
            <code> reporting.client</code>, <code>reporting.config</code>,
            <code> reporting.config_thresholds</code>, and a{' '}
            <code>reporting.config_channel</code> row per channel to populate
            this page.
          </p>
        </Card>
      )}

      {payload && payload.seeded && (
        <>
          <Card>
            <SectionHeading>Read-only mode</SectionHeading>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: 1.5 }}>
              This page currently reads via the service role and does not offer
              interactive editing. Wiring PRISM&apos;s writeable{' '}
              <code>SettingsPageShell</code> requires a client-side Supabase
              factory — atWork is behind Vercel SSO, not Supabase user auth,
              so writes are deferred to a follow-up (either enable Supabase
              auth or build a server-action facade around PRISM&apos;s{' '}
              <code>writeLayout</code> / <code>writeChannel</code> /
              <code> writeRule</code> / <code>writeRecommendationTone</code>).
            </p>
          </Card>

          {payload.layout && (
            <Card>
              <SectionHeading>Layout</SectionHeading>
              <Kv label="Render flags"           value={String(payload.layout.renderFlags)} />
              <Kv label="Render recommendations" value={String(payload.layout.renderRecommendations)} />
              <Kv label="Render waterfall"       value={String(payload.layout.renderWaterfall)} />
              <Kv label="Render evidence"        value={String(payload.layout.renderEvidence)} />
              <Kv label="Tier order"             value={payload.layout.tierOrder.join(', ')} />
              <Kv label="Readout top N"          value={String(payload.layout.readoutTopN ?? '—')} />
              <Kv label="Readout bottom N"       value={String(payload.layout.readoutBottomN ?? '—')} />
            </Card>
          )}

          {payload.recommendationTone && (
            <Card>
              <SectionHeading>Recommendation tone</SectionHeading>
              <Kv label="Tone"              value={payload.recommendationTone.tone} />
              <Kv label="Show implication"  value={String(payload.recommendationTone.showImplication)} />
              <Kv label="Show action only"  value={String(payload.recommendationTone.showActionOnly)} />
            </Card>
          )}

          <Card>
            <SectionHeading>Channels ({payload.channels.length})</SectionHeading>
            {payload.channels.length === 0 ? (
              <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>No channels configured.</p>
            ) : (
              <table style={{ width: '100%', fontSize: typography.fontSize.sm, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: colors.ui.teal, color: colors.text.inverse }}>
                    <Th>#</Th><Th>Channel</Th><Th>Enabled</Th><Th>Outcome</Th><Th>Family</Th>
                  </tr>
                </thead>
                <tbody>
                  {payload.channels.map(c => (
                    <tr key={c.channelId} style={{ borderTop: `1px solid ${colors.border.default}` }}>
                      <Td>{c.displayOrder}</Td>
                      <Td>{c.channelDisplay} <span style={{ color: colors.text.secondary, fontFamily: 'monospace', fontSize: typography.fontSize.xs }}>({c.channelId})</span></Td>
                      <Td>{c.enabled ? 'yes' : 'no'}</Td>
                      <Td>{c.outcomeModel ?? '—'}</Td>
                      <Td>{c.channelFamily ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <SectionHeading>Rules ({payload.rules.length})</SectionHeading>
            {payload.rules.length === 0 ? (
              <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>No rule overrides — library defaults apply.</p>
            ) : (
              <table style={{ width: '100%', fontSize: typography.fontSize.sm, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: colors.ui.teal, color: colors.text.inverse }}>
                    <Th>Rule</Th><Th>Enabled</Th><Th>Boost</Th><Th>Min materiality</Th>
                  </tr>
                </thead>
                <tbody>
                  {payload.rules.map(r => (
                    <tr key={r.ruleId} style={{ borderTop: `1px solid ${colors.border.default}` }}>
                      <Td><span style={{ fontFamily: 'monospace' }}>{r.ruleId}</span></Td>
                      <Td>{r.enabled ? 'yes' : 'no'}</Td>
                      <Td>{r.materialityBoost}</Td>
                      <Td>{r.minMateriality ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {payload.thresholds && (
            <Card>
              <SectionHeading>Thresholds (read-only, SQL-editable)</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.sm, fontSize: typography.fontSize.sm }}>
                {Object.entries(payload.thresholds).map(([k, v]) => (
                  <div key={k}>
                    <span style={{ color: colors.text.secondary }}>{k}:</span>{' '}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <SectionHeading>Advanced overrides</SectionHeading>
            <Kv label="Wording override rows"        value={String(payload.wordingOverrideCount)} />
            <Kv label="Channel contribution rows"    value={String(payload.channelContributionCount)} />
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Presentational helpers ─────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: colors.background.card,
      border: `1px solid ${colors.border.default}`,
      borderRadius: 0,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      boxShadow: shadow.md,
    }}>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.text.primary,
      margin: `0 0 ${spacing.md} 0`,
    }}>
      {children}
    </h2>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: spacing.sm, fontSize: typography.fontSize.sm, marginBottom: spacing.xs }}>
      <span style={{ minWidth: 220, color: colors.text.secondary }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: `${spacing.sm} ${spacing.md}`, textAlign: 'left', fontWeight: typography.fontWeight.semibold }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: `${spacing.sm} ${spacing.md}` }}>{children}</td>;
}

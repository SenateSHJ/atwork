// Standalone script that runs the same code path as the Monthly Reports page:
// fetches current + prior NormalisedPeriod for each channel, composes prose
// via the reporting library, and prints the result. Used to verify what the
// engine actually emits without booting a browser.

// Node 20 lacks native WebSocket; supabase-js RealtimeClient needs one at
// construct time even though we never subscribe. Polyfill from the `ws`
// package (already a project dep) before any supabase-js import.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- 'ws' has no types installed; runtime-only shim
import ws from 'ws';
(globalThis as unknown as { WebSocket: unknown }).WebSocket = ws;

import { fetchAtWorkMetaPeriod }    from '../src/app/monthly-reports/adapters/meta';
import { fetchAtWorkGadsPeriod }    from '../src/app/monthly-reports/adapters/gads';
import { fetchAtWorkWebsitePeriod } from '../src/app/monthly-reports/adapters/website';
import { ATWORK_CONFIG, atworkMonthLabel, priorMonth } from '../src/app/monthly-reports/adapters/config';
import { compose, SPINE_RULES, type NormalisedPeriod } from '../src/lib/reporting';

async function run(): Promise<void> {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
  const prior = priorMonth(month);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Monthly Report — ${atworkMonthLabel(month)}  (vs ${atworkMonthLabel(prior)})`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const [metaCur, metaPri, gadsCur, gadsPri, webCur, webPri] = await Promise.all([
    fetchAtWorkMetaPeriod(month),    fetchAtWorkMetaPeriod(prior),
    fetchAtWorkGadsPeriod(month),    fetchAtWorkGadsPeriod(prior),
    fetchAtWorkWebsitePeriod(month), fetchAtWorkWebsitePeriod(prior),
  ]);

  render('Meta Ads',   metaCur, metaPri);
  render('Google Ads', gadsCur, gadsPri);
  render('Website',    webCur,  webPri);
}

function render(label: string, current: NormalisedPeriod | null, prior: NormalisedPeriod | null): void {
  console.log('───────────────────────────────────────────────────────────');
  console.log(`  ${label}`);
  console.log('───────────────────────────────────────────────────────────');
  if (!current) {
    console.log(`No ${label} data available for the selected month.\n`);
    return;
  }
  const result = compose(
    {
      current, prior, yoy: null, baseline: null, history: null,
      stats: {
        account_avg_cpa: null, account_avg_conversion_rate: null, account_avg_ctr: null,
        account_total_spend: null, account_total_conversions: null,
      },
      config: ATWORK_CONFIG,
    },
    SPINE_RULES,
    label,
  );
  console.log(`\n${result.basisSubtitle}\n`);
  for (const p of result.paragraphs) {
    console.log(p);
    console.log('');
  }
}

run().catch(err => {
  console.error('generate-monthly-report failed:', err);
  process.exit(1);
});

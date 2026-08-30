/**
 * audit-config-drift.ts — CI-blocking drift audit between the atWork
 * in-code ClientConfig (makeAtWorkConfig) and reporting.* (what
 * loadConfig would return at runtime).
 *
 * Wrapper around @prism/executive-summaries::auditConfigDrift, which
 * does the deep diff. This file provides the atWork-specific factory
 * and Supabase credentials.
 *
 * Runbook: docs/CONFIG-DRIFT-AUDIT.md (upstream in PRISM).
 * Recovery when this fails: re-run scripts/seed-atwork.ts; if the
 * DB carries an intentional operator edit, update the factory to
 * match. Never edit reporting.* by hand to make the audit pass.
 *
 * Run:
 *   node --env-file=.env.local --import tsx scripts/audit-config-drift.ts
 * or via: npm run audit:config-drift
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- 'ws' has no types installed; runtime shim for Supabase's fetch path
import ws from 'ws';
(globalThis as unknown as { WebSocket: unknown }).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import { auditConfigDrift } from '@prism/executive-summaries';
import { makeAtWorkConfig } from '../src/config/atwork';

const CLIENT_SLUG = 'atwork';

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('audit-config-drift: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient(url, key, { auth: { persistSession: false } }) as unknown as any;

  const result = await auditConfigDrift({
    supabase:   sb,
    clientSlug: CLIENT_SLUG,
    config:     makeAtWorkConfig(),
  });

  console.log(result.summary);
  if (!result.ok) {
    for (const d of result.drift) {
      const codeStr = d.code === undefined ? '(missing)' : JSON.stringify(d.code);
      const dbStr   = d.db   === undefined ? '(missing)' : JSON.stringify(d.db);
      console.log(`  ${d.path}`);
      console.log(`    code: ${codeStr.slice(0, 200)}`);
      console.log(`    db:   ${dbStr.slice(0, 200)}`);
    }
    process.exit(1);
  }
}

main().catch(e => {
  console.error('audit-config-drift: failed:', e);
  process.exit(1);
});

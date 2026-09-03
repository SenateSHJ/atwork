#!/usr/bin/env -S node --experimental-strip-types
// Render atWork's monthly report end-to-end for a given month via the
// production code path (fetchMonthlyReport → assembleComparison →
// compose). Prints the paragraph list per section.
//
// Usage: node --env-file=.env.local scripts/render-atwork-monthly.mjs 2026-07

import WebSocket from 'ws'
globalThis.WebSocket = WebSocket

import { fetchMonthlyReport } from '../src/app/monthly-reports/actions.ts'

const month = process.argv[2] || '2026-07'
try {
  const r = await fetchMonthlyReport(month)
  console.log(`=== atWork monthly report — ${r.monthLabel} (compared to ${r.priorLabel}) ===\n`)
  for (const ch of ['meta', 'gads', 'website', 'linkedin', 'semrush']) {
    const s = r[ch]
    console.log(`\n=== ${ch.toUpperCase()} ===`)
    console.log(`  state: ${s.state.kind}, chips: ${s.chips.length}, paragraphs: ${s.paragraphs.length}, recommendations: ${s.recommendations.length}`)
    if (s.verdict) console.log(`  [verdict] ${s.verdict}`)
    for (const p of s.paragraphs) {
      console.log()
      console.log(`  [${p.slot}] ${p.text}`)
      console.log(`    emit: ${p.emittingRules.join(', ')}`)
    }
    for (const rec of s.recommendations) {
      console.log()
      console.log(`  [rec] ${rec.signal}`)
    }
  }
  process.exit(0)
} catch (err) {
  console.error('render failed:', err)
  process.exit(1)
}

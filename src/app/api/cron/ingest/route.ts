// Daily bronze ingest — wired to Vercel Cron via vercel.json.
// Runs the Meta, Google Ads, and GA4 ports sequentially. Each source is
// wrapped in its own try/catch so one failure doesn't kill the others.

import { NextResponse } from 'next/server'
import { runMeta } from '@/lib/ingest/meta'
import { runGads } from '@/lib/ingest/gads'
import { runGa4 } from '@/lib/ingest/ga4'

export const runtime = 'nodejs'
export const maxDuration = 800
export const dynamic = 'force-dynamic'

type SourceResult =
  | {
      ok: true
      upserted: Record<string, number>
      emptyReads: string[]
      totalRows: number
      durationMs: number
    }
  | {
      ok: false
      error: string
      durationMs: number
    }

async function runSource(
  label: string,
  fn: () => Promise<{ upserted: Record<string, number>; emptyReads: string[] }>,
): Promise<SourceResult> {
  const t0 = Date.now()
  try {
    const { upserted, emptyReads } = await fn()
    const totalRows = Object.values(upserted).reduce((a, b) => a + b, 0)
    return {
      ok: true,
      upserted,
      emptyReads,
      totalRows,
      durationMs: Date.now() - t0,
    }
  } catch (e) {
    console.error(`[${label}] failed:`, e)
    return {
      ok: false,
      error: (e as Error)?.message ?? String(e),
      durationMs: Date.now() - t0,
    }
  }
}

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
  // when CRON_SECRET is set in project env vars.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  const meta = await runSource('meta', runMeta)
  const gads = await runSource('gads', runGads)
  const ga4 = await runSource('ga4', runGa4)

  const anyFailure = !meta.ok || !gads.ok || !ga4.ok
  const summary = {
    ok: !anyFailure,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    sources: { meta, gads, ga4 },
  }

  // Return 200 even on partial failure so Vercel Cron doesn't retry
  // aggressively — the JSON body carries the per-source status.
  return NextResponse.json(summary, { status: 200 })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// BigQuery client factory for bronze ingest.
// Ports the `bq(sql, label)` helper from scripts/bronze-*.mjs to use the
// @google-cloud/bigquery SDK instead of shelling out to the `bq` CLI.
// Preserves the tolerance behaviour: "Not found: Table" and
// "Unrecognized name:" errors log a ⚠ line and return [] so the ingest
// continues instead of aborting.

import { BigQuery } from '@google-cloud/bigquery'

export type BqFn = (sql: string, label?: string) => Promise<any[]>

export type BqFactoryResult = {
  bq: BqFn
  emptyReads: string[]
}

/**
 * Build a `bq(sql, label?)` function bound to a fresh BigQuery client.
 *
 * The returned `emptyReads` array is mutated in-place whenever a labelled
 * query returns zero rows, hits a missing table, or references a missing
 * column — matching the tolerance model used by the local .mjs scripts.
 */
export function makeBq(): BqFactoryResult {
  const projectId = process.env.GCP_PROJECT_ID
  const saKey = process.env.GCP_SA_KEY_JSON
  if (!projectId) throw new Error('GCP_PROJECT_ID env var required')
  if (!saKey) throw new Error('GCP_SA_KEY_JSON env var required')

  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(saKey)
  } catch (e) {
    throw new Error(`GCP_SA_KEY_JSON is not valid JSON: ${(e as Error).message}`)
  }

  const client = new BigQuery({ projectId, credentials })
  const emptyReads: string[] = []

  const bq: BqFn = async (sql, label) => {
    let rows: any[]
    try {
      const [result] = await client.query({ query: sql, useLegacySql: false })
      rows = result as any[]
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      if (/Not found: Table/i.test(msg)) {
        console.warn(`  ⚠ ${label ?? 'query'}: source table not in BQ (Weld stream not enabled?)`)
        if (label) emptyReads.push(label)
        return []
      }
      const colMatch = msg.match(/Unrecognized name:\s+(\w+)/i)
      if (colMatch) {
        console.warn(`  ⚠ ${label ?? 'query'}: column "${colMatch[1]}" not in atWork BQ schema (Weld field not populated) — skipping`)
        if (label) emptyReads.push(label)
        return []
      }
      throw e
    }
    if (label && rows.length === 0) {
      console.warn(`  ⚠ ${label}: 0 rows from BQ (Weld sync gap?)`)
      emptyReads.push(label)
    }
    return rows
  }

  return { bq, emptyReads }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase upsert helper for bronze ingest.
// Mirrors the `sb`/`upsert()` pair in scripts/bronze-*.mjs, batched at 500 rows
// with the same "throw on error" contract.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebSocket = require('ws')

export type UpsertFn = (
  table: string,
  rows: any[],
  conflict: string,
) => Promise<number>

export type IngestSupabase = {
  sb: SupabaseClient
  schema: ReturnType<SupabaseClient['schema']>
  upsert: UpsertFn
}

/**
 * Build a Supabase client + `upsert()` bound to the given schema.
 * Defaults to `bronze` — matching every .mjs ingest script.
 */
export function makeSupabase(schemaName: string = 'bronze'): IngestSupabase {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')

  const sb = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as any },
  })
  const schema = sb.schema(schemaName)

  const upsert: UpsertFn = async (table, rows, conflict) => {
    if (!rows.length) return 0
    const BATCH = 500
    let total = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH)
      const { error } = await schema.from(table).upsert(slice, { onConflict: conflict })
      if (error) throw new Error(`Upsert ${schemaName}.${table}: ${error.message}`)
      total += slice.length
    }
    return total
  }

  return { sb, schema, upsert }
}

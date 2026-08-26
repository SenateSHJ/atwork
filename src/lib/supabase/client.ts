'use client'

import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let _client: ReturnType<typeof createClient> | null = null

export function supabaseClient() {
  if (!_client) _client = createClient(url, key)
  return _client
}

import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-only client — uses service role, never exposed to the browser
export function supabaseServer() {
  return createClient(url, key, { auth: { persistSession: false } })
}

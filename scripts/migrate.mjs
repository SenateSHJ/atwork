#!/usr/bin/env node
// Applies supabase/migrations/*.sql in order using the Supabase management API.
// Usage: node scripts/migrate.mjs
// Requires: SUPABASE_PAT env var OR ~/.supabase-pat file, plus project ref from .atwork-domain.

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = join(__dir, '..')

// Load project ref from .atwork-domain
const domain = Object.fromEntries(
  readFileSync(join(root, '.atwork-domain'), 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.trim().split('='))
)
const ref = domain.SUPABASE_PROJECT_REF
if (!ref) throw new Error('SUPABASE_PROJECT_REF not found in .atwork-domain')

// Load PAT
const pat = process.env.SUPABASE_PAT ??
  (() => { try { return readFileSync(join(homedir(), '.supabase-pat'), 'utf8').trim() } catch { return null } })()
if (!pat) throw new Error('No Supabase PAT found. Set SUPABASE_PAT or create ~/.supabase-pat')

const url = `https://api.supabase.com/v1/projects/${ref}/database/query`

async function runSQL(sql) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return JSON.parse(text)
}

// Strip line comments, then split on top-level semicolons.
function splitStatements(sql) {
  // Remove -- line comments entirely so they don't contaminate statement buffers
  const stripped = sql.replace(/--[^\n]*/g, '')
  const stmts = []
  let depth = 0, buf = '', inString = false, stringChar = ''

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    const next = stripped[i + 1]

    if (inString) {
      buf += ch
      if (ch === stringChar && next !== stringChar) inString = false
      else if (ch === stringChar) { buf += next; i++ }
      continue
    }
    if (ch === "'" || ch === '"') { inString = true; stringChar = ch; buf += ch; continue }
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      const stmt = buf.trim()
      if (stmt) stmts.push(stmt)
      buf = ''
    } else {
      buf += ch
    }
  }
  const last = buf.trim()
  if (last) stmts.push(last)
  return stmts.filter(s => s.length > 0)
}

const migrationsDir = join(root, 'supabase', 'migrations')
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()

// Ensure migration history table exists
await runSQL(`
  CREATE TABLE IF NOT EXISTS public._migration_history (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`)

// Load already-applied migrations
const applied = new Set(
  (await runSQL('SELECT filename FROM public._migration_history'))
    .map(r => r.filename)
)

const pending = files.filter(f => !applied.has(f))
console.log(`Applying ${pending.length}/${files.length} migration file(s) to project ${ref}\n`)

for (const file of pending) {
  console.log(`  ▶ ${file}`)
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  const statements = splitStatements(sql)
  let ok = 0
  for (const stmt of statements) {
    try {
      await runSQL(stmt + ';')
      ok++
    } catch (err) {
      const msg = err.message
      if (/already exists|42P07|42710|42P16/i.test(msg)) {
        ok++
      } else {
        console.error(`    ✗ ${msg.slice(0, 300)}`)
        console.error(`      SQL: ${stmt.slice(0, 160)}`)
        process.exit(1)
      }
    }
  }
  // Record as applied
  await runSQL(`INSERT INTO public._migration_history (filename) VALUES ('${file}') ON CONFLICT DO NOTHING;`)
  console.log(`    ✓ ${ok} statements`)
}

console.log('\nMigrations complete.')

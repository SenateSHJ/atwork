#!/usr/bin/env node
/**
 * scripts/preflight.mjs
 *
 * Compares live configuration against .sshj-domain.
 * Run at session start, on pre-push, and in CI.
 *
 * Outcomes
 *   PASS     — everything resolves to atWork/SSHJ, print domain name, proceed
 *   REFUSE   — foreign identifier reachable, exit non-zero, name it
 *   WARN     — a check could not complete (API unreachable, TBD identifier), do not block
 *   TOLERATE — known read-only reference (e.g. BFT source study path), announced every run
 *
 * atWork/SSHJ is a fully-isolated tenant: dedicated GCP project
 * (dashboard-1-sshj-internal), dedicated Supabase project
 * (krbveactwladtwiqrmts), dedicated Weld workspace (senateshj),
 * dedicated Vercel team (senate-shj), dedicated GitHub org (SenateSHJ).
 * BFT is a separate client — read source to study patterns only, no
 * shared credentials, no shared infrastructure.
 *
 * Set PREFLIGHT_ROOT=/path/to/dir to run against a scratch copy for testing.
 * Set PREFLIGHT_OFFLINE=1 to force all network checks to WARN (offline test).
 */

import { readFileSync, existsSync } from 'fs';
import { execSync }    from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = process.env.PREFLIGHT_ROOT
  ? resolve(process.env.PREFLIGHT_ROOT)
  : resolve(__dirname, '..');

const OFFLINE = process.env.PREFLIGHT_OFFLINE === '1';

// ─── colour helpers ───────────────────────────────────────────────
const R = s => `\x1b[31m\x1b[1m${s}\x1b[0m`;
const G = s => `\x1b[32m\x1b[1m${s}\x1b[0m`;
const Y = s => `\x1b[33m${s}\x1b[0m`;
const C = s => `\x1b[36m${s}\x1b[0m`;
const B = s => `\x1b[1m${s}\x1b[0m`;

// ─── result accumulator ───────────────────────────────────────────
const rows     = [];
let anyRefuse  = false;
let anyWarn    = false;

function refuse(check, msg, foreignId) {
  anyRefuse = true;
  rows.push({ outcome: 'REFUSE', check, msg, foreignId });
}
function warn(check, msg) {
  anyWarn = true;
  rows.push({ outcome: 'WARN', check, msg });
}
function tolerate(check, msg) {
  rows.push({ outcome: 'TOLERATE', check, msg });
}
function ok(check, msg) {
  rows.push({ outcome: 'OK', check, msg });
}

// ─── load .sshj-domain ───────────────────────────────────────────
const domainPath = resolve(ROOT, '.sshj-domain');
if (!existsSync(domainPath)) {
  console.error(R('[REFUSE] No .sshj-domain file found — domain not established.'));
  process.exit(1);
}

const domain = Object.fromEntries(
  readFileSync(domainPath, 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const SUPABASE_REF    = domain.SUPABASE_PROJECT_REF;
const SUPABASE_ORG    = domain.SUPABASE_ORG_ID;
const VERCEL_PROJECT  = domain.VERCEL_PROJECT_ID;
const VERCEL_ORG      = domain.VERCEL_ORG_ID;
const GIT_REMOTE      = domain.GIT_REMOTE;
const GCP_PROJECT     = domain.GCP_PROJECT_ID;
const GCP_SA          = domain.GCP_SERVICE_ACCOUNT;
const BQ_DATASETS     = domain.BQ_DATASETS
  ? domain.BQ_DATASETS.split(',').map(s => s.trim())
  : [];

// Treat TBD_... values as "not yet known" — WARN, don't REFUSE
const isTbd = v => !v || v.startsWith('TBD_') || v.startsWith('[');

// ─── TOLERATE: BFT UI source lift (read-only, optional) ──────────
// If the domain declares a BFT source path for study/reference, note it.
// No BFT infrastructure, credentials, or writes cross this boundary.
const BFT_UI_SRC = domain.BFT_UI_SOURCE_READ_ONLY;
if (BFT_UI_SRC) {
  tolerate(
    'bft-ui-source-lift',
    `Read-only source study from ${BFT_UI_SRC} is declared in .sshj-domain. ` +
    `No BFT credentials, no BFT infrastructure — pattern reference only.`
  );
}

// ─── CHECK 1: Supabase CLI linked project ────────────────────────
const linkedRefPath = resolve(ROOT, 'supabase', '.temp', 'project-ref');
if (existsSync(linkedRefPath)) {
  try {
    const linkedRef = readFileSync(linkedRefPath, 'utf8').trim();
    if (linkedRef && linkedRef !== SUPABASE_REF) {
      refuse('supabase-link', `Supabase CLI is linked to a foreign project`, linkedRef);
    } else {
      ok('supabase-link', `CLI linked project matches .sshj-domain ✓`);
    }
  } catch (e) {
    warn('supabase-link', `Could not read CLI link state: ${e.message}`);
  }
} else {
  ok('supabase-link', 'Supabase CLI has no linked project in this directory (correct — supabase link is denied).');
}

// ─── CHECK 2: Supabase project reachable via CLI (network) ───────
if (OFFLINE) {
  warn('supabase-reach', '[OFFLINE MODE] Supabase CLI reachability check skipped — simulating API unreachable.');
} else if (isTbd(SUPABASE_ORG)) {
  warn('supabase-reach', `SUPABASE_ORG_ID is ${SUPABASE_ORG || 'unset'} in .sshj-domain — cannot verify project org. Fill it in when known.`);
} else {
  try {
    const raw      = execSync(`supabase projects list --output json 2>/dev/null`, { cwd: ROOT, timeout: 20_000 }).toString();
    const projects = JSON.parse(raw);
    const found    = projects.find(p => p.ref === SUPABASE_REF);
    if (!found) {
      warn('supabase-reach', `Supabase project (${SUPABASE_REF}) not found via CLI — PAT may not cover this org.`);
    } else if (found.organization_id !== SUPABASE_ORG) {
      refuse('supabase-org', `Project exists but is in org ${found.organization_id}, not ${SUPABASE_ORG}`, found.organization_id);
    } else {
      ok('supabase-reach', `Supabase project (${SUPABASE_REF}) in org ${SUPABASE_ORG} reachable ✓`);
    }
  } catch (e) {
    warn('supabase-reach', `Supabase CLI check failed (API unreachable?): ${e.message.split('\n')[0]}`);
  }
}

// ─── CHECK 3: Git remote ─────────────────────────────────────────
try {
  const remote = execSync('git remote get-url origin 2>/dev/null', { cwd: ROOT, timeout: 5_000 }).toString().trim();
  if (!remote) {
    warn('git-remote', 'No git remote "origin" configured.');
  } else if (remote !== GIT_REMOTE) {
    refuse('git-remote', `git remote "origin" does not match .sshj-domain`, remote);
  } else {
    ok('git-remote', `git remote origin matches .sshj-domain ✓`);
  }
} catch (e) {
  warn('git-remote', `Git remote check failed: ${e.message.split('\n')[0]}`);
}

// ─── CHECK 4: Vercel env vars ────────────────────────────────────
for (const [envVar, expected] of [
  ['VERCEL_PROJECT_ID', VERCEL_PROJECT],
  ['VERCEL_ORG_ID',     VERCEL_ORG],
]) {
  const live = process.env[envVar];
  if (live) {
    if (isTbd(expected)) {
      warn('vercel-env', `${envVar} is set to ${live} but expected value in .sshj-domain is ${expected || 'unset'} — cannot verify.`);
    } else if (live !== expected) {
      refuse('vercel-env', `${envVar} in environment does not match .sshj-domain`, live);
    } else {
      ok('vercel-env', `${envVar} matches .sshj-domain ✓`);
    }
  }
}

// ─── CHECK 5: .vercel/project.json ───────────────────────────────
const vercelJsonPath = resolve(ROOT, '.vercel', 'project.json');
if (existsSync(vercelJsonPath)) {
  try {
    const vp = JSON.parse(readFileSync(vercelJsonPath, 'utf8'));
    let clean = true;
    if (vp.projectId && !isTbd(VERCEL_PROJECT) && vp.projectId !== VERCEL_PROJECT) {
      refuse('vercel-json', `.vercel/project.json projectId does not match .sshj-domain`, vp.projectId);
      clean = false;
    }
    if (vp.orgId && !isTbd(VERCEL_ORG) && vp.orgId !== VERCEL_ORG) {
      refuse('vercel-json', `.vercel/project.json orgId does not match .sshj-domain`, vp.orgId);
      clean = false;
    }
    if (clean) ok('vercel-json', `.vercel/project.json matches .sshj-domain ✓`);
  } catch (e) {
    warn('vercel-json', `.vercel/project.json could not be parsed: ${e.message}`);
  }
} else {
  warn('vercel-json', '.vercel/project.json not present — Vercel link state not verified from file (run `vercel link` when ready).');
}

// ─── CHECK 6: CLOUDSDK_CONFIG points inside this directory ───────
const cloudsdkConfig = process.env.CLOUDSDK_CONFIG;
if (!cloudsdkConfig) {
  warn('gcloud-isolation', 'CLOUDSDK_CONFIG is not set — gcloud state falls back to ~/.config/gcloud (may leak to another tenant).');
} else if (!cloudsdkConfig.startsWith(ROOT)) {
  refuse('gcloud-isolation', `CLOUDSDK_CONFIG points outside this directory`, cloudsdkConfig);
} else {
  ok('gcloud-isolation', `CLOUDSDK_CONFIG is scoped to this directory ✓`);
}

// ─── CHECK 7: GOOGLE_APPLICATION_CREDENTIALS ─────────────────────
const appCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!appCreds || appCreds.trim() === '') {
  ok('gcp-adc', 'GOOGLE_APPLICATION_CREDENTIALS is unset — bq uses isolated gcloud SA ✓');
} else if (!appCreds.startsWith(ROOT)) {
  refuse('gcp-adc', `GOOGLE_APPLICATION_CREDENTIALS points outside this directory`, appCreds);
} else {
  ok('gcp-adc', `GOOGLE_APPLICATION_CREDENTIALS scoped to this directory ✓`);
}

// ─── CHECK 8: gcloud active account in isolated config ───────────
const bqConfigDir = cloudsdkConfig ?? join(ROOT, '.gcloud');
const configDefaultPath = join(bqConfigDir, 'configurations', 'config_default');
let gcloudAccount = null;
if (existsSync(configDefaultPath)) {
  const m = readFileSync(configDefaultPath, 'utf8').match(/^account\s*=\s*(.+)$/m);
  if (m) gcloudAccount = m[1].trim();
}
if (!gcloudAccount) {
  warn('gcloud-account', 'Cannot determine active gcloud account — isolated config_default not found or has no account.');
} else if (isTbd(GCP_SA)) {
  warn('gcloud-account', `GCP_SERVICE_ACCOUNT is ${GCP_SA || 'unset'} in .sshj-domain — cannot verify active account (${gcloudAccount}).`);
} else if (gcloudAccount !== GCP_SA) {
  refuse('gcloud-account', `Isolated gcloud active account does not match .sshj-domain SA`, gcloudAccount);
} else {
  ok('gcloud-account', `Isolated gcloud active account is ${GCP_SA} ✓`);
}

// ─── CHECK 9: bq ls returns exactly the atWork datasets ──────────
if (OFFLINE) {
  warn('bq-ls', '[OFFLINE MODE] bq ls dataset check skipped.');
} else if (BQ_DATASETS.length === 0) {
  warn('bq-ls', 'BQ_DATASETS is unset in .sshj-domain — cannot verify dataset visibility.');
} else {
  const bqEnv = { ...process.env, CLOUDSDK_CONFIG: bqConfigDir };
  try {
    const lsRaw = execSync(
      `bq ls --project_id=${GCP_PROJECT} --format=json 2>/dev/null`,
      { env: bqEnv, timeout: 30_000 }
    ).toString();
    const datasets = JSON.parse(lsRaw).map(d =>
      d.datasetReference?.datasetId ?? d.id ?? ''
    );
    const missing = BQ_DATASETS.filter(d => !datasets.includes(d));
    const atworkSet = new Set(BQ_DATASETS);
    const foreign   = datasets.filter(d => !atworkSet.has(d));
    if (missing.length > 0) {
      refuse('bq-ls', `bq ls cannot see expected datasets declared in .sshj-domain: ${missing.join(', ')}`, missing[0]);
    } else if (foreign.length > 0) {
      // Dedicated GCP project — extras are always in-tenant, not a leak.
      // WARN gives visibility on new datasets showing up without failing preflight.
      warn('bq-ls', `bq ls sees ${foreign.length} additional dataset(s) not declared in .sshj-domain (in-tenant, informational): ${foreign.join(', ')}`);
    } else {
      ok('bq-ls', `bq ls returns exactly ${BQ_DATASETS.length} declared datasets ✓`);
    }
  } catch (e) {
    warn('bq-ls', `bq ls failed (API unreachable or auth error): ${e.message.split('\n')[0]}`);
  }
}

// ─── print results ────────────────────────────────────────────────
console.log('\n━━━ atWork / SSHJ Preflight ━━━━━━━━━━━━━━━━━━━━━━━━');
for (const r of rows) {
  const label = { REFUSE: R('[REFUSE]'), WARN: Y('[WARN]'), TOLERATE: C('[TOLERATE]'), OK: G('[OK]') }[r.outcome];
  console.log(`${label} ${r.check}: ${r.msg}`);
  if (r.foreignId) console.log(`         ${B('Foreign identifier:')} ${r.foreignId}`);
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ─── verdict ─────────────────────────────────────────────────────
if (anyRefuse) {
  console.error(R('PREFLIGHT REFUSED — session must not proceed.'));
  process.exit(1);
} else if (anyWarn) {
  console.log(Y('PREFLIGHT PASSED WITH WARNINGS — non-blocking checks could not complete.'));
  console.log(G('Domain: atWork / SSHJ'));
} else {
  console.log(G('PREFLIGHT PASSED'));
  console.log(G('Domain: atWork / SSHJ'));
}

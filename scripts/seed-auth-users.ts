/**
 * seed-auth-users.ts — populate atWork's auth.users with invited users
 * and their app_metadata.role.
 *
 * Mirrors BFT's invite-only pattern (see BFT `_shared/auth.ts`): the
 * login page uses `signInWithOtp` with `shouldCreateUser: false`, so
 * only pre-provisioned emails receive magic links. This script is the
 * pre-provisioning step.
 *
 * `app_metadata` (not `user_metadata`) because app_metadata is
 * server-controlled and cannot be modified by the user's JWT
 * tampering; it's what the whoami endpoint and RouteGuard read.
 *
 * Run:
 *   node --env-file=.env.local --import tsx scripts/seed-auth-users.ts
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ws from 'ws';
(globalThis as unknown as { WebSocket: unknown }).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';

interface InvitedUser {
  email: string;
  role:  'internal';
}

const USERS: InvitedUser[] = [
  { email: 'scottcamerondudley@gmail.com', role: 'internal' },
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('seed-auth-users: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  for (const u of USERS) {
    // listUsers by email is not directly supported; iterate pages until
    // found. atWork's user set will stay tiny; single page is enough
    // for now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await (sb.auth as any).admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) { console.error(`listUsers failed: ${list.error.message}`); process.exit(1); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = list.data.users.find((x: any) => x.email?.toLowerCase() === u.email.toLowerCase());

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update = await (sb.auth as any).admin.updateUserById(existing.id, {
        app_metadata: { ...existing.app_metadata, role: u.role },
      });
      if (update.error) { console.error(`updateUserById ${u.email} failed: ${update.error.message}`); process.exit(1); }
      console.log(`✓ ${u.email}: updated app_metadata.role='${u.role}' (existing user ${existing.id})`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (sb.auth as any).admin.createUser({
        email: u.email,
        email_confirm: true,   // no confirmation email required; magic-link OTP flow handles verification per sign-in
        app_metadata: { role: u.role },
      });
      if (created.error) { console.error(`createUser ${u.email} failed: ${created.error.message}`); process.exit(1); }
      console.log(`✓ ${u.email}: created with app_metadata.role='${u.role}' (id=${created.data.user!.id})`);
    }
  }

  console.log(`\nseed-auth-users: OK. ${USERS.length} user(s) provisioned.`);
}

main().catch(e => { console.error('seed-auth-users: failed:', e); process.exit(1); });

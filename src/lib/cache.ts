import { unstable_cache } from 'next/cache';

/**
 * Wrap a server-action-shaped function with a per-arg-keyed Next.js
 * unstable_cache. Data updates once daily via the 14:00 UTC ingest cron,
 * so a 1-hour default TTL is safe — the first user of any (startDate,
 * endDate, filters) combination pays the query cost, everyone else within
 * the TTL hits cache.
 *
 * Usage:
 *   const _impl = cached(async (a, b) => { ... }, 'my-key');
 *   export async function myAction(a, b) { return _impl(a, b); }
 */
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string,
  revalidateSeconds = 3600,
) {
  return unstable_cache(fn, [key], { revalidate: revalidateSeconds });
}

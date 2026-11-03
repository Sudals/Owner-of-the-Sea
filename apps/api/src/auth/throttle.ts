import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import { authThrottle } from "../db/schema";

// Design §5-1: N failures within 15 minutes → locked for 15 minutes.
// Per-username uses the design's 5. Per-IP is looser (20) because many players
// can share one IP (PC방, mobile carrier NAT) and 5 typos would lock them all out.

const WINDOW_MIN = 15;
const LOCK_MIN = 15;
export const LIMITS = { login: 5, ip: 20 } as const;

/** Without a known client IP there is no per-IP key — a shared "unknown" key would lock everyone out. */
export const throttleKeys = (username: string, ip: string | null) => ({
  login: `login:${username}`,
  ip: ip ? `ip:${ip}` : null,
});

/** Latest active lock among the keys, or null. */
export async function lockedUntil(keys: string[]): Promise<Date | null> {
  const rows = await db
    .select({ lockedUntil: authThrottle.lockedUntil })
    .from(authThrottle)
    .where(and(inArray(authThrottle.key, keys), gt(authThrottle.lockedUntil, sql`now()`)));
  const times = rows.map((r) => r.lockedUntil!.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/** Counts a failure for `key`; returns the lock time if this failure triggered a lock. */
export async function recordFailure(key: string, limit: number): Promise<Date | null> {
  const stale = sql`${authThrottle.windowStart} < now() - make_interval(mins => ${WINDOW_MIN})`;
  const nextCount = sql`case when ${stale} then 1 else ${authThrottle.failCount} + 1 end`;
  const [row] = await db
    .insert(authThrottle)
    .values({
      key,
      failCount: 1,
      lockedUntil: limit <= 1 ? sql`now() + make_interval(mins => ${LOCK_MIN})` : null,
    })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: {
        failCount: nextCount,
        windowStart: sql`case when ${stale} then now() else ${authThrottle.windowStart} end`,
        lockedUntil: sql`case when ${nextCount} >= ${limit} then now() + make_interval(mins => ${LOCK_MIN}) else ${authThrottle.lockedUntil} end`,
      },
    })
    .returning({ lockedUntil: authThrottle.lockedUntil });
  const until = row?.lockedUntil;
  return until && until.getTime() > Date.now() ? until : null;
}

export async function clearThrottle(key: string): Promise<void> {
  await db.delete(authThrottle).where(eq(authThrottle.key, key));
}

export function retryAfterSec(until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
}

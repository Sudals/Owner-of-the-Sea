import { and, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import { authThrottle } from "../db/schema";

// Design §5-1: N hits within 15 minutes → locked for 15 minutes, per client IP.
//   start   — new names made (stops name squatting by script)
//   recover — wrong 이어하기 코드 entered (80-bit codes can't be guessed anyway; defense in depth)
// Limits are loose because many players can share one IP (PC방, mobile carrier NAT).

const WINDOW_MIN = 15;
const LOCK_MIN = 15;
export const LIMITS = { start: 10, recover: 10 } as const;

/** Without a known client IP there is no key — a shared "unknown" key would lock everyone out. */
export const throttleKey = (kind: keyof typeof LIMITS, ip: string | null) => (ip ? `${kind}:${ip}` : null);

/** Latest active lock among the keys, or null. */
export async function lockedUntil(keys: string[]): Promise<Date | null> {
  const rows = await db
    .select({ lockedUntil: authThrottle.lockedUntil })
    .from(authThrottle)
    .where(and(inArray(authThrottle.key, keys), gt(authThrottle.lockedUntil, sql`now()`)));
  const times = rows.map((r) => r.lockedUntil!.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/** Counts one hit for `key`; returns the lock time if this hit triggered a lock. */
export async function recordHit(key: string, limit: number): Promise<Date | null> {
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

export function retryAfterSec(until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
}

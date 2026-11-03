import { parseTriggerDelivery } from "@neon/functions/triggers";
import { and, isNull, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/pool";
import { authThrottle, sessions } from "../db/schema";
import { internalError } from "../http";

// Function Trigger deliveries (design §8: weekly close + cleanup). Neon POSTs here on the
// cron in neon.ts. No user auth: parseTriggerDelivery checks the x-neon-trigger-invocation-id
// header, which the Functions proxy strips from public requests.
export const triggerRoutes = new Hono();

triggerRoutes.post("/weekly", async (c) => {
  const parsed = await parseTriggerDelivery(c.req.raw);
  if (!parsed.ok) return c.text(parsed.error, parsed.error === "invalid_body" ? 400 : 401);
  try {
    const expiredSessions = await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`)).returning({ id: sessions.id });
    const staleThrottle = await db
      .delete(authThrottle)
      .where(
        and(
          lt(authThrottle.windowStart, sql`now() - interval '1 day'`),
          or(isNull(authThrottle.lockedUntil), lt(authThrottle.lockedUntil, sql`now()`)),
        ),
      )
      .returning({ key: authThrottle.key });
    // TODO(M9): close the season — rank season_scores, write titles, set endless.title ('바다의 주인').
    const result = { invocationId: parsed.invocation.invocationId, expiredSessions: expiredSessions.length, staleThrottle: staleThrottle.length };
    console.log("[triggers/weekly]", JSON.stringify(result));
    return c.json({ ok: true, ...result });
  } catch (e) {
    return internalError("triggers/weekly", e);
  }
});

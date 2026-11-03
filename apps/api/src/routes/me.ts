import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthedEnv } from "../auth/requireAccount";
import { db } from "../db/pool";
import { accounts, endless, players, unlocks } from "../db/schema";
import { apiError, internalError } from "../http";
import { toAccountDto } from "./auth";

// GET /api/me — the whole saved state in one call, right after login (design §11-6).
export const meRoutes = new Hono<AuthedEnv>();

meRoutes.get("/", requireAuth, async (c) => {
  const { accountId } = c.get("session");
  try {
    const [[account], [player], [score], islands] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.id, accountId)),
      db.select().from(players).where(eq(players.accountId, accountId)),
      db.select().from(endless).where(eq(endless.accountId, accountId)),
      db.select({ islandId: unlocks.islandId, unlockedAt: unlocks.unlockedAt }).from(unlocks).where(eq(unlocks.accountId, accountId)),
    ]);
    if (!account || !player || !score) return apiError(404, "not_found", "계정 데이터를 찾을 수 없어요.");
    const { accountId: _p, ...playerState } = player;
    const { accountId: _e, ...endlessState } = score;
    return c.json({ account: toAccountDto(account), player: playerState, endless: endlessState, unlocks: islands });
  } catch (e) {
    return internalError("me", e);
  }
});

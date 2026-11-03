import { openSessionRequest, stormIntensity, TILE, tileAt, type OpenSessionResponse } from "@sea/shared";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthedEnv } from "../auth/requireAccount";
import { db } from "../db/pool";
import { fishSessions } from "../db/schema";
import { apiError, internalError, readJson } from "../http";
import { latestBalance } from "../logic/config";
import { POINT_REACH_PX, resolveSpot } from "../logic/world";

// POST /api/session/open (design §11-3): the server picks the seed; the client plays the casts
// out locally and the save is checked against the same seed. An open session for the same spot
// comes back as-is — same seed, last saved index — so quitting without saving can't reroll (§11-4).

const SESSION_HOURS = 2;

function seedKey(): string {
  const k = process.env.SEED_HMAC_KEY;
  if (!k) throw new Error("SEED_HMAC_KEY is not set");
  return k;
}

export function sessionSig(sessionId: string, seedHex: string, accountId: string): string {
  return createHmac("sha256", seedKey()).update(`${sessionId}|${seedHex}|${accountId}`).digest("hex");
}

export function sigOk(sig: string, sessionId: string, seedHex: string, accountId: string): boolean {
  const want = Buffer.from(sessionSig(sessionId, seedHex, accountId), "hex");
  const got = Buffer.from(/^[0-9a-f]{64}$/.test(sig) ? sig : "", "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export const sessionRoutes = new Hono<AuthedEnv>();

sessionRoutes.post("/open", requireAuth, async (c) => {
  const body = await readJson(c.req.raw, openSessionRequest);
  if (body instanceof Response) return body;
  const { accountId } = c.get("session");
  const spot = resolveSpot(body.spotId);
  if (!spot) return apiError(400, "bad_spot", "없는 낚시 포인트예요.");

  let conds = { deep: false, storm: false };
  if (spot.kind === "sea") {
    if (!body.at) return apiError(400, "bad_spot", "배 위치가 필요해요.");
    const [cx, cy] = spot.center!;
    if (Math.hypot(body.at.x - cx, body.at.y - cy) > POINT_REACH_PX) return apiError(400, "bad_spot", "포인트에서 너무 멀어요.");
    const tx = Math.floor(body.at.x / TILE), ty = Math.floor(body.at.y / TILE);
    conds = { deep: tileAt(tx, ty)?.deep ?? false, storm: stormIntensity(body.at.x / TILE, body.at.y / TILE, body.clockH ?? 0) > 0.2 };
  }

  try {
    const [open] = await db
      .select()
      .from(fishSessions)
      .where(and(eq(fishSessions.accountId, accountId), eq(fishSessions.spotId, spot.spotId), isNull(fishSessions.closedAt), gt(fishSessions.expiresAt, sql`now()`)))
      .orderBy(desc(fishSessions.createdAt))
      .limit(1);
    const row =
      open ??
      (
        await db
          .insert(fishSessions)
          .values({
            accountId,
            spotId: spot.spotId,
            pointId: spot.pointId,
            conds,
            configVersion: (await latestBalance()).version,
            seed: randomBytes(16),
            expiresAt: sql`now() + make_interval(hours => ${SESSION_HOURS})`,
          })
          .returning()
      )[0]!;
    const seed = row.seed.toString("hex");
    const res: OpenSessionResponse = {
      sessionId: row.id,
      seed,
      spotId: row.spotId,
      pointId: row.pointId,
      nextIndex: row.nextIndex,
      omenFrom: null, // omens arrive with 진실 이후 (M8)
      conds: row.conds,
      sig: sessionSig(row.id, seed, accountId),
      resumed: !!open,
      configVersion: row.configVersion,
    };
    return c.json(res);
  } catch (e) {
    return internalError("session/open", e);
  }
});

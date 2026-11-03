import { CAST_MS, FISH_BY_ID, MIN_REEL_MS, POINT_BY_ID, rollCast, saveRequest, type SaveResponse } from "@sea/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthedEnv } from "../auth/requireAccount";
import { db, pgErrorOf } from "../db/pool";
import { commits, dex, fishSessions, notableCatches, players, type CargoItem } from "../db/schema";
import { apiError, internalError, readJson } from "../http";
import { applyReported, holdOf, worldOf } from "../logic/world";
import { sigOk } from "./session";

// POST /api/save (design §11-3): one call carries every cast since the last save, the voyage,
// and the sessions left behind. The server re-rolls each cast from its session seed and keeps
// only what matches; the confirmed state in the reply overwrites the client's (§11-3, §7-4).
// A batchId is applied once — a retried request gets the stored reply back (§11-5).

const CLOCK_SLACK_MS = 1500; // client timestamps jitter
const FUTURE_SLACK_MS = 5 * 60_000;

export const saveRoutes = new Hono<AuthedEnv>();

saveRoutes.post("/", requireAuth, async (c) => {
  const body = await readJson(c.req.raw, saveRequest);
  if (body instanceof Response) return body;
  const { accountId } = c.get("session");

  const stored = async (): Promise<Response | null> => {
    const [prev] = await db.select().from(commits).where(eq(commits.batchId, body.batchId));
    if (!prev) return null;
    if (prev.accountId !== accountId) return apiError(409, "forbidden", "다른 저장과 겹쳤어요.");
    const res = (prev.result as { response?: SaveResponse }).response;
    return res ? c.json({ ...res, duplicate: true }) : apiError(409, "internal", "이전 저장 기록을 읽지 못했어요.");
  };

  try {
    const again = await stored();
    if (again) return again;

    const response = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(players).where(eq(players.accountId, accountId)).for("update");
      if (!p) throw new Error("player row missing");
      const ids = body.sessions.map((s) => s.sessionId);
      const rows = ids.length ? await tx.select().from(fishSessions).where(and(eq(fishSessions.accountId, accountId), inArray(fishSessions.id, ids))) : [];
      const byId = new Map(rows.map((r) => [r.id, r]));

      const now = Date.now();
      const rejected: SaveResponse["rejected"] = [];
      const caught: CargoItem[] = [];
      const sessionsOut: SaveResponse["sessions"] = [];
      let applied = 0;

      for (const s of body.sessions) {
        const row = byId.get(s.sessionId);
        const reject = (i: number, why: string) => rejected.push({ sessionId: s.sessionId, i, why });
        if (!row) {
          s.casts.forEach((k) => reject(k.i, "unknown_session"));
          continue;
        }
        const seed = row.seed.toString("hex");
        if (!sigOk(s.sig, row.id, seed, accountId)) {
          s.casts.forEach((k) => reject(k.i, "bad_sig"));
          continue;
        }
        if (row.closedAt) {
          s.casts.forEach((k) => reject(k.i, "closed"));
          sessionsOut.push({ sessionId: row.id, nextIndex: row.nextIndex, closed: true });
          continue;
        }
        const point = POINT_BY_ID[row.pointId]!;
        let expected = row.nextIndex;
        let prevT: number | null = null;
        const casts = [...s.casts].sort((a, b) => a.i - b.i);
        for (let k = 0; k < casts.length; k++) {
          const cast = casts[k]!;
          if (cast.i < expected) continue; // already saved by an earlier batch
          const stop = (why: string) => casts.slice(k).forEach((x) => reject(x.i, why));
          if (cast.i > expected) {
            stop("gap");
            break;
          }
          const roll = rollCast(seed, cast.i, point, { deep: row.conds.deep, storm: row.conds.storm });
          if (roll.fishId !== cast.fishId || Math.abs(roll.sizeCm - cast.sizeCm) > 0.051) {
            stop("mismatch");
            break;
          }
          if (cast.t > now + FUTURE_SLACK_MS || cast.t < row.createdAt.getTime() - FUTURE_SLACK_MS) {
            stop("clock");
            break;
          }
          if (cast.result === "caught") {
            const minGap = CAST_MS + roll.waitSec * 1000 + cast.reelMs - CLOCK_SLACK_MS;
            if (cast.reelMs < MIN_REEL_MS || (prevT !== null && cast.t - prevT < minGap)) {
              stop("too_fast");
              break;
            }
          } else if (prevT !== null && cast.t - prevT < CAST_MS - 100) {
            stop("too_fast");
            break;
          }
          expected++;
          prevT = cast.t;
          applied++;
          if (cast.result === "caught")
            caught.push({
              id: `${row.id}:${cast.i}`,
              fishId: roll.fishId,
              sizeCm: roll.sizeCm,
              spotId: row.spotId,
              caughtAt: new Date(Math.min(cast.t, now)).toISOString(),
              freshAt: cast.seaT ?? p.seaTime,
            });
        }
        const closed = s.closed && expected === row.nextIndex + casts.filter((x) => x.i >= row.nextIndex).length;
        // a session with rejected casts stays open, so the honest remainder can still be saved
        await tx
          .update(fishSessions)
          .set({ nextIndex: expected, ...(closed ? { closedAt: sql`now()` } : {}) })
          .where(eq(fishSessions.id, row.id));
        sessionsOut.push({ sessionId: row.id, nextIndex: expected, closed });
      }

      // hold: what the client still has (fish lost when towed drop out) + this batch's catches
      const keep = new Set(body.holdIds);
      const have = new Set<string>();
      const cargo: CargoItem[] = [];
      for (const item of [...p.cargo.filter((it) => keep.has(it.id)), ...caught]) {
        if (have.has(item.id)) continue;
        have.add(item.id);
        cargo.push(item);
      }

      const { patch, flags } = applyReported(p, body.world);
      const [updated] = await tx
        .update(players)
        .set({ ...patch, cargo })
        .where(eq(players.accountId, accountId))
        .returning();

      // 도감 + notable catches (rare and up, design §8 용량 절약 원칙)
      for (const f of caught) {
        await tx
          .insert(dex)
          .values({ accountId, fishId: f.fishId, maxSizeCm: f.sizeCm, count: 1 })
          .onConflictDoUpdate({
            target: [dex.accountId, dex.fishId],
            set: { count: sql`${dex.count} + 1`, maxSizeCm: sql`greatest(${dex.maxSizeCm}, ${f.sizeCm})` },
          });
        const rarity = FISH_BY_ID[f.fishId]?.rarity;
        if (rarity === "rare" || rarity === "legendary" || rarity === "boss") {
          const [sessionId, castIndex] = f.id.split(":") as [string, string];
          await tx
            .insert(notableCatches)
            .values({ accountId, sessionId, castIndex: Number(castIndex), fishId: f.fishId, spotId: f.spotId, sizeCm: f.sizeCm, isBoss: rarity === "boss", reason: rarity === "boss" ? "boss" : "rare" })
            .onConflictDoNothing();
        }
      }

      const res: SaveResponse = {
        batchId: body.batchId,
        savedAt: new Date().toISOString(),
        duplicate: false,
        applied: { casts: applied, caught: caught.length },
        rejected,
        world: worldOf(updated!),
        hold: holdOf(updated!.cargo),
        gear: { rodLv: updated!.rodLv, lineLv: updated!.lineLv },
        sessions: sessionsOut,
      };
      const species: Record<string, number> = {};
      for (const f of caught) species[f.fishId] = (species[f.fishId] ?? 0) + 1;
      await tx.insert(commits).values({
        batchId: body.batchId,
        accountId,
        sessionId: body.sessions[0]?.sessionId ?? null,
        fromIndex: null,
        toIndex: null,
        result: { reason: body.reason, casts: applied, caught: caught.length, rejected: rejected.length, species, flags, response: res },
      });
      return res;
    });
    return c.json(response);
  } catch (e) {
    // the same batch raced in twice: the loser returns the winner's stored reply
    if (pgErrorOf(e).code === "23505") {
      const again = await stored().catch(() => null);
      if (again) return again;
    }
    return internalError("save", e);
  }
});

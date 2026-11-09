import {
  applyOp, BARE_HOOK, CAST_MS, FISH_BY_ID, fuelMax, holdCap, HULLS, ITEMS, kstDate, MIN_REEL_MS, normalizeLog, POINT_BY_ID, rollCast, saveRequest, withBalance,
  type Balance, type HullLv, type ItemId, type Ledger, type SaveRequest, type SaveResponse, type ShopOp,
} from "@sea/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthedEnv } from "../auth/requireAccount";
import { db, pgErrorOf, type Tx } from "../db/pool";
import { commits, dex, fishSessions, inventory, notableCatches, players, type CargoItem } from "../db/schema";
import { apiError, internalError, readJson } from "../http";
import { balanceAt, latestBalance } from "../logic/config";
import { applyReported, holdOf, worldOf } from "../logic/world";
import { sigOk } from "./session";

// POST /api/save (design §11-3): one call carries every cast since the last save, the trades, the
// voyage and the sessions left behind. The server replays casts and trades in the order they
// happened (they're timestamped): each cast is re-rolled from its session seed under the balance
// version the session opened with — bait included, which must be on board — and each trade is
// applied with the shared rules (Economy.md §8-1). What doesn't match is dropped; the confirmed
// state in the reply overwrites the client's. A batchId is applied once (§11-5).

const CLOCK_SLACK_MS = 1500; // client timestamps jitter
const FUTURE_SLACK_MS = 5 * 60_000;

type Cast = SaveRequest["sessions"][number]["casts"][number];
type Ctx = {
  sessionId: string;
  row: typeof fishSessions.$inferSelect;
  seed: string;
  balance: Balance;
  expected: number;
  prevT: number | null;
  stopped: string | null;
  sentNew: number;
  closedAsked: boolean;
};
type Event = { t: number; order: number } & ({ kind: "cast"; ctx: Ctx; cast: Cast } | { kind: "op"; index: number });

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
    const cur = await latestBalance();
    const response = await db.transaction((tx) => apply(tx, accountId, body, cur));
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

async function apply(tx: Tx, accountId: string, body: SaveRequest, cur: { version: number; data: Balance }): Promise<SaveResponse> {
  const [p] = await tx.select().from(players).where(eq(players.accountId, accountId)).for("update");
  if (!p) throw new Error("player row missing");
  const ids = body.sessions.map((s) => s.sessionId);
  const rows = ids.length ? await tx.select().from(fishSessions).where(and(eq(fishSessions.accountId, accountId), inArray(fishSessions.id, ids))) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const invRows = await tx.select().from(inventory).where(eq(inventory.accountId, accountId));

  const now = Date.now();
  const rejected: SaveResponse["rejected"] = [];
  const rejectedOps: SaveResponse["rejectedOps"] = [];
  const caught: CargoItem[] = [];
  let applied = 0;

  // ── sessions: who they are and which balance they roll with ──
  const ctxs: Ctx[] = [];
  for (const s of body.sessions) {
    const row = byId.get(s.sessionId);
    const reject = (why: string) => s.casts.forEach((k) => rejected.push({ sessionId: s.sessionId, i: k.i, why }));
    if (!row) {
      reject("unknown_session");
      continue;
    }
    const seed = row.seed.toString("hex");
    if (!sigOk(s.sig, row.id, seed, accountId)) {
      reject("bad_sig");
      continue;
    }
    if (row.closedAt) {
      reject("closed");
      continue;
    }
    ctxs.push({
      sessionId: s.sessionId,
      row,
      seed,
      balance: await balanceAt(row.configVersion),
      expected: row.nextIndex,
      prevT: null,
      stopped: null,
      sentNew: s.casts.filter((k) => k.i >= row.nextIndex).length,
      closedAsked: s.closed,
    });
  }

  // ── the ledger the trades and catches play out on ──
  const { patch, flags } = applyReported(p, body.world);
  // holdIds is the hold *after* this batch: fish sold by its trades are gone from it, yet they were
  // on board when the sale happened — keep them until the sale is replayed below
  const keep = new Set([...body.holdIds, ...body.ops.flatMap((op) => (op.kind === "sell" ? op.ids : []))]);
  const clockEnd = patch.seaTime ?? p.seaTime;
  const ledger: Ledger = {
    gold: p.gold,
    hold: p.cargo.filter((it) => keep.has(it.id)), // fish lost when towed drop out
    inventory: Object.fromEntries(invRows.map((r) => [r.itemId, r.qty])) as Partial<Record<ItemId, number>>,
    rodLv: p.rodLv,
    lineLv: p.lineLv,
    hullLv: p.hullLv as HullLv,
    hullHp: p.hullHp,
    fuel: p.fuel,
    tankLv: p.tankLv,
    iceLv: p.iceLv,
    holdLv: p.holdLv,
    clock: clockEnd,
    date: kstDate(now), // Economy.md §8-1: the server's KST date and clock
    now,
    log: normalizeLog(p.marketLog),
  };

  // ── one timeline: casts and trades in the order they happened ──
  const events: Event[] = [];
  let order = 0;
  for (const ctx of ctxs) {
    const casts = body.sessions.find((s) => s.sessionId === ctx.sessionId)!.casts.slice().sort((a, b) => a.i - b.i);
    for (const cast of casts) events.push({ kind: "cast", ctx, cast, t: cast.t, order: order++ });
  }
  body.ops.forEach((op, index) => events.push({ kind: "op", index, t: op.t, order: order++ }));
  events.sort((a, b) => a.t - b.t || a.order - b.order);

  for (const ev of events) {
    if (ev.kind === "op") {
      const op = body.ops[ev.index]! as ShopOp;
      // freshness at the moment of the trade, kept inside what this batch could have seen
      ledger.clock = Math.max(p.seaTime, Math.min(clockEnd, op.clock ?? clockEnd));
      const r = withBalance(cur.data, () => applyOp(ledger, op));
      if (!r.ok) rejectedOps.push({ index: ev.index, why: r.why });
      continue;
    }
    const { ctx, cast } = ev;
    const reject = (why: string) => rejected.push({ sessionId: ctx.sessionId, i: cast.i, why });
    if (cast.i < ctx.row.nextIndex) continue; // saved by an earlier batch
    if (ctx.stopped) {
      reject(ctx.stopped);
      continue;
    }
    const stop = (why: string) => {
      ctx.stopped = why;
      reject(why);
    };
    if (cast.i > ctx.expected) {
      stop("gap");
      continue;
    }
    const bait = cast.bait ?? "bait_worm";
    // the point's pool and odds come from the session's balance too
    const roll = withBalance(ctx.balance, () => rollCast(ctx.seed, cast.i, POINT_BY_ID[ctx.row.pointId]!, { deep: ctx.row.conds.deep, storm: ctx.row.conds.storm, bait }));
    if (roll.fishId !== cast.fishId || Math.abs(roll.sizeCm - cast.sizeCm) > 0.051) {
      stop("mismatch");
      continue;
    }
    if (cast.t > now + FUTURE_SLACK_MS || cast.t < ctx.row.createdAt.getTime() - FUTURE_SLACK_MS) {
      stop("clock");
      continue;
    }
    if (cast.result === "caught") {
      const minGap = CAST_MS + roll.waitSec * 1000 + cast.reelMs - CLOCK_SLACK_MS;
      if (cast.reelMs < MIN_REEL_MS || (ctx.prevT !== null && cast.t - ctx.prevT < minGap)) {
        stop("too_fast");
        continue;
      }
    } else if (ctx.prevT !== null && cast.t - ctx.prevT < CAST_MS - 100) {
      stop("too_fast");
      continue;
    }
    // the bait was on board, and a bite used it up (Economy.md §4-1: not when reeled in before one)
    if (bait !== BARE_HOOK && cast.bit !== false) {
      if (!ITEMS[bait as ItemId] || (ledger.inventory[bait as ItemId] ?? 0) <= 0) {
        stop("no_bait");
        continue;
      }
      ledger.inventory[bait as ItemId]! -= 1;
    }
    ctx.expected++;
    ctx.prevT = cast.t;
    applied++;
    if (cast.result !== "caught") continue;
    const item: CargoItem = {
      id: `${ctx.row.id}:${cast.i}`,
      fishId: roll.fishId,
      sizeCm: roll.sizeCm,
      spotId: ctx.row.spotId,
      caughtAt: new Date(Math.min(cast.t, now)).toISOString(),
      freshAt: cast.seaT ?? p.seaTime,
      ...(withBalance(ctx.balance, () => ctx.balance.fishing.bait[bait]?.rot) ? { rot: ctx.balance.fishing.bait[bait]!.rot } : {}),
    };
    if (ledger.hold.length >= withBalance(cur.data, () => holdCap(ledger.holdLv))) {
      reject("hold_full");
      continue;
    }
    ledger.hold.push(item);
    caught.push(item);
  }

  // ── sessions advance; closed ones get a fresh seed next time ──
  const sessionsOut: SaveResponse["sessions"] = [];
  for (const ctx of ctxs) {
    const closed = ctx.closedAsked && !ctx.stopped && ctx.expected === ctx.row.nextIndex + ctx.sentNew;
    await tx
      .update(fishSessions)
      .set({ nextIndex: ctx.expected, ...(closed ? { closedAt: sql`now()` } : {}) })
      .where(eq(fishSessions.id, ctx.row.id));
    sessionsOut.push({ sessionId: ctx.sessionId, nextIndex: ctx.expected, closed });
  }

  // fuel and hull only come back by buying them (repairs, towing): never above what the last save
  // had plus what was bought; sailing and bumps since then only take away
  const fuel = Math.max(0, Math.min(patch.fuel ?? ledger.fuel, ledger.fuel, withBalance(cur.data, () => fuelMax(ledger))));
  const hullMax = withBalance(cur.data, () => HULLS[ledger.hullLv].hp);
  const hullHp = Math.max(0, Math.min(patch.hullHp ?? ledger.hullHp, ledger.hullHp, hullMax));

  const [updated] = await tx
    .update(players)
    .set({
      ...patch,
      cargo: ledger.hold as CargoItem[],
      gold: ledger.gold,
      rodLv: ledger.rodLv,
      lineLv: ledger.lineLv,
      hullLv: ledger.hullLv,
      tankLv: ledger.tankLv,
      holdLv: ledger.holdLv,
      iceLv: ledger.iceLv,
      fuel,
      hullHp,
      marketLog: ledger.log,
    })
    .where(eq(players.accountId, accountId))
    .returning();

  // inventory: write the counts that changed
  const before = new Map(invRows.map((r) => [r.itemId, r.qty]));
  for (const [itemId, qty] of Object.entries(ledger.inventory)) {
    if ((before.get(itemId) ?? 0) === qty) continue;
    await tx
      .insert(inventory)
      .values({ accountId, itemId, qty: Math.max(0, qty ?? 0) })
      .onConflictDoUpdate({ target: [inventory.accountId, inventory.itemId], set: { qty: Math.max(0, qty ?? 0) } });
  }

  // 도감 + notable catches (rare and up, design §8 용량 절약 원칙)
  for (const f of caught) {
    if (FISH_BY_ID[f.fishId]?.trash) continue; // 쓰레기 isn't a species
    await tx
      .insert(dex)
      .values({ accountId, fishId: f.fishId, maxSizeCm: f.sizeCm, count: 1 })
      .onConflictDoUpdate({ target: [dex.accountId, dex.fishId], set: { count: sql`${dex.count} + 1`, maxSizeCm: sql`greatest(${dex.maxSizeCm}, ${f.sizeCm})` } });
    const rarity = FISH_BY_ID[f.fishId]?.rarity;
    if (rarity === "rare" || rarity === "legendary" || rarity === "boss") {
      const [sessionId, castIndex] = f.id.split(":") as [string, string];
      await tx
        .insert(notableCatches)
        .values({ accountId, sessionId, castIndex: Number(castIndex), fishId: f.fishId, spotId: f.spotId, sizeCm: f.sizeCm, isBoss: rarity === "boss", reason: rarity === "boss" ? "boss" : "rare" })
        .onConflictDoNothing();
    }
  }

  const dexRows = await tx.select({ fishId: dex.fishId, count: dex.count, maxSizeCm: dex.maxSizeCm }).from(dex).where(eq(dex.accountId, accountId));
  const invAfter = await tx.select({ itemId: inventory.itemId, qty: inventory.qty }).from(inventory).where(eq(inventory.accountId, accountId));
  const res: SaveResponse = {
    batchId: body.batchId,
    savedAt: new Date().toISOString(),
    duplicate: false,
    applied: { casts: applied, caught: caught.length },
    rejected,
    world: worldOf(updated!),
    hold: holdOf(updated!.cargo),
    gear: { rodLv: updated!.rodLv, lineLv: updated!.lineLv },
    gold: updated!.gold,
    dex: dexRows,
    inventory: Object.fromEntries(invAfter.filter((r) => r.qty > 0).map((r) => [r.itemId, r.qty])),
    marketLog: updated!.marketLog,
    configVersion: cur.version,
    rejectedOps,
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
    result: { reason: body.reason, casts: applied, caught: caught.length, rejected: rejected.length, ops: body.ops.length, rejectedOps: rejectedOps.length, gold: updated!.gold - p.gold, species, flags, response: res },
  });
  return res;
}

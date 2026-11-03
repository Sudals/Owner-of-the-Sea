import { z } from "zod";

// Seed sessions and saves — design §11-3. Shared by RemoteBackend and the API routes.

const id = z.string().min(1).max(48);

// ── POST /api/session/open ──

export const openSessionRequest = z.object({
  /** Map point id (p_jade_3) or an island dock (red_lighthouse_dock). */
  spotId: id,
  /** Boat position in world px (sea points): the server checks it is in range and reads the tile. */
  at: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  /** Game hours since day 1 — storms are a function of it. */
  clockH: z.number().finite().min(0).max(1e7).optional(),
});

export const castConds = z.object({ deep: z.boolean(), storm: z.boolean() });

export const openSessionResponse = z.object({
  sessionId: z.string().uuid(),
  seed: z.string(),
  spotId: z.string(),
  /** Species pool + odds the casts roll from. */
  pointId: z.string(),
  nextIndex: z.number().int(),
  omenFrom: z.number().int().nullable(),
  conds: castConds,
  /** HMAC(sessionId|seed|accountId) — sent back with the save. */
  sig: z.string(),
  resumed: z.boolean(),
  /** Balance version this session rolls with (balance.jsonc applied to the DB). */
  configVersion: z.number().int(),
});

export type OpenSessionRequest = z.infer<typeof openSessionRequest>;
export type OpenSessionResponse = z.infer<typeof openSessionResponse>;
export type CastConds = z.infer<typeof castConds>;

// ── POST /api/save ──

export const castRecordSchema = z.object({
  i: z.number().int().min(0).max(1_000_000),
  fishId: id,
  sizeCm: z.number().finite().min(0).max(10_000),
  /** released = caught but let go because the hold was full (nothing is kept). */
  result: z.enum(["caught", "escaped", "released"]),
  reelMs: z.number().int().min(0).max(3_600_000),
  /** Client clock when the cast finished (ms). */
  t: z.number().int(),
  /** WorldState.seaTime at the catch (freshness clock). */
  seaT: z.number().finite().min(0).optional(),
  /** Bait on the hook: an item id or "none" (bare hook). Default 지렁이. Part of the roll. */
  bait: z.string().max(40).optional(),
  /** Did a fish bite? Bait is used up on a bite (Economy.md §4-1), not when reeled in before one. Default true. */
  bit: z.boolean().optional(),
});

export const worldAt = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("island"), id }),
  z.object({ kind: z.literal("sea"), x: z.number().finite(), y: z.number().finite(), heading: z.number().finite() }),
]);

/** What the client reports about the voyage (design §11-6 항해). Gear levels are not in here:
 *  hull level, 연료통, 등불, 얼음 창고 are the server's (bought in shops). */
export const reportedWorld = z.object({
  at: worldAt,
  hullHp: z.number().finite(),
  fuel: z.number().finite(),
  day: z.number().int().min(1).max(100_000),
  hour: z.number().finite().min(0).max(24),
  seaTime: z.number().finite().min(0),
  chart: z.string().max(8000),
});

export const saveRequest = z.object({
  batchId: z.string().uuid(),
  reason: z.enum(["manual", "dock", "exit", "recover", "lobby", "shop"]),
  sessions: z
    .array(
      z.object({
        sessionId: z.string().uuid(),
        sig: z.string().max(128),
        casts: z.array(castRecordSchema).max(1000),
        /** Left the point: the next open gets a fresh seed. */
        closed: z.boolean(),
      }),
    )
    .max(50),
  world: reportedWorld,
  /** Ids of the hold items the client still has. The server keeps only these (fish lost when
   *  towed drop out) and then adds this batch's verified catches. Never adds anything itself. */
  holdIds: z.array(z.string().max(80)).max(2000),
  /** Trades (design §11-2: closing a shop saves), each stamped with the client clock so the server
   *  can replay casts and trades in the order they happened. Same rules as shared applyOp. */
  ops: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("sell"), island: id, ids: z.array(z.string().max(80)).max(200), t: z.number().int() }),
        z.object({ kind: z.literal("buy"), island: id, item: z.string().max(40), t: z.number().int() }),
        z.object({ kind: z.literal("fuel"), island: id, t: z.number().int() }),
        z.object({ kind: z.literal("repair"), island: id, t: z.number().int() }),
        z.object({ kind: z.literal("gift"), island: id, t: z.number().int() }),
        z.object({ kind: z.literal("tow"), island: id, t: z.number().int() }),
      ]),
    )
    .max(200)
    .default([]),
});

export type SaveRequest = z.infer<typeof saveRequest>;
export type ReportedWorld = z.infer<typeof reportedWorld>;

export const holdItemDto = z.object({
  /** `${sessionId}:${castIndex}` */
  id: z.string(),
  fishId: z.string(),
  sizeCm: z.number(),
  spotId: z.string(),
  caughtAt: z.string(),
  freshAt: z.number().optional(),
  rot: z.number().optional(),
  salted: z.number().optional(),
});

export const worldDto = reportedWorld.extend({
  hullLv: z.number().int().min(1).max(4),
  tankLv: z.number().int(),
  holdLv: z.number().int(),
  lantern: z.boolean(),
  iceLv: z.number().int(),
});

export const dexEntryDto = z.object({ fishId: z.string(), count: z.number().int(), maxSizeCm: z.number() });
export type DexEntryDto = z.infer<typeof dexEntryDto>;

export const saveResponse = z.object({
  batchId: z.string(),
  savedAt: z.string(),
  /** True when this batchId had already been applied (a retried request). */
  duplicate: z.boolean(),
  applied: z.object({ casts: z.number().int(), caught: z.number().int() }),
  rejected: z.array(z.object({ sessionId: z.string(), i: z.number().int(), why: z.string() })),
  world: worldDto,
  hold: z.array(holdItemDto),
  gear: z.object({ rodLv: z.number().int(), lineLv: z.number().int() }),
  gold: z.number().int(),
  dex: z.array(dexEntryDto),
  inventory: z.record(z.string(), z.number().int()),
  marketLog: z.object({ demand: z.record(z.string(), z.tuple([z.number(), z.number()])), gift: z.string().optional() }),
  /** Balance version the reply was computed with (shop prices). */
  configVersion: z.number().int(),
  rejectedOps: z.array(z.object({ index: z.number().int(), why: z.string() })),
  sessions: z.array(z.object({ sessionId: z.string(), nextIndex: z.number().int(), closed: z.boolean() })),
});

export type HoldItemDto = z.infer<typeof holdItemDto>;
export type WorldDto = z.infer<typeof worldDto>;
export type SaveResponse = z.infer<typeof saveResponse>;

/** Minimum believable reel fight for a caught fish (design §7-4 최소 릴링 시간). */
export const MIN_REEL_MS = 500;
/** Cast animation before the wait starts (packages/game fishing CAST_TIME). */
export const CAST_MS = 600;

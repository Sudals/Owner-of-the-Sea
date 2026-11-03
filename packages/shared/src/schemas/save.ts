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
});

export type OpenSessionRequest = z.infer<typeof openSessionRequest>;
export type OpenSessionResponse = z.infer<typeof openSessionResponse>;
export type CastConds = z.infer<typeof castConds>;

// ── POST /api/save ──

export const castRecordSchema = z.object({
  i: z.number().int().min(0).max(1_000_000),
  fishId: id,
  sizeCm: z.number().finite().min(0).max(10_000),
  result: z.enum(["caught", "escaped"]),
  reelMs: z.number().int().min(0).max(3_600_000),
  /** Client clock when the cast finished (ms). */
  t: z.number().int(),
  /** WorldState.seaTime at the catch (freshness clock). */
  seaT: z.number().finite().min(0).optional(),
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
  reason: z.enum(["manual", "dock", "exit", "recover", "lobby"]),
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
});

export const worldDto = reportedWorld.extend({
  hullLv: z.number().int().min(1).max(4),
  fuelTank: z.boolean(),
  lantern: z.boolean(),
  iceLv: z.number().int(),
});

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
  sessions: z.array(z.object({ sessionId: z.string(), nextIndex: z.number().int(), closed: z.boolean() })),
});

export type HoldItemDto = z.infer<typeof holdItemDto>;
export type WorldDto = z.infer<typeof worldDto>;
export type SaveResponse = z.infer<typeof saveResponse>;

/** Minimum believable reel fight for a caught fish (design §7-4 최소 릴링 시간). */
export const MIN_REEL_MS = 500;
/** Cast animation before the wait starts (packages/game fishing CAST_TIME). */
export const CAST_MS = 600;

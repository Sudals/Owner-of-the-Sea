import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea, citext } from "./types";

// Design §8. Accounts are our own (no Neon Auth): a name, no password, until Steam (§5).

const createdAt = (name = "created_at") => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const maybeTime = (name: string) => timestamp(name, { withTimezone: true });
const accountRef = (name = "account_id") =>
  uuid(name)
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" });

// ── 계정 ──

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The player's name (design §5) — citext, so "Bob" and "bob" can't both appear on the leaderboard.
  nickname: citext("nickname").notNull().unique(),
  /** HMAC of the 이어하기 코드 (moves the save to another PC). Null only if never issued. */
  recoveryHash: text("recovery_hash").unique(),
  steamId: text("steam_id").unique(),
  banned: boolean("banned").notNull().default(false),
  createdAt: createdAt(),
  lastLoginAt: maybeTime("last_login_at"),
});

/** Only the SHA-256 of the bearer token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: accountRef(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: createdAt("last_seen_at"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_account_idx").on(t.accountId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** key: 'start:<ip>' (names made) | 'recover:<ip>' (wrong 이어하기 코드) */
export const authThrottle = pgTable("auth_throttle", {
  key: text("key").primaryKey(),
  failCount: integer("fail_count").notNull().default(0),
  windowStart: createdAt("window_start"),
  lockedUntil: maybeTime("locked_until"),
});

// ── 게임 ──

export const players = pgTable(
  "players",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    gold: integer("gold").notNull().default(0),
    locationId: text("location_id").notNull(),
    day: integer("day").notNull().default(1),
    rodLv: integer("rod_lv").notNull().default(1),
    lineLv: integer("line_lv").notNull().default(1),
    hullLv: integer("hull_lv").notNull().default(1),
    hullHp: integer("hull_hp").notNull(),
    fuel: real("fuel").notNull(),
    hasLantern: boolean("has_lantern").notNull().default(false),
    /** 연료통 level 1–3 (Economy.md §4-3). */
    tankLv: integer("tank_lv").notNull().default(1),
    /** 화물칸 level 1–4 (hold slots). */
    holdLv: integer("hold_lv").notNull().default(1),
    /** Today's sales per island × species (포화) + the daily-gift stamp (Economy.md §2-6, §8-2). */
    marketLog: jsonb("market_log").$type<{ demand: Record<string, [number, number]>; gift?: string }>().notNull().default({ demand: {} }),
    iceLv: integer("ice_lv").notNull().default(0),
    // Out at sea when saved (design §8): boat position in world px; null while tied up at an island.
    seaX: real("sea_x"),
    seaY: real("sea_y"),
    seaHeading: real("sea_heading"),
    /** Game clock 0–24 (the day is `day`). */
    gameHour: real("game_hour").notNull().default(9),
    /** Seconds at sea, all-time — the freshness clock (design §3-3). */
    seaTime: real("sea_time").notNull().default(0),
    /** 해도 fog of war: one bit per map tile, base64 (~5 KB). */
    chart: text("chart").notNull().default(""),
    /** Unsold fish in the hold (capped by hold capacity) — design §8 용량 절약 원칙. */
    cargo: jsonb("cargo").$type<CargoItem[]>().notNull().default([]),
    storyFlags: jsonb("story_flags").$type<Record<string, unknown>>().notNull().default({}),
    storyClearedAt: maybeTime("story_cleared_at"),
    createdAt: createdAt(),
  },
  (t) => [check("players_gold_nonneg", sql`${t.gold} >= 0`)],
);

/** `id` = `${sessionId}:${castIndex}`; `freshAt` = players.sea_time when caught. */
export type CargoItem = { id: string; fishId: string; sizeCm: number; caughtAt: string; spotId: string; freshAt?: number };

export type CastConds = { deep: boolean; storm: boolean };

export type Omen = { tier: "C" | "B" | "A" | "S" | "SS"; castsLeft: number; spotId?: string; createdAt: string };

export const endless = pgTable("endless", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  scoreTotal: bigint("score_total", { mode: "number" }).notNull().default(0),
  nextThreshold: bigint("next_threshold", { mode: "number" }).notNull(),
  thresholdStep: bigint("threshold_step", { mode: "number" }).notNull(),
  spawnBonus: real("spawn_bonus").notNull().default(0),
  omen: jsonb("omen").$type<Omen>(),
  title: text("title"),
  updatedAt: createdAt("updated_at"),
});

/** season_id = KST ISO week, e.g. '2026-W45'. */
export const seasonScores = pgTable(
  "season_scores",
  {
    seasonId: text("season_id").notNull(),
    accountId: accountRef(),
    score: bigint("score", { mode: "number" }).notNull().default(0),
    bossPoints: integer("boss_points").notNull().default(0),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [
    primaryKey({ columns: [t.seasonId, t.accountId] }),
    index("season_scores_rank_idx").on(t.seasonId, t.score.desc()),
  ],
);

export const unlocks = pgTable(
  "unlocks",
  {
    accountId: accountRef(),
    islandId: text("island_id").notNull(),
    unlockedAt: createdAt("unlocked_at"),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.islandId] })],
);

/** Server-issued fishing seed (design §11-3). */
export const fishSessions = pgTable(
  "fish_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: accountRef(),
    spotId: text("spot_id").notNull(),
    /** Species pool the casts roll from (points.ts). */
    pointId: text("point_id").notNull(),
    /** Deep tile / storm, fixed when the session opened (the server read them from the position). */
    conds: jsonb("conds").$type<CastConds>().notNull().default({ deep: false, storm: false }),
    /** game_config version the casts roll with (0 = the default bundled with the API). */
    configVersion: integer("config_version").notNull().default(0),
    seed: bytea("seed").notNull(),
    nextIndex: integer("next_index").notNull().default(0),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    closedAt: maybeTime("closed_at"),
  },
  (t) => [index("fish_sessions_account_open_idx").on(t.accountId, t.closedAt)],
);

/**
 * Idempotency log for /api/save (the same batchId is applied once) plus the save's
 * catch summary: per-species counts, score total, max size. Pruned to summary after 90 days.
 */
export const commits = pgTable(
  "commits",
  {
    batchId: uuid("batch_id").primaryKey(),
    accountId: accountRef(),
    sessionId: uuid("session_id"),
    fromIndex: integer("from_index"),
    toIndex: integer("to_index"),
    result: jsonb("result").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("commits_account_time_idx").on(t.accountId, t.createdAt.desc())],
);

/** balance.jsonc, applied by `pnpm balance:apply` — one row per version (design: one tunable file). */
export const gameConfig = pgTable("game_config", {
  version: serial("version").primaryKey(),
  data: jsonb("data").notNull(),
  hash: text("hash").notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

export const notableReason = pgEnum("notable_reason", ["boss", "rare", "record", "trophy"]);

/**
 * Only catches worth keeping get a row (design §8 용량 절약 원칙): pollutant bosses,
 * rare+, personal/species size records, and fish turned into a trophy card.
 * Everything else lives in the per-save summary in `commits.result`.
 */
export const notableCatches = pgTable(
  "notable_catches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: accountRef(),
    // No FK: these are permanent records even if old fish_sessions are pruned.
    sessionId: uuid("session_id").notNull(),
    castIndex: integer("cast_index").notNull(),
    fishId: text("fish_id").notNull(),
    spotId: text("spot_id").notNull(),
    sizeCm: real("size_cm").notNull(),
    isBoss: boolean("is_boss").notNull().default(false),
    bossTier: text("boss_tier"),
    score: integer("score").notNull().default(0),
    seasonId: text("season_id"),
    caughtAt: createdAt("caught_at"),
    reason: notableReason("reason").notNull(),
    trophyKey: text("trophy_key"),
  },
  (t) => [
    uniqueIndex("notable_session_cast_uq").on(t.sessionId, t.castIndex), // one row per cast
    index("notable_account_time_idx").on(t.accountId, t.caughtAt.desc()),
    index("notable_fish_size_idx").on(t.fishId, t.sizeCm.desc()), // 월척 ranking
  ],
);

export const inventory = pgTable(
  "inventory",
  {
    accountId: accountRef(),
    itemId: text("item_id").notNull(),
    qty: integer("qty").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.itemId] }), check("inventory_qty_nonneg", sql`${t.qty} >= 0`)],
);

export const dex = pgTable(
  "dex",
  {
    accountId: accountRef(),
    fishId: text("fish_id").notNull(),
    firstCaughtAt: createdAt("first_caught_at"),
    maxSizeCm: real("max_size_cm").notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.fishId] })],
);

export const quests = pgTable(
  "quests",
  {
    accountId: accountRef(),
    questId: text("quest_id").notNull(),
    status: text("status").notNull(),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.questId] })],
);

export const titles = pgTable(
  "titles",
  {
    seasonId: text("season_id").notNull(),
    accountId: accountRef(),
    title: text("title").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.accountId] })],
);

export type Account = typeof accounts.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Endless = typeof endless.$inferSelect;

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
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea, citext } from "./types";

// Design v6 §8. Accounts are our own (no Neon Auth).

const createdAt = (name = "created_at") => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const maybeTime = (name: string) => timestamp(name, { withTimezone: true });
const accountRef = (name = "account_id") =>
  uuid(name)
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" });

// ── 계정 ──

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: citext("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // citext too, so "Bob" and "bob" can't both appear on the leaderboard.
  nickname: citext("nickname").notNull().unique(),
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

/** key: 'login:<username>' | 'ip:<ip>' */
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
    fuel: integer("fuel").notNull(),
    hasLantern: boolean("has_lantern").notNull().default(false),
    iceLv: integer("ice_lv").notNull().default(0),
    /** Unsold fish in the hold (capped by hold capacity) — design §8 용량 절약 원칙. */
    cargo: jsonb("cargo").$type<CargoItem[]>().notNull().default([]),
    storyFlags: jsonb("story_flags").$type<Record<string, unknown>>().notNull().default({}),
    storyClearedAt: maybeTime("story_cleared_at"),
    createdAt: createdAt(),
  },
  (t) => [check("players_gold_nonneg", sql`${t.gold} >= 0`)],
);

export type CargoItem = { fishId: string; sizeCm: number; caughtAt: string; spotId: string };

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

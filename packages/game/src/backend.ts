import type { Balance, ItemId, MarketLog, OpResult, ShopOp } from "@sea/shared";

// GameBackend (design §7, §11): the game never knows where data lives.
//   LocalBackend  — demo build: localStorage, local seeds (apps/client/src/backend)
//   RemoteBackend — full build: /api/session/open + /api/save (M4)

export type FishingSession = {
  sessionId: string;
  /** Server-issued (or local) seed; every cast is rolled from it (design §11-3). */
  seed: string;
  spotId: string;
  /** Next cast index — resumes after a restart so the same fish come in the same order (§11-4). */
  nextIndex: number;
  /** Cast index from which an omen guarantees a pollutant (design §4-5), or null. */
  omenFrom: number | null;
  /** Deep tile / storm as fixed when the session opened (the server decides them in the full build). */
  conds?: { deep: boolean; storm: boolean };
  /** The balance the session opened under, when it isn't the one loaded now (casts roll with it). */
  balance?: Balance;
};

/** What a fishing scene asks to open: the spot, and where/when the boat is (sea points). */
export type SessionSpot = {
  /** Map point id (p_jade_3) or island dock (red_lighthouse_dock) — one session per spot. */
  spotId: string;
  /** Species pool + odds (points.ts). */
  pointId: string;
  at?: { x: number; y: number };
  clockH?: number;
  deep?: boolean;
  storm?: boolean;
};

export type SaveReason = "manual" | "dock" | "exit" | "recover" | "lobby" | "shop";
export type SaveOutcome = { ok: boolean; message: string; caught?: number; rejected?: number; /** Trades the server refused (their gold is undone). */ rejectedOps?: number };
export type SaveStatus = { lastSavedAt: number | null; unsavedCaught: number; dirty: boolean };

/** released = caught, but let go because the hold was full. */
export type CastResult = "caught" | "escaped" | "released";

/** One 도감 entry (design §4-3). */
export type DexEntry = { fishId: string; count: number; maxSizeCm: number };

export type CastRecord = {
  i: number;
  fishId: string;
  sizeCm: number;
  result: CastResult;
  /** How long the reel fight lasted (server plausibility check). */
  reelMs: number;
  /** Client timestamp (ms). */
  t: number;
  /** WorldState.seaTime at the cast (freshness clock). */
  seaT?: number;
  /** Bait on the hook (an item id, or "none"): part of the roll. */
  bait?: string;
  /** false = reeled in before anything bit: the bait stays on (Economy.md §4-1). */
  bit?: boolean;
};

export type HoldItem = {
  /** `${sessionId}:${castIndex}` */
  id?: string;
  fishId: string;
  sizeCm: number;
  spotId: string;
  caughtAt: string;
  /** WorldState.seaTime when caught — freshness drops from here (Economy.md §2-5). */
  freshAt?: number;
  /** Rots this much faster (검은 미끼 ×1.5). */
  rot?: number;
  /** 소금 절임: freshness frozen at this %. */
  salted?: number;
};

export type Inventory = Partial<Record<ItemId, number>>;

/** Where the player is and what the boat has (design §3-3, §3-4, §8 players). */
export type WorldState = {
  at: { kind: "island"; id: string } | { kind: "sea"; x: number; y: number; heading: number };
  hullLv: 1 | 2 | 3 | 4;
  hullHp: number;
  fuel: number;
  /** 연료통 level 1–3 (max fuel). */
  tankLv: number;
  /** 화물칸 level 1–4 (hold slots). */
  holdLv: number;
  lantern: boolean;
  iceLv: number;
  day: number;
  /** Game clock, 0–24. */
  hour: number;
  /** Seconds of play, all-time — the freshness clock (it runs at sea, docked and fishing alike). */
  seaTime: number;
  /** Fog of war on the 해도: one bit per map tile, base64. */
  chart: string;
};

export type Gear = { rodLv: number; lineLv: number };

/** The player saved on this device (design §5: a name, no login until Steam). */
export type Profile = {
  name: string;
  createdAt: string;
  lastPlayedAt: string;
  /** 이어하기 코드 for moving to another PC — only when the server issued one (full build). */
  recoveryCode?: string | null;
};

export interface GameBackend {
  /** Open (or resume) the seed session for a fishing spot. */
  openSession(spot: SessionSpot): Promise<FishingSession>;
  /** Journal one finished cast locally; it reaches the server on the next save. */
  recordCast(sessionId: string, cast: CastRecord): void;
  /** Leaving the point closes its session (a fresh seed next time). */
  closeSession(sessionId: string): void;
  gear(): Gear;
  /** Unsold fish in the boat's hold (score is credited when sold — design v9 §4-4). */
  hold(): HoldItem[];
  /** Drop hold items (e.g. lost when the boat is towed). */
  dropHold(indices: number[]): void;
  gold(): number;
  dex(): DexEntry[];
  /** Bait and consumables on board. */
  inventory(): Inventory;
  /** Today's sales per island × species (포화) and the daily-gift stamp. */
  marketLog(): MarketLog;
  /** A trade at an island (sell fish / buy fuel, repairs, gear). Applied now with the shared rules;
   *  in the full build it is journaled and the server confirms it on the next save. */
  trade(op: ShopOp): OpResult;
  /** Dev cheat (Economy.md §9 골드 지급) — local saves only; the server owns the gold. */
  devGrant?(gold: number): void;

  // ── world (design §3-3, §11-2): where the boat is, fuel, hull, chart ──
  world(): WorldState;
  /** Keep the world state. Local builds write it straight away; the server sees it on the next save. */
  saveWorld(w: WorldState): void;

  // ── profile (lobby, design §5 / §7-3) ──
  /** This device's player, or null on a first run. */
  profile(): Profile | null;
  /** 새 게임: start over under `name` (already validated). Rejects with a player-facing message, e.g. the name is taken. */
  startNew(name: string): Promise<Profile>;
  /** 이어하기: mark the profile as played now; resolves once the save is ready to play. */
  resume(): Promise<Profile>;
  /** 이어하기 코드 → load this player's save from the server. Absent where saves are local only (demo). */
  recover?(code: string): Promise<Profile>;
  /** 설정 → 이 기기에서 기록 지우기. */
  forget(): Promise<void>;

  // ── saving (design §11): only where saves go to a server ──
  /** Send everything since the last save in one call; the reply's confirmed state replaces ours. */
  commit?(reason: SaveReason): Promise<SaveOutcome>;
  saveStatus?(): SaveStatus;
  /** Unsaved progress left by a crash or a closed tab (design §11-5). */
  pendingRecovery?(): boolean;
  /** Drop unsaved progress and go back to the last saved state ("저장 안 하고 종료"). */
  discardUnsaved?(): void;
}

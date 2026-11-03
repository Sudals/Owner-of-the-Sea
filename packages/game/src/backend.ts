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

export type SaveReason = "manual" | "dock" | "exit" | "recover" | "lobby";
export type SaveOutcome = { ok: boolean; message: string; caught?: number; rejected?: number };
export type SaveStatus = { lastSavedAt: number | null; unsavedCaught: number; dirty: boolean };

export type CastResult = "caught" | "escaped";

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
};

export type HoldItem = {
  /** `${sessionId}:${castIndex}` */
  id?: string;
  fishId: string;
  sizeCm: number;
  spotId: string;
  caughtAt: string;
  /** WorldState.seaTime when caught — freshness drops with time at sea after this (design §3-3). */
  freshAt?: number;
};

/** Where the player is and what the boat has (design §3-3, §3-4, §8 players). */
export type WorldState = {
  at: { kind: "island"; id: string } | { kind: "sea"; x: number; y: number; heading: number };
  hullLv: 1 | 2 | 3 | 4;
  hullHp: number;
  fuel: number;
  fuelTank: boolean;
  lantern: boolean;
  iceLv: number;
  day: number;
  /** Game clock, 0–24. */
  hour: number;
  /** Seconds spent at sea, all-time (the freshness clock). */
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

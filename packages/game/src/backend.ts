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
};

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
};

export type HoldItem = { fishId: string; sizeCm: number; spotId: string; caughtAt: string };

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
  /** Open (or resume) the seed session for a fishing point. */
  openSession(spotId: string): Promise<FishingSession>;
  /** Journal one finished cast locally; it reaches the server on the next save. */
  recordCast(sessionId: string, cast: CastRecord): void;
  /** Leaving the point closes its session (a fresh seed next time). */
  closeSession(sessionId: string): void;
  gear(): Gear;
  /** Unsold fish in the boat's hold (score is credited when sold — design v9 §4-4). */
  hold(): HoldItem[];

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
}

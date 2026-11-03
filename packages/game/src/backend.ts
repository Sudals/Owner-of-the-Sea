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
}

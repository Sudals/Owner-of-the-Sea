// Tension minigame (design §4-2). Pure logic, no DOM — the scene feeds it `holding` each step
// and draws its state; the simulator (reel.sim.ts) drives it headless to tune the feel.
//
//  · hold → tension rises, line comes in (slower under high tension)
//  · release → tension falls, the fish takes line back
//  · the fish pulls in its own rhythm, thrashes now and then (`erratic`), and tires over time
//  · tension ≥ 1 → the line snaps · tension ~0 for 1.5 s → the fish shakes loose · distance 0 → caught
//  · rod level = reel speed, line level = tension headroom; bosses pull ×2.5 over ×3 distance (§4-5)

import { balance, lineMax, live, rodSpeed } from "@sea/shared";

export type ReelOutcome = "caught" | "snapped" | "escaped";

export type ReelParams = {
  power: number; // 1–10 (shared/data/fish.ts)
  erratic: number; // 0–1
  boss?: boolean;
  rodLv?: number;
  lineLv?: number;
  /** 0–1 cast strength; a longer cast means more line to bring in. */
  castPower?: number;
};

/** Tension-game constants, from balance.jsonc `reel` (always the current balance). */
export const REEL: Readonly<{ slackLimit: number; holdRise: number; pullRise: number; releaseFall: number; minFall: number; bossMult: number; baseSpeed: number }> = live(() => balance().reel);

export class Reel {
  dist: number;
  readonly startDist: number;
  tension = 0.35;
  /** Current fish pull 0..~2.5, for drawing the struggle. */
  pull = 0;
  /** Seconds of the current thrash, 0 when calm. */
  thrash = 0;
  fatigue = 0;
  slack = 0;
  t = 0;
  outcome: ReelOutcome | null = null;

  private readonly strength: number;
  private readonly stamina: number;
  private readonly speed: number;
  private readonly headroom: number;
  private readonly phase: number;
  private thrashPower = 0;

  constructor(
    private readonly p: ReelParams,
    private readonly rnd: () => number = Math.random,
  ) {
    const boss = p.boss ? 1 : 0;
    this.strength = (p.power / 10) * (boss ? REEL.bossMult : 1);
    this.stamina = (6 + p.power * 1.4) * (boss ? 1.6 : 1);
    this.speed = REEL.baseSpeed * rodSpeed(p.rodLv ?? 1);
    this.headroom = lineMax(p.lineLv ?? 1);
    this.startDist = (6 + (p.castPower ?? 0.5) * 10) * (boss ? 3 : 1);
    this.dist = this.startDist;
    this.phase = rnd() * Math.PI * 2;
  }

  /** Progress 0 (just hooked) → 1 (landed). */
  get progress(): number {
    return Math.max(0, Math.min(1, 1 - this.dist / this.startDist));
  }

  update(dt: number, holding: boolean): void {
    if (this.outcome) return;
    this.t += dt;

    // thrashing: sudden spikes, more often for erratic fish
    if (this.thrash > 0) this.thrash = Math.max(0, this.thrash - dt);
    else if (this.rnd() < this.p.erratic * 0.55 * dt) {
      this.thrash = 0.35 + this.rnd() * 0.5;
      this.thrashPower = this.strength * (0.5 + this.rnd() * 0.4);
    }

    const rhythm = 0.55 + 0.45 * Math.sin(this.t * 1.9 + this.phase);
    this.pull = this.strength * rhythm * (1 - 0.55 * this.fatigue) + (this.thrash > 0 ? this.thrashPower : 0);

    if (holding) {
      this.tension += ((REEL.holdRise + this.pull * REEL.pullRise) * dt) / this.headroom;
      this.dist -= this.speed * (1 - 0.4 * Math.min(1, this.tension)) * dt;
      this.dist += this.pull * 0.6 * dt;
    } else {
      this.tension -= Math.max(REEL.minFall, REEL.releaseFall - this.pull * 0.2) * dt;
      this.dist += this.pull * 1.4 * dt;
    }
    if (this.thrash > 0) this.dist += this.thrashPower * 1.6 * dt; // a thrash is a run: it takes line
    this.tension = Math.max(0, this.tension);
    this.fatigue = Math.min(1, this.fatigue + (dt / this.stamina) * (holding ? 1 : 0.35));

    this.slack = this.tension <= 0.03 ? this.slack + dt : 0;
    if (this.tension >= 1) this.outcome = "snapped";
    else if (this.slack >= REEL.slackLimit) this.outcome = "escaped";
    else if (this.dist <= 0) this.outcome = "caught";
    else if (this.dist >= this.startDist + 12 * (this.p.boss ? 3 : 1)) this.outcome = "escaped"; // ran off with the line
  }
}

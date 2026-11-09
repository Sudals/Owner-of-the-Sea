// Tension minigame (design §4-2). Pure logic, no DOM — the scene feeds it `holding` each step
// and draws its state; the simulator (reel.sim.ts) drives it headless to tune the feel.
//
//  · hold → tension rises (the fish's pull adds to it) · release → tension falls
//  · keep the tension inside the 유지 구간 (zone) and the fish comes in; below it the fish takes
//    line back, above it nothing gives (and at the top the line snaps)
//  · the zone is narrower the harder the fish (power, erratic), sways for erratic fish, widens a
//    little as the fish tires; a better line widens it too
//  · the fish pulls in its own rhythm, thrashes now and then (a thrash yanks the line), tires
//  · tension ≥ 1 → the line snaps · tension ~0 for 1.5 s → the fish shakes loose · distance 0 → caught
//  · rod level = reel speed, line level = tension headroom; bosses pull ×2 over ×3 distance (§4-5)

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

/** The 유지 구간 (balance.jsonc `reel.zone`; a balance stored before it existed uses these). */
const ZONE_DEFAULTS = { wide: 0.42, narrow: 0.13, center: 0.52, bossMult: 0.85, sway: 0.1, tiredWiden: 0.25, lineWiden: 0.35, yank: 0.35, slackLoss: 0.8, reelIn: 0.75 };
export const zoneParams = () => ({ ...ZONE_DEFAULTS, ...balance().reel.zone });

/** How hard a fish is to hold, 0 (a sardine) … 1 (the strongest, wildest fish). */
export const difficulty = (power: number, erratic: number): number => Math.max(0, Math.min(1, (power / 10) * 0.75 + erratic * 0.25));

export class Reel {
  dist: number;
  readonly startDist: number;
  tension: number;
  /** Current fish pull 0..~2.5, for drawing the struggle. */
  pull = 0;
  /** Seconds of the current thrash, 0 when calm. */
  thrash = 0;
  fatigue = 0;
  slack = 0;
  t = 0;
  outcome: ReelOutcome | null = null;
  /** The 유지 구간 right now: [low, high] on the 0–1 tension gauge. */
  zone: [number, number] = [0, 1];
  /** Is the tension inside the zone (the fish is coming in)? */
  inZone = false;
  /** Seconds spent inside the zone. */
  zoneTime = 0;

  private readonly strength: number;
  private readonly stamina: number;
  private readonly speed: number;
  private readonly headroom: number;
  private readonly phase: number;
  private readonly swayPhase: number;
  /** Zone width before fatigue. */
  readonly width: number;
  private thrashPower = 0;

  constructor(
    private readonly p: ReelParams,
    private readonly rnd: () => number = Math.random,
  ) {
    const boss = p.boss ? 1 : 0;
    const z = zoneParams();
    this.strength = (p.power / 10) * (boss ? REEL.bossMult : 1);
    this.stamina = (6 + p.power * 1.4) * (boss ? 1.6 : 1);
    this.speed = REEL.baseSpeed * rodSpeed(p.rodLv ?? 1);
    this.headroom = lineMax(p.lineLv ?? 1);
    this.startDist = (6 + (p.castPower ?? 0.5) * 10) * (boss ? 3 : 1);
    this.dist = this.startDist;
    this.phase = rnd() * Math.PI * 2;
    this.swayPhase = rnd() * Math.PI * 2;
    const d = difficulty(p.power, p.erratic);
    this.width = (z.wide - (z.wide - z.narrow) * d) * (boss ? z.bossMult : 1) * (1 + (this.headroom - 1) * z.lineWiden);
    this.placeZone();
    // struck: the line is taut, just inside the zone's lower half
    this.tension = this.zone[0] + (this.zone[1] - this.zone[0]) * 0.35;
  }

  /** Progress 0 (just hooked) → 1 (landed). */
  get progress(): number {
    return Math.max(0, Math.min(1, 1 - this.dist / this.startDist));
  }

  /** The zone sways with an erratic fish and widens as it tires; it never leaves the gauge. */
  private placeZone(): void {
    const z = zoneParams();
    const w = Math.min(0.8, this.width * (1 + z.tiredWiden * this.fatigue));
    const sway = z.sway * this.p.erratic * (Math.sin(this.t * 0.8 + this.swayPhase) * 0.7 + Math.sin(this.t * 1.9 + this.swayPhase * 2) * 0.3);
    const c = Math.max(0.08 + w / 2, Math.min(0.9 - w / 2, z.center + sway));
    this.zone = [c - w / 2, c + w / 2];
  }

  update(dt: number, holding: boolean): void {
    if (this.outcome) return;
    this.t += dt;
    const z = zoneParams();

    // thrashing: sudden spikes, more often for erratic fish
    if (this.thrash > 0) this.thrash = Math.max(0, this.thrash - dt);
    else if (this.rnd() < this.p.erratic * 0.55 * dt) {
      this.thrash = 0.35 + this.rnd() * 0.5;
      this.thrashPower = this.strength * (0.5 + this.rnd() * 0.4);
    }

    const rhythm = 0.55 + 0.45 * Math.sin(this.t * 1.9 + this.phase);
    this.pull = this.strength * rhythm * (1 - 0.55 * this.fatigue) + (this.thrash > 0 ? this.thrashPower : 0);

    if (holding) this.tension += ((REEL.holdRise + this.pull * REEL.pullRise) * dt) / this.headroom;
    else this.tension -= Math.max(REEL.minFall, REEL.releaseFall - this.pull * 0.2) * dt;
    // a thrash yanks the line taut, held or not
    if (this.thrash > 0) this.tension += (this.thrashPower * z.yank * dt) / this.headroom;
    this.tension = Math.max(0, this.tension);

    this.placeZone();
    const [lo, hi] = this.zone;
    this.inZone = this.tension >= lo && this.tension <= hi;
    if (this.inZone) {
      // in the zone the line comes in, against the fish's pull
      this.zoneTime += dt;
      this.dist -= Math.max(this.speed * 0.3, this.speed - this.pull * 0.5) * z.reelIn * dt;
    } else if (this.tension < lo) {
      // too slack: the fish swims off with line
      this.dist += (z.slackLoss + this.pull * 1.4) * dt;
    } else {
      // too tight: nothing gives, the fish holds its ground
      this.dist += this.pull * 0.4 * dt;
    }
    if (this.thrash > 0) this.dist += this.thrashPower * 1.6 * dt; // a thrash is a run: it takes line
    this.fatigue = Math.min(1, this.fatigue + (dt / this.stamina) * (this.inZone ? 1 : 0.35));

    this.slack = this.tension <= 0.03 ? this.slack + dt : 0;
    if (this.tension >= 1) this.outcome = "snapped";
    else if (this.slack >= REEL.slackLimit) this.outcome = "escaped";
    else if (this.dist <= 0) this.outcome = "caught";
    else if (this.dist >= this.startDist + 12 * (this.p.boss ? 3 : 1)) this.outcome = "escaped"; // ran off with the line
  }
}

// The boat and the sea's rules (design §3-2, §3-3 자원, §3-4; Economy.md §4-3). Shared so the
// server can check a voyage log against the same numbers (§11-6).

import { balance, derived, live } from "../balance";
import type { SeaColor } from "./points";
import { MAP_H, MAP_W, SEA_ORDER } from "./seaMap";

export type HullLv = 1 | 2 | 3 | 4;

export type HullSpec = {
  name: string;
  /** Max hull HP (선체 내구도). */
  hp: number;
  /** Top speed on engine, px/s. */
  speed: number;
  /** Collision radius, px. */
  radius: number;
};

export const HULLS: Readonly<Record<HullLv, HullSpec>> = live(() => balance().boat.hulls) as Readonly<Record<HullLv, HullSpec>>;

/** Fuel tank capacity by 연료통 level (Economy.md §4-3: Lv2 녹슨항, Lv3 녹슨항·유리탑섬). */
export const TANK_CAP: Readonly<Record<number, number>> = live(() => balance().boat.tankCap);

export const FUEL: Readonly<{ base: number; perTile: number; rowFactor: number }> = live(
  derived((b) => ({
    base: b.boat.tankCap["1"] ?? 100,
    /** Fuel per tile travelled on engine. */
    perTile: b.boat.fuelPerTile,
    /** Out of fuel you row: this fraction of the hull's top speed (design: 30%). */
    rowFactor: b.boat.rowFactor,
  })),
);

/** Collision damage: HP lost per px/s of impact speed above `minSpeed`. Reefs bite harder. */
export const IMPACT: Readonly<{ minSpeed: number; reefPctAtTop: number; shorePctAtTop: number }> = live(() => balance().boat.impact);

/** Hull lost hitting something at `speed` (Economy.md §4-6): a share of max HP, full share at the
 *  hull's top speed, scaled down for slower bumps, nothing at or below minSpeed. */
export function impactDamage(hullLv: HullLv, speed: number, reef: boolean): number {
  const h = HULLS[hullLv], i = IMPACT;
  const k = Math.max(0, Math.min(1.2, (speed - i.minSpeed) / Math.max(1, h.speed - i.minSpeed)));
  return Math.round(h.hp * (reef ? i.reefPctAtTop : i.shorePctAtTop) * k);
}

/** Share of the hold lost when the boat is towed in (Economy.md §4-6: 30%). */
export const towLossRate = (): number => balance().boat.towLossRate;

/** Hull lost per second inside a storm of `intensity` 0..1 (Economy.md §4-6: ~3% of max HP a minute). */
export const stormDamagePerSec = (hullLv: HullLv, intensity: number): number => (HULLS[hullLv].hp * balance().boat.stormDamagePctPerMin * intensity) / 60;

/** Freshness lost per real minute, by 얼음 창고 level 0–3 (Economy.md §2-5: 1.0 / 0.7 / 0.5 / 0.35 %). */
export const FRESH_DECAY_PER_MIN: readonly number[] = live(() => balance().boat.freshDecayPerMin, []);

export type Gear = { hullLv: HullLv; lantern: boolean; tankLv: number };

/** Who may sail into which sea (design §3-2). null = allowed, otherwise the reason to show. */
export function seaBlock(sea: SeaColor, g: Gear): string | null {
  switch (sea) {
    case "jade":
      return null;
    case "azure":
      return g.hullLv >= 2 ? null : "선체 Lv2가 필요해요 (종탑섬)";
    case "indigo":
      if (g.hullLv < 3) return "선체 Lv3이 필요해요 (녹슨항)";
      return g.tankLv >= 2 ? null : "연료통 Lv2가 필요해요 (녹슨항)";
    case "ink":
      if (!g.lantern) return "등불이 필요해요 (물소리섬)";
      return g.hullLv >= 4 ? null : "선체 Lv4가 필요해요 (유리탑섬)";
  }
}

export const fuelMax = (g: Pick<Gear, "tankLv">) => TANK_CAP[g.tankLv] ?? TANK_CAP[1]!;

// ── 폭풍 ──────────────────────────────────────────────────────────────────────
// Cloud fields drifting on fixed loops, driven by the game clock (hours since day 1, 00:00),
// so every client (and the server) agrees where a storm is at any moment.

type StormPath = { cx: number; cy: number; ax: number; ay: number; r: number; periodH: number; phase: number };

const STORM_PATHS: readonly StormPath[] = [
  { cx: 78, cy: 44, ax: 22, ay: 16, r: 8, periodH: 26, phase: 0.3 },
  { cx: 132, cy: 98, ax: 26, ay: 14, r: 9, periodH: 31, phase: 2.1 },
  { cx: 176, cy: 54, ax: 16, ay: 24, r: 7.5, periodH: 22, phase: 4.4 },
];

export type Storm = { x: number; y: number; r: number };

/** Storm centers and radii in tiles at `clockH` (game hours since the start). */
export function stormsAt(clockH: number): Storm[] {
  return STORM_PATHS.map((p) => {
    const a = (clockH / p.periodH) * Math.PI * 2 + p.phase;
    const x = Math.max(4, Math.min(MAP_W - 4, p.cx + Math.cos(a) * p.ax));
    const y = Math.max(4, Math.min(MAP_H - 4, p.cy + Math.sin(a * 1.3) * p.ay));
    return { x, y, r: p.r + Math.sin(a * 2.1) * 1.2 };
  });
}

/** 0 outside, rising to 1 at a storm's eye (tile coords). */
export function stormIntensity(tx: number, ty: number, clockH: number): number {
  let best = 0;
  for (const s of stormsAt(clockH)) {
    const d = Math.hypot(tx - s.x, ty - s.y) / s.r;
    if (d < 1) best = Math.max(best, 1 - d * d);
  }
  return best;
}

/** Sea color index → name (re-exported for the boat UI). */
export const SEA_COLORS: readonly SeaColor[] = SEA_ORDER;

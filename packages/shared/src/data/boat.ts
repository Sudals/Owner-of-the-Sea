// The boat and the sea's rules (design §3-2, §3-3 자원, §3-4). Shared so the server can
// check a voyage log against the same numbers later (§11-6).

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

export const HULLS: Readonly<Record<HullLv, HullSpec>> = {
  1: { name: "통통배", hp: 100, speed: 66, radius: 5 },
  2: { name: "흰 통통배", hp: 140, speed: 78, radius: 5 },
  3: { name: "철선", hp: 190, speed: 90, radius: 6 },
  4: { name: "큰 철선", hp: 250, speed: 104, radius: 7 },
};

export const FUEL = {
  /** Tank without / with the 연료통 (녹슨항). */
  base: 100,
  withTank: 180,
  /** Fuel per tile travelled on engine. 100 fuel ≈ 220 tiles. */
  perTile: 0.45,
  /** Out of fuel you row: this fraction of the hull's top speed (design: 30%). */
  rowFactor: 0.3,
} as const;

/** Collision damage: HP lost per px/s of impact speed above `minSpeed`. Reefs bite harder. */
export const IMPACT = { minSpeed: 18, perSpeed: 0.28, reefMult: 1.6 } as const;

/** Hold freshness (design §3-3): seconds at sea until a fish is fully spoiled, per 얼음 창고 level. */
export const FRESH_SECONDS = [600, 960, 1440] as const;

export type Gear = { hullLv: HullLv; lantern: boolean; fuelTank: boolean };

/** Who may sail into which sea (design §3-2). null = allowed, otherwise the reason to show. */
export function seaBlock(sea: SeaColor, g: Gear): string | null {
  switch (sea) {
    case "jade":
      return null;
    case "azure":
      return g.hullLv >= 2 ? null : "선체 Lv2가 필요해요 (종탑섬)";
    case "indigo":
      if (g.hullLv < 3) return "선체 Lv3이 필요해요 (녹슨항)";
      return g.fuelTank ? null : "연료통이 필요해요 (녹슨항)";
    case "ink":
      if (!g.lantern) return "등불이 필요해요 (물소리섬)";
      return g.hullLv >= 4 ? null : "선체 Lv4가 필요해요 (유리탑섬)";
  }
}

export const fuelMax = (g: Pick<Gear, "fuelTank">) => (g.fuelTank ? FUEL.withTank : FUEL.base);

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

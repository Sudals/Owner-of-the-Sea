// Catch odds (design §4-8). Every cast rolls two things independently, each from a table
// that depends on WHERE you fish:
//   1. fish grade (희귀도)  : 일반 → 고급 → 희귀 → 전설      — which tier of species bites
//   2. size grade (크기 등급): D → C → B → A → S            — how big it is for its species
// Base tables come from the sea zone (옥빛 → 먹빛 get better), a point may scale them, and
// dark deep-sea tiles on the top-down map multiply the high end. Tune the numbers here.

import type { SeaColor } from "./points";

export const FISH_GRADES = ["common", "uncommon", "rare", "legendary"] as const;
export type FishGrade = (typeof FISH_GRADES)[number];

export const SIZE_GRADES = ["D", "C", "B", "A", "S"] as const;
export type SizeGrade = (typeof SIZE_GRADES)[number];

export const GRADE_LABEL: Readonly<Record<FishGrade | "boss", string>> = {
  common: "일반",
  uncommon: "고급",
  rare: "희귀",
  legendary: "전설",
  boss: "오염체",
};

/** Where in its species' size range each size grade falls (fraction of [min, max]). */
export const SIZE_BANDS: Readonly<Record<SizeGrade, readonly [number, number]>> = {
  D: [0, 0.35],
  C: [0.35, 0.6],
  B: [0.6, 0.8],
  A: [0.8, 0.93],
  S: [0.93, 1],
};

export type Odds = {
  /** Relative weights (they don't need to sum to 100). */
  grade: Readonly<Record<FishGrade, number>>;
  size: Readonly<Record<SizeGrade, number>>;
};

/** Base odds per sea zone (design §3-2): deeper water, rarer and bigger fish. */
export const ZONE_ODDS: Readonly<Record<SeaColor, Odds>> = {
  jade: { grade: { common: 78, uncommon: 17, rare: 4.6, legendary: 0.4 }, size: { D: 40, C: 30, B: 18, A: 9, S: 3 } },
  azure: { grade: { common: 62, uncommon: 27, rare: 10, legendary: 1 }, size: { D: 34, C: 30, B: 20, A: 12, S: 4 } },
  indigo: { grade: { common: 48, uncommon: 33, rare: 16, legendary: 3 }, size: { D: 28, C: 28, B: 22, A: 16, S: 6 } },
  ink: { grade: { common: 38, uncommon: 36, rare: 21, legendary: 5 }, size: { D: 22, C: 26, B: 24, A: 20, S: 8 } },
};

/** Multipliers for a cast made on a dark deep-sea tile of the top-down map. */
export const DEEP_TILE_BONUS: OddsMod = { grade: { rare: 1.5, legendary: 2 }, size: { A: 1.5, S: 2 } };

/** Per-point (or per-tile) multipliers on top of the zone table. */
export type OddsMod = { grade?: Partial<Record<FishGrade, number>>; size?: Partial<Record<SizeGrade, number>> };

export function applyMod(base: Odds, ...mods: (OddsMod | undefined)[]): Odds {
  const grade = { ...base.grade } as Record<FishGrade, number>;
  const size = { ...base.size } as Record<SizeGrade, number>;
  for (const m of mods) {
    if (!m) continue;
    for (const k of FISH_GRADES) grade[k] *= m.grade?.[k] ?? 1;
    for (const k of SIZE_GRADES) size[k] *= m.size?.[k] ?? 1;
  }
  return { grade, size };
}

/** Normalized percentages, e.g. for a dev overlay or a dex hint. */
export function asPercent<K extends string>(w: Readonly<Record<K, number>>): Record<K, number> {
  const total = Object.values<number>(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries<number>(w).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10])) as Record<K, number>;
}

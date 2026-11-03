// Endless-mode scoring constants — design §4-4 / §4-5 initial values.
// Tuned in M8 with the simulator. Score is fixed at catch and credited when the fish is SOLD
// (design v9 §4-4); the sale save is where the server checks thresholds and rolls omens.

export const BASE_POINTS = { common: 10, uncommon: 30, rare: 100, legendary: 300 } as const;
export const TRASH_POINTS = 2;

/** Size grade multiplier (design §4-4; grades in odds.ts). */
export const SIZE_GRADE_MULT = { D: 0.5, C: 0.8, B: 1, A: 1.4, S: 2 } as const;
/** 옥빛 jade / 청빛 azure / 남빛 indigo / 먹빛 ink */
export const SEA_MULT = { jade: 1, azure: 1.5, indigo: 2, ink: 3 } as const;
export const WEATHER_MULT = { clear: 1, storm: 1.3 } as const;

export const OMEN = {
  firstThreshold: 1000,
  thresholdGrowth: 1.15,
  baseChance: 0.35,
  pityStep: 0.15,
  guaranteedWithinCasts: 3,
} as const;

export const BOSS_SCORE_MULT = { C: 10, B: 15, A: 25, S: 50 } as const;

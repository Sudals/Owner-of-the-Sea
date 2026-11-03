// Endless-mode scoring constants — design §4-4 / §4-5 initial values.
// Tuned in M8 with the simulator; the server is the source of truth at commit time.

export const BASE_POINTS = { common: 10, uncommon: 30, rare: 100, legendary: 300 } as const;
export const TRASH_POINTS = 2;

export const SIZE_MULT_RANGE = { min: 0.5, max: 2.0 } as const;
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

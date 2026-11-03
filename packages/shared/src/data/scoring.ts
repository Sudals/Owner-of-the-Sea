import { balance, live } from "../balance";

// Endless-mode scoring constants — design §4-4 / §4-5 initial values.
// Tuned in M8 with the simulator. Score is fixed at catch and credited when the fish is SOLD
// (design v9 §4-4); the sale save is where the server checks thresholds and rolls omens.

export const BASE_POINTS: Readonly<Record<"common" | "uncommon" | "rare" | "legendary", number>> = live(() => balance().scoring.basePoints);
export const TRASH_POINTS = (): number => balance().scoring.trashPoints;

/** Size grade multiplier (design §4-4; grades in odds.ts). */
export const SIZE_GRADE_MULT: Readonly<Record<"D" | "C" | "B" | "A" | "S", number>> = live(() => balance().scoring.sizeMult);
/** 옥빛 jade / 청빛 azure / 남빛 indigo / 먹빛 ink */
export const SEA_MULT: Readonly<Record<"jade" | "azure" | "indigo" | "ink", number>> = live(() => balance().scoring.seaMult);
export const WEATHER_MULT: Readonly<{ clear: number; storm: number }> = live(() => balance().scoring.weatherMult);

export const OMEN: Readonly<{ firstThreshold: number; thresholdGrowth: number; baseChance: number; pityStep: number; guaranteedWithinCasts: number }> = live(() => balance().scoring.omen);

export const BOSS_SCORE_MULT: Readonly<{ C: number; B: number; A: number; S: number }> = live(() => balance().scoring.bossScoreMult);

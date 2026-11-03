import { START_ISLAND } from "./seaMap";

// New-player starting state (design §3-1: everyone starts at 빨간등대).

export const START_ISLAND_ID = START_ISLAND.id;

/** Initial numbers — tune freely; they are only applied when a player starts. */
export const STARTING_PLAYER = {
  gold: 100,
  day: 1,
  rodLv: 1,
  lineLv: 1,
  hullLv: 1,
  hullHp: 100,
  fuel: 100,
  hasLantern: false,
  iceLv: 0,
} as const;

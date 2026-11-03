// New-account starting state. Islands are TBD (design §3-1); `tbd_1` is the
// placeholder id for the starting island until the island list is decided.

export const START_ISLAND_ID = "tbd_1";

/** Initial numbers — tune freely; they are only applied at signup. */
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

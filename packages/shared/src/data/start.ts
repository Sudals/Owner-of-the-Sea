import { balance, live } from "../balance";
import { START_ISLAND } from "./seaMap";

// New-player starting state (design §3-1: everyone starts at 빨간등대).

export const START_ISLAND_ID = START_ISLAND.id;

/** A new player's starting state (balance.jsonc economy.start, boat hulls / tanks). */
export const STARTING_PLAYER: Readonly<{ gold: number; day: number; rodLv: number; lineLv: number; hullLv: number; hullHp: number; fuel: number; hasLantern: boolean; iceLv: number }> = live(() => {
  const b = balance();
  return { gold: b.economy.start.gold, day: 1, rodLv: 1, lineLv: 1, hullLv: 1, hullHp: b.boat.hulls["1"]!.hp, fuel: b.boat.tankCap["1"] ?? 100, hasLantern: false, iceLv: 0 };
});

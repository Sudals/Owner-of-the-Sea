// Fishing points (design §3-3, §4-8). A point lists which species live there; the zone odds
// (odds.ts) decide the grade and size. Sea points are scattered on the top-down map
// (seaMap.ts → MAP_POINTS); every island also has a dock point for shore fishing.

import { balance, derived, live } from "../balance";
import type { OddsMod } from "./odds";
import { ISLANDS } from "./seaMap";

export type SeaColor = "jade" | "azure" | "indigo" | "ink";

export type FishingPoint = {
  id: string;
  name: string;
  kind: "dock" | "sea";
  sea: SeaColor;
  /** Species that live here, any grade. A grade with no species here falls back one grade down. */
  pool: readonly string[];
  /** Optional tweak on top of the zone odds (e.g. shore docks see fewer big fish). */
  odds?: OddsMod;
  /** Default for the deep-tile bonus when the caller doesn't say (the map passes the real tile). */
  deep?: boolean;
};




const SEA_POINT_NAME: Readonly<Record<SeaColor, string>> = { jade: "옥빛 여울", azure: "청빛 물골", indigo: "남빛 낭떠러지", ink: "먹빛 골짜기" };

/** Dock points (one per island) and open-water points (one pool per sea), from balance.jsonc
 *  `fishing.pools`; shallow shore water uses `fishing.dockOdds`. */
export const POINTS: readonly FishingPoint[] = live(
  derived((b) => {
    const dockOdds: OddsMod = b.fishing.dockOdds;
    const seas = Object.keys(b.fishing.pools.sea) as SeaColor[];
    return [
      ...ISLANDS.map((i): FishingPoint => ({ id: i.dockPoint, name: `${i.name} 선착장`, kind: "dock", sea: i.sea, pool: b.fishing.pools.dock[i.sea], odds: dockOdds })),
      ...seas.map((sea): FishingPoint => ({ id: `${sea}_1`, name: SEA_POINT_NAME[sea], kind: "sea", sea, pool: b.fishing.pools.sea[sea], deep: sea === "ink" })),
    ];
  }),
  [],
);

export const POINT_BY_ID: Readonly<Record<string, FishingPoint>> = live(derived(() => Object.fromEntries(POINTS.map((p) => [p.id, p]))));

/** Pollutant boss per sea color (design §4-5: tier follows the sea). */
export const POLLUTANT_BY_SEA: Readonly<Record<SeaColor, string>> = live(() => balance().fishing.pollutantBySea);

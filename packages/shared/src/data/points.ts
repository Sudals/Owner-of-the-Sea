// Fishing points (design §3-3, §4-8). A point lists which species live there; the zone odds
// (odds.ts) decide the grade and size. Sea points are scattered on the top-down map
// (seaMap.ts → MAP_POINTS); every island also has a dock point for shore fishing.

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

/** Open-water species per sea. */
const SEA_POOL: Readonly<Record<SeaColor, readonly string[]>> = {
  jade: ["anchovy", "sardine", "halfbeak", "mackerel", "horse_mackerel", "mullet", "pufferfish", "herring", "black_seabream", "needlefish", "sea_bass", "koi", "red_seabream", "golden_seabream"],
  azure: ["mackerel", "saury", "filefish", "conger", "horse_mackerel", "sea_bass", "spanish_mackerel", "yellowtail", "opaleye", "red_seabream", "striped_beakfish", "salmon", "golden_seabream"],
  indigo: ["cutlassfish", "greenling", "scorpionfish", "skipjack", "yellowtail", "moray", "opaleye", "salmon", "bluefin_tuna", "sunfish", "ghost_cutlass"],
  ink: ["dark_rockfish", "scorpionfish", "cutlassfish", "anglerfish", "pike_conger", "moray", "lantern_angler", "sunfish", "ghost_cutlass"],
};

/** Shore species per sea (dock fishing). */
const DOCK_POOL: Readonly<Record<SeaColor, readonly string[]>> = {
  jade: ["anchovy", "sardine", "gizzard_shad", "goby", "filefish", "halfbeak", "rockfish", "pufferfish", "grass_puffer", "black_seabream", "porcupinefish", "red_seabream", "koi", "golden_seabream"],
  azure: ["mackerel", "saury", "filefish", "conger", "horse_mackerel", "greenling", "sea_bass", "opaleye", "red_seabream", "striped_beakfish", "golden_seabream"],
  indigo: ["cutlassfish", "greenling", "scorpionfish", "rockfish", "moray", "catfish", "opaleye", "salmon", "sunfish", "ghost_cutlass"],
  ink: ["dark_rockfish", "scorpionfish", "pike_conger", "anglerfish", "catfish", "lantern_angler", "ghost_cutlass"],
};

/** Shallow shore water: fewer rare and big fish than open water. */
const DOCK_ODDS: OddsMod = { grade: { rare: 0.8, legendary: 0.5 }, size: { A: 0.8, S: 0.6 } };

const SEA_POINT_NAME: Readonly<Record<SeaColor, string>> = { jade: "옥빛 여울", azure: "청빛 물골", indigo: "남빛 낭떠러지", ink: "먹빛 골짜기" };

export const POINTS: readonly FishingPoint[] = [
  ...ISLANDS.map((i): FishingPoint => ({ id: i.dockPoint, name: `${i.name} 선착장`, kind: "dock", sea: i.sea, pool: DOCK_POOL[i.sea], odds: DOCK_ODDS })),
  ...(Object.keys(SEA_POOL) as SeaColor[]).map((sea): FishingPoint => ({ id: `${sea}_1`, name: SEA_POINT_NAME[sea], kind: "sea", sea, pool: SEA_POOL[sea], deep: sea === "ink" })),
];

export const POINT_BY_ID: Readonly<Record<string, FishingPoint>> = Object.fromEntries(POINTS.map((p) => [p.id, p]));

/** Pollutant boss per sea color (design §4-5: tier follows the sea). */
export const POLLUTANT_BY_SEA: Readonly<Record<SeaColor, string>> = {
  jade: "plastic_mullet",
  azure: "oil_mackerel_king",
  indigo: "net_shark",
  ink: "drum_whale",
};

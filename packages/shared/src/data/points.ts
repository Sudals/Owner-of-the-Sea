// Fishing points (design §3-3, §4-8). Placeholder set until the island list and the top-down
// sea map are decided (TBD): one dock point plus one point per sea color.
// A point lists which species live there; the zone odds (odds.ts) decide the grade and size.

import type { OddsMod } from "./odds";

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
  /** Until the top-down map exists: whether this point counts as a dark deep-sea tile. */
  deep?: boolean;
};

export const POINTS: readonly FishingPoint[] = [
  {
    id: "tbd_1_dock", name: "시작 섬 선착장", kind: "dock", sea: "jade",
    pool: ["anchovy", "sardine", "gizzard_shad", "goby", "filefish", "halfbeak", "rockfish", "pufferfish", "grass_puffer", "black_seabream", "porcupinefish", "red_seabream", "koi", "golden_seabream"],
    odds: { grade: { rare: 0.8, legendary: 0.5 }, size: { A: 0.8, S: 0.6 } }, // shallow shore water
  },
  {
    id: "jade_1", name: "옥빛 여울", kind: "sea", sea: "jade",
    pool: ["anchovy", "sardine", "halfbeak", "mackerel", "horse_mackerel", "mullet", "pufferfish", "herring", "black_seabream", "needlefish", "sea_bass", "koi", "red_seabream", "golden_seabream"],
  },
  {
    id: "azure_1", name: "청빛 물골", kind: "sea", sea: "azure",
    pool: ["mackerel", "saury", "filefish", "conger", "horse_mackerel", "sea_bass", "spanish_mackerel", "yellowtail", "opaleye", "red_seabream", "striped_beakfish", "salmon", "golden_seabream"],
  },
  {
    id: "indigo_1", name: "남빛 낭떠러지", kind: "sea", sea: "indigo",
    pool: ["cutlassfish", "greenling", "scorpionfish", "skipjack", "yellowtail", "moray", "opaleye", "salmon", "bluefin_tuna", "sunfish", "ghost_cutlass"],
  },
  {
    id: "ink_1", name: "먹빛 골짜기", kind: "sea", sea: "ink", deep: true,
    pool: ["dark_rockfish", "scorpionfish", "cutlassfish", "anglerfish", "pike_conger", "moray", "lantern_angler", "sunfish", "ghost_cutlass"],
  },
];

export const POINT_BY_ID: Readonly<Record<string, FishingPoint>> = Object.fromEntries(POINTS.map((p) => [p.id, p]));

/** Pollutant boss per sea color (design §4-5: tier follows the sea). */
export const POLLUTANT_BY_SEA: Readonly<Record<SeaColor, string>> = {
  jade: "plastic_mullet",
  azure: "oil_mackerel_king",
  indigo: "net_shark",
  ink: "drum_whale",
};

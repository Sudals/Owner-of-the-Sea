// Gameplay data for every catchable creature (design §4). Ids match the sprite ids in
// packages/sprites (fish.png / pollutants.png). Visuals live there; numbers live here.

export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "boss";

export type FishData = {
  id: string;
  name: string;
  rarity: Rarity;
  /** Size range in cm; rosters roll inside it (bigger is rarer). */
  size: readonly [number, number];
  /** 1–10: how hard it pulls in the tension minigame. */
  power: number;
  /** 0–1: how often it thrashes (sudden tension spikes). */
  erratic: number;
  /** Sprite sheet the art lives in. */
  sheet: "fish" | "pollutants";
  /** Pollutant tier for bosses (design §4-5). */
  tier?: "C" | "B" | "A" | "S";
};

const f = (id: string, name: string, rarity: Rarity, size: [number, number], power: number, erratic: number): FishData => ({
  id, name, rarity, size, power, erratic, sheet: "fish",
});

export const FISH: readonly FishData[] = [
  f("anchovy", "멸치", "common", [6, 15], 1, 0.2),
  f("sardine", "정어리", "common", [12, 25], 1.5, 0.2),
  f("gizzard_shad", "전어", "common", [15, 30], 2, 0.3),
  f("herring", "청어", "common", [20, 40], 2, 0.2),
  f("goby", "망둥어", "common", [8, 20], 1, 0.4),
  f("red_seabream", "참돔", "rare", [30, 90], 6, 0.4),
  f("black_seabream", "감성돔", "uncommon", [25, 55], 5, 0.5),
  f("striped_beakfish", "돌돔", "rare", [25, 60], 7, 0.5),
  f("filefish", "쥐치", "common", [15, 35], 3, 0.5),
  f("opaleye", "벵에돔", "uncommon", [25, 50], 5, 0.6),
  f("koi", "비단잉어", "rare", [40, 90], 4, 0.3),
  f("golden_seabream", "황금 참돔", "legendary", [60, 110], 9.5, 0.7),
  f("saury", "꽁치", "common", [25, 40], 2, 0.3),
  f("halfbeak", "학공치", "common", [25, 40], 2, 0.5),
  f("needlefish", "동갈치", "uncommon", [50, 100], 4, 0.7),
  f("mackerel", "고등어", "common", [25, 45], 3, 0.5),
  f("horse_mackerel", "전갱이", "common", [20, 40], 3, 0.4),
  f("mullet", "숭어", "common", [30, 70], 4, 0.4),
  f("sea_bass", "농어", "uncommon", [40, 100], 6, 0.5),
  f("salmon", "연어", "rare", [50, 90], 7, 0.4),
  f("spanish_mackerel", "삼치", "uncommon", [50, 100], 6, 0.4),
  f("yellowtail", "방어", "uncommon", [50, 110], 7, 0.4),
  f("skipjack", "가다랑어", "uncommon", [40, 80], 6, 0.3),
  f("bluefin_tuna", "참다랑어", "rare", [100, 250], 10, 0.3),
  f("conger", "붕장어", "common", [40, 100], 4, 0.6),
  f("moray", "곰치", "uncommon", [60, 150], 6, 0.7),
  f("pike_conger", "갯장어", "uncommon", [60, 150], 5, 0.6),
  f("cutlassfish", "갈치", "common", [60, 150], 4, 0.4),
  f("ghost_cutlass", "유령 갈치", "legendary", [120, 200], 9, 0.85),
  f("pufferfish", "복어", "common", [15, 35], 2, 0.6),
  f("grass_puffer", "졸복", "common", [10, 20], 1, 0.6),
  f("porcupinefish", "가시복", "uncommon", [20, 45], 3, 0.6),
  f("sunfish", "개복치", "rare", [100, 300], 9, 0.1),
  f("rockfish", "우럭", "common", [20, 50], 4, 0.3),
  f("scorpionfish", "쏨뱅이", "common", [15, 30], 3, 0.4),
  f("greenling", "쥐노래미", "common", [20, 50], 4, 0.4),
  f("dark_rockfish", "볼락", "common", [15, 30], 3, 0.3),
  f("catfish", "메기", "uncommon", [40, 100], 5, 0.3),
  f("anglerfish", "아귀", "uncommon", [40, 100], 5, 0.2),
  f("lantern_angler", "초롱아귀", "rare", [20, 40], 4, 0.5),
  // pollutant bosses (design §4-5) — always alone in a roster
  { id: "plastic_mullet", name: "비닐감긴 숭어", rarity: "boss", size: [60, 90], power: 6, erratic: 0.7, sheet: "pollutants", tier: "C" },
  { id: "oil_mackerel_king", name: "기름먹은 고등어떼왕", rarity: "boss", size: [60, 100], power: 7, erratic: 0.8, sheet: "pollutants", tier: "B" },
  { id: "net_shark", name: "그물을 끄는 상어", rarity: "boss", size: [200, 400], power: 9, erratic: 0.8, sheet: "pollutants", tier: "A" },
  { id: "drum_whale", name: "드럼통 고래", rarity: "boss", size: [800, 1200], power: 10, erratic: 0.6, sheet: "pollutants", tier: "S" },
];

export const FISH_BY_ID: Readonly<Record<string, FishData>> = Object.fromEntries(FISH.map((x) => [x.id, x]));

/** Special fish appear alone (design §4-8): legendary and pollutant bosses. */
export const isSpecial = (x: FishData) => x.rarity === "legendary" || x.rarity === "boss";

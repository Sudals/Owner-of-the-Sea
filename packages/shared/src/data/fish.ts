// Gameplay data for every catchable creature (design §4). Ids match the sprite ids in
// packages/sprites (fish.png / pollutants.png). The numbers live in balance.jsonc.

import { derived, live } from "../balance";

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

/** Every species, from balance.jsonc `fish` (names, grades, sizes, pull) — always the current balance. */
export const FISH: readonly FishData[] = live(
  derived((b) =>
    Object.entries(b.fish).map(([id, x]): FishData => ({
      id,
      name: x.name,
      rarity: x.grade,
      size: x.sizeCm,
      power: x.power,
      erratic: x.erratic,
      sheet: x.grade === "boss" ? "pollutants" : "fish",
      ...(x.tier && x.tier !== "SS" ? { tier: x.tier } : {}),
    })),
  ),
  [],
);

export const FISH_BY_ID: Readonly<Record<string, FishData>> = live(derived(() => Object.fromEntries(FISH.map((x) => [x.id, x]))));

/** Special fish appear alone (design §4-8): legendary and pollutant bosses. */
export const isSpecial = (x: FishData) => x.rarity === "legendary" || x.rarity === "boss";

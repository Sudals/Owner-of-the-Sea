import { z } from "zod";

// The shape of balance.jsonc (repo root). `pnpm balance:check` / `balance:apply` validate the
// file against this before anything ships; the server re-validates what it loads from the DB.

const grades = ["common", "uncommon", "rare", "legendary"] as const;
const sizes = ["D", "C", "B", "A", "S"] as const;
const seas = ["jade", "azure", "indigo", "ink"] as const;
const tiers = ["C", "B", "A", "S", "SS"] as const;
const weight = z.number().min(0);
const mult = z.number().min(0).max(100);

const gradeWeights = z.object({ common: weight, uncommon: weight, rare: weight, legendary: weight }).strict();
const sizeWeights = z.object({ D: weight, C: weight, B: weight, A: weight, S: weight }).strict();
const perSea = <T extends z.ZodType>(t: T) => z.object({ jade: t, azure: t, indigo: t, ink: t }).strict();
const oddsMod = z
  .object({
    grade: z.object({ common: mult, uncommon: mult, rare: mult, legendary: mult }).partial().strict().optional(),
    size: z.object({ D: mult, C: mult, B: mult, A: mult, S: mult }).partial().strict().optional(),
  })
  .strict();
const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, "범위는 [작은 값, 큰 값] 순서여야 해요");

export const ITEM_KINDS = ["bait", "rod", "line", "hull", "tank", "ice", "hold", "consumable"] as const;

export const fishSchema = z
  .object({
    name: z.string().min(1),
    grade: z.enum(["common", "uncommon", "rare", "legendary", "boss"]),
    tier: z.enum(tiers).optional(),
    sizeCm: range,
    power: z.number().min(0.1).max(20),
    erratic: z.number().min(0).max(1),
    price: z.number().min(0).max(10),
    deep: z.boolean().optional(),
  })
  .strict();

const marketSchema = z
  .object({
    buy: z.object({ small: mult, large: mult, deep: mult, relic: mult, polluted: mult }).partial().strict(),
    trashFlat: z.number().min(0).optional(),
    volatility: z.number().min(0).max(1),
    specials: z.number().int().min(0).max(10),
    specialMult: mult,
    saltedFullPrice: z.boolean().optional(),
    collector: mult.optional(),
    items: mult,
    itemOverride: z.record(z.string(), mult).optional(),
    shop: z.array(z.string()),
    fuel: mult.nullable(),
    repair: mult.nullable(),
    freeRepair: z.boolean().optional(),
    dailyWorms: z.number().int().min(0).optional(),
    appraise: z.number().min(0).optional(),
    toll: z.number().min(0).optional(),
    keeper: z.string(),
    line: z.string(),
  })
  .strict();

const itemSchema = z
  .object({
    kind: z.enum(ITEM_KINDS),
    name: z.string(),
    desc: z.string(),
    price: z.number().min(0),
    level: z.number().int().min(1).max(10).optional(),
    bundle: z.number().int().min(1).optional(),
    max: z.number().int().min(1).optional(),
  })
  .strict();

const baitSchema = oddsMod.extend({ largeFish: mult.optional(), onlyDeep: z.boolean().optional(), rot: mult.optional(), waitMul: mult.optional() }).strict();

const perGradeSea = perSea(z.number().min(0));

export const balanceSchema = z
  .object({
    fish: z.record(z.string(), fishSchema),
    fishing: z
      .object({
        waitSec: range,
        biteWindowSec: z.number().min(0.1).max(5),
        zoneOdds: perSea(z.object({ grade: gradeWeights, size: sizeWeights }).strict()),
        sizeBands: z.object({ D: range, C: range, B: range, A: range, S: range }).strict(),
        dockOdds: oddsMod,
        deepTileBonus: oddsMod,
        stormBonus: oddsMod,
        pools: z.object({ sea: perSea(z.array(z.string()).min(1)), dock: perSea(z.array(z.string()).min(1)) }).strict(),
        pollutantBySea: perSea(z.string()),
        bait: z.record(z.string(), baitSchema),
        /** Optional: a balance without it never rolls trash (and rolls exactly as before it existed). */
        trash: z
          .object({
            chance: perSea(z.number().min(0).max(0.9)),
            dockBonus: z.number().min(0).max(0.5),
            kinds: z.record(
              z.string(),
              z
                .object({
                  name: z.string().min(1),
                  weight: z.number().min(0),
                  sizeCm: range,
                  power: z.number().min(0.1).max(20),
                  erratic: z.number().min(0).max(1),
                  bySea: z.object({ jade: z.number().min(0), azure: z.number().min(0), indigo: z.number().min(0), ink: z.number().min(0) }).partial().strict().optional(),
                })
                .strict(),
            ),
          })
          .strict()
          .optional(),
      })
      .strict(),
    reel: z
      .object({
        slackLimit: z.number().positive(),
        holdRise: z.number().positive(),
        pullRise: z.number().min(0),
        releaseFall: z.number().positive(),
        minFall: z.number().min(0),
        bossMult: z.number().positive(),
        baseSpeed: z.number().positive(),
        rodSpeed: z.array(z.number().positive()).min(1),
        lineMax: z.array(z.number().positive()).min(1),
      })
      .strict(),
    boat: z
      .object({
        hulls: z.record(z.string(), z.object({ name: z.string(), hp: z.number().int().positive(), speed: z.number().positive(), radius: z.number().positive() }).strict()),
        tankCap: z.record(z.string(), z.number().positive()),
        fuelPerTile: z.number().min(0),
        rowFactor: z.number().min(0).max(1),
        impact: z.object({ minSpeed: z.number().min(0), reefPctAtTop: z.number().min(0).max(1), shorePctAtTop: z.number().min(0).max(1) }).strict(),
        stormDamagePctPerMin: z.number().min(0).max(1),
        freshDecayPerMin: z.array(z.number().min(0)).min(1),
        holdCap: z.record(z.string(), z.number().int().positive()),
        towLossRate: z.number().min(0).max(1),
      })
      .strict(),
    economy: z
      .object({
        start: z.object({ gold: z.number().int().min(0), worms: z.number().int().min(0) }).strict(),
        basePrice: z.object({ common: perGradeSea, uncommon: perGradeSea, rare: perGradeSea, legendary: perGradeSea }).strict(),
        bossBasePrice: z.object({ C: z.number().min(0), B: z.number().min(0), A: z.number().min(0), S: z.number().min(0), SS: z.number().min(0) }).strict(),
        sizeMult: z.object({ D: mult, C: mult, B: mult, A: mult, S: mult }).strict(),
        largeFromCm: z.number().positive(),
        freshBands: z.array(z.object({ from: z.number().min(0).max(100), name: z.string(), mult }).strict()).min(1),
        saltedMult: mult,
        demand: z
          .object({ freeCount: z.number().min(0), stepPerFish: z.number().min(0).max(1), floor: z.number().min(0).max(1), recoverMinPerFish: z.number().positive(), steady: z.number().min(0), short: z.number().min(0) })
          .strict(),
        fuelUnitPrice: z.number().min(0),
        repairPerHp: z.record(z.string(), z.number().min(0)),
        repairKitPrice: z.record(z.string(), z.number().min(0)),
        towFeeRate: z.number().min(0),
        openIslands: z.array(z.string()),
        markets: z.record(z.string(), marketSchema),
        items: z.record(z.string(), itemSchema),
      })
      .strict(),
    scoring: z
      .object({
        basePoints: gradeWeights,
        trashPoints: z.number().min(0),
        sizeMult: sizeWeights,
        seaMult: perSea(z.number().min(0)),
        weatherMult: z.object({ clear: z.number().min(0), storm: z.number().min(0) }).strict(),
        bossScoreMult: z.object({ C: z.number(), B: z.number(), A: z.number(), S: z.number() }).strict(),
        omen: z
          .object({
            firstThreshold: z.number().positive(),
            thresholdGrowth: z.number().positive(),
            baseChance: z.number().min(0).max(1),
            pityStep: z.number().min(0).max(1),
            guaranteedWithinCasts: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((b, ctx) => {
    // cross-references: every id named somewhere must exist
    const fish = new Set(Object.keys(b.fish));
    const items = new Set(Object.keys(b.economy.items));
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    for (const kind of ["sea", "dock"] as const)
      for (const sea of seas) b.fishing.pools[kind][sea].forEach((id, i) => fish.has(id) || bad(["fishing", "pools", kind, sea, i], `없는 물고기: ${id}`));
    for (const sea of seas) if (!fish.has(b.fishing.pollutantBySea[sea])) bad(["fishing", "pollutantBySea", sea], `없는 물고기: ${b.fishing.pollutantBySea[sea]}`);
    for (const id of Object.keys(b.fishing.bait)) if (id !== "none" && !items.has(id)) bad(["fishing", "bait", id], `items에 없는 미끼: ${id}`);
    for (const [isl, m] of Object.entries(b.economy.markets)) {
      m.shop.forEach((id, i) => items.has(id) || bad(["economy", "markets", isl, "shop", i], `없는 아이템: ${id}`));
      for (const id of Object.keys(m.itemOverride ?? {})) if (!items.has(id)) bad(["economy", "markets", isl, "itemOverride", id], `없는 아이템: ${id}`);
    }
    b.economy.openIslands.forEach((id, i) => b.economy.markets[id] || bad(["economy", "openIslands", i], `markets에 없는 섬: ${id}`));
    for (const [id, f] of Object.entries(b.fish)) if (f.grade === "boss" && !f.tier) bad(["fish", id, "tier"], "오염체는 tier가 필요해요");
    for (const lv of ["1", "2", "3", "4"]) if (!b.boat.hulls[lv]) bad(["boat", "hulls", lv], "선체 Lv1~4가 모두 필요해요");
    for (const id of Object.keys(b.fishing.trash?.kinds ?? {})) if (fish.has(id)) bad(["fishing", "trash", "kinds", id], `물고기와 같은 id: ${id}`);
  });

export type Balance = z.infer<typeof balanceSchema>;

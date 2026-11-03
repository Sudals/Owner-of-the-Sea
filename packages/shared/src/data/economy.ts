// Economy — Economy.md (경제 · 상점 · 시세 상세 설계). Every number lives in balance.jsonc `economy`.
// One module the client (to show prices and play) and the server (to confirm a save) both use:
// "계산은 공유 코드, 확정은 서버" (Economy.md §1-5, §8-1).

import { balance, live } from "../balance";
import { hash32, stream } from "../rng";
import { sizeGradeOf } from "../cast";
import { FRESH_DECAY_PER_MIN, fuelMax, HULLS, type HullLv } from "./boat";
import { FISH_BY_ID, type FishData } from "./fish";
import type { SizeGrade } from "./odds";
import { POINT_BY_ID, POINTS, type SeaColor } from "./points";
import { ISLAND_BY_ID, mapPoints } from "./seaMap";

// ── 2-2 어종 기본가 (등급 × 바다 색) ──────────────────────────────────────────


/** Each species sits within ±20% of its grade × sea value (balance.jsonc fish.*.price). */
export function speciesFactor(fishId: string): number {
  return balance().fish[fishId]?.price ?? 1;
}

/** 2-3 크기 배율 */
export const SIZE_PRICE_MULT: Readonly<Record<SizeGrade, number>> = live(() => balance().economy.sizeMult);

// ── 2-4 카테고리 ──

export type Category = "small" | "large" | "deep" | "relic" | "trash" | "polluted";
export const CATEGORY_NAME: Readonly<Record<Category, string>> = { small: "소형", large: "대형", deep: "심해어", relic: "유물", trash: "쓰레기", polluted: "오염체" };
export function categoryOf(f: FishData): Category {
  if (f.trash) return "trash";
  if (f.rarity === "boss") return "polluted";
  if (balance().fish[f.id]?.deep) return "deep";
  return (f.size[0] + f.size[1]) / 2 >= balance().economy.largeFromCm ? "large" : "small";
}

/** The sea a catch came from (its base price): map point → its pool's sea; island dock → the island's sea. */
export function seaOfSpot(spotId: string): SeaColor {
  const mp = mapPoints().find((p) => p.id === spotId);
  if (mp) return POINT_BY_ID[mp.pointId]?.sea ?? "jade";
  return POINT_BY_ID[spotId]?.sea ?? ISLAND_BY_ID[spotId.replace(/_dock$/, "")]?.sea ?? "jade";
}

/** Base price of one fish before the island: grade × sea × species × size grade. */
export function basePrice(fishId: string, sizeCm: number, sea: SeaColor): number {
  const f = FISH_BY_ID[fishId];
  if (!f) return 0;
  const e = balance().economy;
  const base = f.rarity === "boss" ? e.bossBasePrice[f.tier ?? "C"] : e.basePrice[f.rarity][sea] * speciesFactor(fishId);
  return base * SIZE_PRICE_MULT[sizeGradeOf(fishId, sizeCm)];
}

// ── 2-5 신선도 ──
// The freshness clock is WorldState.seaTime: seconds of play, running at sea, docked and fishing
// alike (Economy.md: "멈춤 없이 계속 떨어진다").

export type HoldLike = {
  id?: string;
  fishId: string;
  sizeCm: number;
  spotId?: string;
  /** Clock value when caught. */
  freshAt?: number;
  /** Rot speed multiplier (검은 미끼 ×1.5). */
  rot?: number;
  /** 소금 절임: freshness frozen at this % (and the price ×0.9). */
  salted?: number;
};

/** 0–100 % */
export function freshnessPct(item: HoldLike, clock: number, iceLv: number): number {
  if (item.salted !== undefined) return item.salted;
  const perMin = FRESH_DECAY_PER_MIN[Math.max(0, Math.min(FRESH_DECAY_PER_MIN.length - 1, iceLv))]! * (item.rot ?? 1);
  return Math.max(0, Math.min(100, 100 - ((clock - (item.freshAt ?? clock)) / 60) * perMin));
}

export function freshnessBand(pct: number): { name: string; mult: number } {
  const bands = [...balance().economy.freshBands].sort((a, b) => b.from - a.from);
  return bands.find((b) => pct >= b.from) ?? bands[bands.length - 1]!;
}


// ── 2-6 수요 배율 · 3-2 일일 변동 · 3-3 특가 ──

/** "2026-11-03" in KST (Economy.md §3-2: prices turn over at KST midnight, not game time). */
export function kstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000 + devDays * 86_400_000).toISOString().slice(0, 10);
}

/** Dev cheat (Economy.md §9 "날짜 바꾸기"): shift the client's market date to check prices.
 *  The server never shifts, so in the full build its date still decides. */
let devDays = 0;
export function devShiftDays(d: number): number {
  devDays += d;
  return devDays;
}

/** players.market_log (Economy.md §2-6, §8-2): recent sales per `${island}:${fishId}` as
 *  [count, ms when last updated] — recovery is computed on read, so nothing needs scheduling —
 *  plus the KST date 덕배 할멈 last handed out worms. */
export type MarketLog = { demand: Record<string, [number, number]>; gift?: string };
export const emptyLog = (): MarketLog => ({ demand: {} });
/** Any stored shape (older saves had a per-day count) → today's shape. */
export function normalizeLog(raw: unknown): MarketLog {
  const r = (raw ?? {}) as { demand?: Record<string, [number, number]>; gift?: string };
  return { demand: r.demand && typeof r.demand === "object" ? { ...r.demand } : {}, ...(typeof r.gift === "string" ? { gift: r.gift } : {}) };
}

/** Recent sales of one species at one island right now (recovering one per `recoverMinPerFish` minutes). */
export function recentSold(log: MarketLog, islandId: string, fishId: string, now: number): number {
  const e = log.demand[`${islandId}:${fishId}`];
  if (!e) return 0;
  const d = balance().economy.demand;
  return Math.max(0, e[0] - (now - e[1]) / 60_000 / d.recoverMinPerFish);
}

/** Price multiplier for the n-th fish (1-based) sold now, given the recent count (Economy.md §2-6). */
export function demandMult(recent: number, n: number): number {
  const d = balance().economy.demand;
  return Math.max(d.floor, 1 - d.stepPerFish * Math.max(0, recent + n - d.freeCount));
}

/** 충분 / 보통 / 부족 for the sale screen. */
export function demandLabel(recent: number): "충분" | "보통" | "부족" {
  const d = balance().economy.demand;
  return recent < d.steady ? "충분" : recent < d.short ? "보통" : "부족";
}

/** Record `k` sales; entries that recovered to zero are dropped (Economy.md §8-2). */
function noteSales(log: MarketLog, islandId: string, fishId: string, k: number, now: number): void {
  for (const [key, e] of Object.entries(log.demand)) {
    const [isl, fish] = key.split(":") as [string, string];
    if (recentSold(log, isl, fish, now) <= 0) delete log.demand[key];
    else if (!e) delete log.demand[key];
  }
  const recent = recentSold(log, islandId, fishId, now);
  log.demand[`${islandId}:${fishId}`] = [Math.round((recent + k) * 1000) / 1000, now];
}

// ── 3-1 섬별 매입 시세 · 5 섬별 상점 ──

export type ItemId =
  | "bait_worm" | "bait_shrimp" | "bait_lure" | "bait_big" | "bait_glow" | "bait_black"
  | "rod_2" | "rod_3" | "rod_4" | "rod_5"
  | "line_2" | "line_3" | "line_4" | "line_5"
  | "hull_2" | "hull_3" | "hull_4"
  | "tank_2" | "tank_3"
  | "ice_1" | "ice_2" | "ice_3"
  | "hold_2" | "hold_3" | "hold_4"
  | "repair_kit" | "salt" | "ice_chunk";

export type Market = {
  /** Fish buying multipliers per category; absent = not bought here. */
  buy: Partial<Record<Exclude<Category, "trash">, number>>;
  /** Trash bought at a flat price each. */
  trashFlat?: number;
  volatility: number;
  /** "오늘의 특가": how many species, and their multiplier. */
  specials: number;
  specialMult: number;
  /** 소금꽃섬: salted fish at full price (no ×0.9). */
  saltedFullPrice?: boolean;
  /** 유리탑섬 collectors: rare/legendary extra. */
  collector?: number;
  /** Item price multiplier, and the items that use another one (소금꽃섬 bait/salt/ice ×0.6). */
  items: number;
  itemOverride?: Partial<Record<ItemId, number>>;
  shop: readonly ItemId[];
  fuel: number | null;
  repair: number | null;
  /** 덕배 할멈's 20 worms a day. */
  dailyWorms?: number;
  appraise?: number;
  toll?: number;
  keeper: string;
  line: string;
};

export const MARKETS: Readonly<Record<string, Market>> = live(() => balance().economy.markets as Record<string, Market>);

/** Villages open for business (balance.jsonc economy.openIslands; the rest open with their stories, M7). */
export const isOpen = (islandId: string): boolean => balance().economy.openIslands.includes(islandId);

export const marketOf = (islandId: string): Market | null => (isOpen(islandId) ? (MARKETS[islandId] ?? null) : null);

// ── 4 아이템 카탈로그 ──

export type ItemKind = "bait" | "rod" | "line" | "hull" | "tank" | "ice" | "hold" | "consumable";
export type ItemDef = { kind: ItemKind; name: string; desc: string; price: number; level?: number; bundle?: number; max?: number };

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = live(() => balance().economy.items as Record<ItemId, ItemDef>);

/** 화물칸 capacity by level (balance.jsonc boat.holdCap). */
export const HOLD_CAP: Readonly<Record<number, number>> = live(() => balance().boat.holdCap);
export const holdCap = (holdLv: number): number => HOLD_CAP[holdLv] ?? HOLD_CAP[1]!;

/** Reel speed / tension max multipliers by rod / line level (balance.jsonc reel.rodSpeed / lineMax, Lv1 first). */
export const rodSpeed = (lv: number): number => {
  const a = balance().reel.rodSpeed;
  return a[Math.max(0, Math.min(a.length - 1, lv - 1))]!;
};
export const lineMax = (lv: number): number => {
  const a = balance().reel.lineMax;
  return a[Math.max(0, Math.min(a.length - 1, lv - 1))]!;
};

/** New game: gold and worms (balance.jsonc economy.start). */
export const START: Readonly<{ gold: number; worms: number }> = live(() => balance().economy.start);

// ── 2-1 판매가 ──

/** Daily swing for one island × category (KST date seed, Economy.md §3-2). */
export function dailyMod(date: string, islandId: string, category: Category): number {
  const vol = MARKETS[islandId]?.volatility ?? 0;
  if (!vol) return 1;
  return 1 + (stream(hash32(`${date}|${islandId}|${category}`))() * 2 - 1) * vol;
}

/** Species of the island's sea, sorted — the pool 오늘의 특가 is drawn from. */
function seaSpecies(sea: SeaColor): string[] {
  return [...new Set(POINTS.filter((p) => p.sea === sea).flatMap((p) => p.pool))].filter((id) => FISH_BY_ID[id] && FISH_BY_ID[id]!.rarity !== "boss").sort();
}

/** 오늘의 특가 (Economy.md §3-3): N species of the island's sea, picked by the date. */
export function todaySpecials(date: string, islandId: string): string[] {
  const m = MARKETS[islandId], isl = ISLAND_BY_ID[islandId];
  if (!m?.specials || !isl) return [];
  const pool = seaSpecies(isl.sea);
  const r = stream(hash32(`special|${date}|${islandId}`));
  const out: string[] = [];
  while (out.length < Math.min(m.specials, pool.length)) {
    const id = pool[Math.floor(r() * pool.length)]!;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Would this island buy this fish at all? */
export function buys(islandId: string, fishId: string): boolean {
  const m = MARKETS[islandId], f = FISH_BY_ID[fishId];
  if (!m || !f) return false;
  const cat = categoryOf(f);
  return cat === "trash" ? !!m.trashFlat : m.buy[cat] !== undefined;
}

/** Price of one fish before demand (Economy.md §2-1, without the 수요 배율 and rounding). */
export function unitSalePrice(item: HoldLike, islandId: string, date: string, clock: number, iceLv: number): number {
  const m = MARKETS[islandId], f = FISH_BY_ID[item.fishId];
  if (!m || !f) return 0;
  const cat = categoryOf(f);
  if (cat === "trash") return m.trashFlat ?? 0; // 고물섬: a flat price, nothing else applies
  const catMult = m.buy[cat];
  if (catMult === undefined) return 0;
  let price = basePrice(item.fishId, item.sizeCm, seaOfSpot(item.spotId ?? "")) * catMult * dailyMod(date, islandId, cat);
  if (todaySpecials(date, islandId).includes(item.fishId)) price *= m.specialMult;
  if (cat !== "polluted") price *= freshnessBand(freshnessPct(item, clock, iceLv)).mult;
  if (item.salted !== undefined && !m.saltedFullPrice) price *= balance().economy.saltedMult;
  if (m.collector && (f.rarity === "rare" || f.rarity === "legendary")) price *= m.collector;
  return price;
}

export type SaleCtx = { date: string; now: number; clock: number; iceLv: number; log: MarketLog };

/** Gold for selling these fish here now, one by one with the 수요 배율 (floor each, min 1G). */
export function quoteSale(items: HoldLike[], islandId: string, ctx: SaleCtx): { total: number; each: number[] } {
  const nth = new Map<string, number>();
  const each = items.map((h) => {
    const base = unitSalePrice(h, islandId, ctx.date, ctx.clock, ctx.iceLv);
    if (!base) return 0;
    if (FISH_BY_ID[h.fishId]?.trash) return Math.floor(base); // 쓰레기: a flat price, no 수요
    const n = (nth.get(h.fishId) ?? 0) + 1;
    nth.set(h.fishId, n);
    return Math.max(1, Math.floor(base * demandMult(recentSold(ctx.log, islandId, h.fishId, ctx.now), n)));
  });
  return { total: each.reduce((a, b) => a + b, 0), each };
}

/** Price of one purchase (a bundle of bait, one upgrade, one kit) at an island: base × bundle × the
 *  island's multiplier, rounded up, at least 1G (Economy.md §4). The 수리 키트 follows the hull. */
export function itemPrice(islandId: string, item: ItemId, hullLv: number): number {
  const m = MARKETS[islandId];
  const mult = m?.itemOverride?.[item] ?? m?.items ?? 1;
  const def = ITEMS[item];
  const base = item === "repair_kit" ? (balance().economy.repairKitPrice[String(hullLv)] ?? 20) : def.price * (def.bundle ?? 1);
  return Math.max(1, Math.ceil(base * mult - 1e-9));
}

// ── trades ──

export type ShopOp =
  | { kind: "sell"; island: string; ids: string[]; t: number }
  | { kind: "buy"; island: string; item: ItemId; t: number }
  | { kind: "fuel"; island: string; t: number }
  | { kind: "repair"; island: string; t: number }
  | { kind: "gift"; island: string; t: number }
  | { kind: "tow"; island: string; t: number };

/** Everything a trade can touch. */
export type Ledger = {
  gold: number;
  hold: HoldLike[];
  inventory: Partial<Record<ItemId, number>>;
  rodLv: number;
  lineLv: number;
  hullLv: HullLv;
  hullHp: number;
  fuel: number;
  tankLv: number;
  iceLv: number;
  holdLv: number;
  /** Freshness clock (WorldState.seaTime). */
  clock: number;
  /** KST date of the trade (daily prices, the daily gift). */
  date: string;
  /** Wall clock (ms) of the trade — demand recovers with real time. */
  now: number;
  log: MarketLog;
};

export type OpResult = { ok: true; gold: number; message: string } | { ok: false; why: string; message: string };
const fail = (why: string, message: string): OpResult => ({ ok: false, why, message });

/** Level the player has for an upgrade line. */
function levelOf(l: Ledger, kind: ItemKind): number {
  switch (kind) {
    case "rod": return l.rodLv;
    case "line": return l.lineLv;
    case "hull": return l.hullLv;
    case "tank": return l.tankLv;
    case "ice": return l.iceLv;
    case "hold": return l.holdLv;
    default: return 0;
  }
}

/** Cost and reason-not for one purchase, as the shop shows it. */
export function quote(l: Ledger, islandId: string, item: ItemId): { cost: number; why?: string } {
  const def = ITEMS[item];
  if (def.level !== undefined) {
    const have = levelOf(l, def.kind);
    if (have >= def.level) return { cost: 0, why: "이미 있어요" };
    if (have !== def.level - 1) return { cost: 0, why: `Lv${def.level - 1}부터 차례로 살 수 있어요` };
  }
  if (def.max !== undefined && (l.inventory[item] ?? 0) >= def.max) return { cost: 0, why: `최대 ${def.max}개까지` };
  return { cost: itemPrice(islandId, item, l.hullLv) };
}

export function fuelQuote(l: Ledger, islandId: string): { qty: number; cost: number; why?: string } {
  const m = MARKETS[islandId];
  if (m?.fuel == null) return { qty: 0, cost: 0, why: "연료를 팔지 않아요" };
  const qty = Math.ceil(Math.max(0, fuelMax(l) - l.fuel));
  if (!qty) return { qty, cost: 0, why: "가득 찼어요" };
  return { qty, cost: Math.ceil(qty * balance().economy.fuelUnitPrice * m.fuel - 1e-9) };
}

/** Full repair at an island (Economy.md §4-6): missing HP × the hull's price per HP × the island. */
export function repairQuote(l: Ledger, islandId: string): { hp: number; cost: number; why?: string } {
  const m = MARKETS[islandId];
  if (m?.repair == null) return { hp: 0, cost: 0, why: "수리하지 않아요" };
  const hp = Math.max(0, HULLS[l.hullLv].hp - l.hullHp);
  if (!hp) return { hp, cost: 0, why: "고칠 곳이 없어요" };
  const perHp = balance().economy.repairPerHp[String(l.hullLv)] ?? 1;
  return { hp, cost: Math.ceil(hp * perHp * m.repair - 1e-9) };
}

/** Towed in with the hull at 0: full repair + a towing fee (half of it), down to 0G at most. */
export function towQuote(l: Ledger, islandId: string): number {
  const m = MARKETS[islandId];
  const perHp = balance().economy.repairPerHp[String(l.hullLv)] ?? 1;
  const full = HULLS[l.hullLv].hp * perHp * (m?.repair ?? 1);
  return Math.ceil(full * (1 + balance().economy.towFeeRate) - 1e-9);
}

/** Apply one trade to the ledger (mutates it on success). The client and the server run this same code. */
export function applyOp(l: Ledger, op: ShopOp): OpResult {
  const m = op.kind === "tow" ? (MARKETS[op.island] ?? null) : marketOf(op.island);
  if (!m) return fail("closed", "마을이 아직 문을 닫았어요");
  switch (op.kind) {
    case "sell": {
      const ids = new Set(op.ids);
      const items = l.hold.filter((h) => h.id && ids.has(h.id) && buys(op.island, h.fishId));
      if (!items.length) return fail("nothing", "여기서 팔 수 있는 물고기가 없어요");
      const { total } = quoteSale(items, op.island, { date: l.date, now: l.now, clock: l.clock, iceLv: l.iceLv, log: l.log });
      const per = new Map<string, number>();
      for (const h of items) per.set(h.fishId, (per.get(h.fishId) ?? 0) + 1);
      for (const [fishId, k] of per) noteSales(l.log, op.island, fishId, k, l.now);
      const sold = new Set(items.map((h) => h.id));
      l.hold = l.hold.filter((h) => !sold.has(h.id));
      l.gold += total;
      return { ok: true, gold: total, message: `${items.length}마리를 ${total}G에 팔았다` };
    }
    case "buy": {
      if (!m.shop.includes(op.item)) return fail("not_sold", "여기서는 팔지 않는 물건이에요");
      const q = quote(l, op.island, op.item);
      if (q.why) return fail("not_needed", q.why);
      if (l.gold < q.cost) return fail("gold", "골드가 모자라요");
      l.gold -= q.cost;
      const def = ITEMS[op.item];
      switch (def.kind) {
        case "rod": l.rodLv = def.level!; break;
        case "line": l.lineLv = def.level!; break;
        case "hull":
          l.hullLv = def.level as HullLv;
          l.hullHp = HULLS[l.hullLv].hp;
          break;
        case "tank": l.tankLv = def.level!; break;
        case "ice": l.iceLv = def.level!; break;
        case "hold": l.holdLv = def.level!; break;
        default: l.inventory[op.item] = (l.inventory[op.item] ?? 0) + (def.bundle ?? 1);
      }
      return { ok: true, gold: -q.cost, message: `${def.name}${def.bundle ? ` ${def.bundle}개` : ""} · ${q.cost}G` };
    }
    case "fuel": {
      const q = fuelQuote(l, op.island);
      if (q.why) return fail("not_needed", q.why);
      // a short purse buys what it can (Economy.md §1-4: never stuck)
      const unit = balance().economy.fuelUnitPrice * (m.fuel ?? 1);
      const qty = unit > 0 ? Math.min(q.qty, Math.floor(l.gold / unit)) : q.qty;
      if (qty <= 0) return fail("gold", "골드가 모자라요");
      const cost = Math.ceil(qty * unit - 1e-9);
      l.gold -= cost;
      l.fuel = Math.min(fuelMax(l), l.fuel + qty);
      return { ok: true, gold: -cost, message: `연료 ${qty} · ${cost}G` };
    }
    case "repair": {
      const q = repairQuote(l, op.island);
      if (q.why) return fail("not_needed", q.why);
      if (l.gold < q.cost) return fail("gold", "골드가 모자라요");
      l.gold -= q.cost;
      l.hullHp = HULLS[l.hullLv].hp;
      return { ok: true, gold: -q.cost, message: `수리 · ${q.cost}G` };
    }
    case "tow": {
      const cost = Math.min(l.gold, towQuote(l, op.island)); // no debt (Economy.md §4-6)
      l.gold -= cost;
      l.hullHp = HULLS[l.hullLv].hp;
      return { ok: true, gold: -cost, message: `견인·수리 · ${cost}G` };
    }
    case "gift": {
      if (!m.dailyWorms) return fail("no_gift", "여기서는 받을 게 없어요");
      if (l.log.gift === l.date) return fail("given", "오늘 지렁이는 이미 받았어요");
      l.log.gift = l.date;
      l.inventory.bait_worm = (l.inventory.bait_worm ?? 0) + m.dailyWorms;
      return { ok: true, gold: 0, message: `지렁이 ${m.dailyWorms}개를 받았다` };
    }
  }
}

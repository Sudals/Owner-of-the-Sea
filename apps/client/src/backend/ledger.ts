import type { CastRecord, DexEntry, Gear, HoldItem, Inventory, WorldState } from "@sea/game";
import { applyOp, balance, BARE_HOOK, FISH_BY_ID, kstDate, type Ledger, type MarketLog, type OpResult, type ShopOp } from "@sea/shared";

// Both backends trade through the same shared rules the server re-applies (shared/economy.ts).

export type Tradeable = { gold: number; hold: HoldItem[]; inventory: Inventory; gear: Gear; world: WorldState; log: MarketLog };

/** Apply a trade to live state in place (Economy.md §8-1: the same code the server replays). */
export function tradeOn(s: Tradeable, op: ShopOp): OpResult {
  const now = op.t;
  const l: Ledger = {
    gold: s.gold,
    hold: s.hold,
    inventory: { ...s.inventory },
    rodLv: s.gear.rodLv,
    lineLv: s.gear.lineLv,
    hullLv: s.world.hullLv,
    hullHp: s.world.hullHp,
    fuel: s.world.fuel,
    tankLv: s.world.tankLv,
    iceLv: s.world.iceLv,
    holdLv: s.world.holdLv,
    clock: s.world.seaTime,
    date: kstDate(now),
    now,
    log: structuredClone(s.log),
  };
  const r = applyOp(l, op);
  if (!r.ok) return r;
  s.gold = l.gold;
  s.hold = l.hold as HoldItem[];
  s.inventory = l.inventory;
  s.log = l.log;
  s.gear.rodLv = l.rodLv;
  s.gear.lineLv = l.lineLv;
  Object.assign(s.world, { hullLv: l.hullLv, hullHp: l.hullHp, fuel: l.fuel, tankLv: l.tankLv, iceLv: l.iceLv, holdLv: l.holdLv });
  return r;
}

/** A finished cast's effect on the boat (Economy.md §4-1): a bite eats the bait, a catch goes in the hold. */
export function castOn(s: { hold: HoldItem[]; inventory: Inventory; dex: DexEntry[] }, sessionId: string, spotId: string, cast: CastRecord, seaTime: number): void {
  const bait = cast.bait ?? "bait_worm";
  if (bait !== BARE_HOOK && cast.bit !== false) {
    const k = bait as keyof Inventory;
    s.inventory[k] = Math.max(0, (s.inventory[k] ?? 0) - 1);
  }
  if (cast.result !== "caught") return;
  const rot = balance().fishing.bait[bait]?.rot;
  s.hold.push({
    id: `${sessionId}:${cast.i}`,
    fishId: cast.fishId,
    sizeCm: cast.sizeCm,
    spotId,
    caughtAt: new Date(cast.t).toISOString(),
    freshAt: cast.seaT ?? seaTime,
    ...(rot ? { rot } : {}),
  });
  if (!FISH_BY_ID[cast.fishId]?.trash) addToDex(s.dex, cast.fishId, cast.sizeCm); // 쓰레기 isn't a species
}

/** Count a kept catch in the 도감. */
export function addToDex(dex: DexEntry[], fishId: string, sizeCm: number): void {
  const e = dex.find((d) => d.fishId === fishId);
  if (e) {
    e.count++;
    e.maxSizeCm = Math.max(e.maxSizeCm, sizeCm);
  } else dex.push({ fishId, count: 1, maxSizeCm: sizeCm });
}

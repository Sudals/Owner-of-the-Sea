import {
  buys, CATEGORY_NAME, categoryOf, dailyMod, demandLabel, FISH_BY_ID, freshnessBand, freshnessPct, fuelQuote, GRADE_LABEL, ITEMS, itemPrice, kstDate,
  marketOf, quote, quoteSale, recentSold, repairQuote, todaySpecials,
  type Category, type ItemId, type Ledger, type Market, type ShopOp,
} from "@sea/shared";
import { lutHex } from "../assets";
import type { HoldItem } from "../backend";
import type { Engine } from "../engine";
import type { Game } from "../game";
import type { Fx } from "../render/fx";
import { button, dim, fitText, inRect, panel, text } from "../render/ui";

// Trading in a village (Economy.md §2–5): the 시장 (sell the hold) and 상점 panels, and the
// Trader every service goes through — fuel, repairs, 덕배 할멈's worms. Trades run on the
// shared rules (backend.trade) and, in the full build, are saved when the panel closes
// (Economy.md §8-1: the server re-applies them).

export const BIG = { x: 22, y: 18, w: 596, h: 324 };
const ROW_H = 18;
const MARKET_ROWS = 11;
const SHOP_ROWS = 10;
const FONT_B = "bold 12px Galmuri11, monospace";

type TradeOp = { kind: "sell"; ids: string[] } | { kind: "buy"; item: ItemId } | { kind: "fuel" } | { kind: "repair" } | { kind: "gift" };

/** One island's trading: the ledger the panels read, trades with their effects, the save. */
export class Trader {
  /** Trades since the last save (full build: saved when the panel closes). */
  private traded = false;

  constructor(
    readonly game: Game,
    readonly islandId: string,
    private readonly fx: Fx,
    private readonly say: (s: string, bad?: boolean) => void,
    /** Where the purse is on screen (the +G / −G floater rises from it). */
    private readonly purse: () => [number, number],
  ) {}

  get market(): Market | null {
    return marketOf(this.islandId);
  }

  /** The trade view of everything on board (the same shape the shared rules and the server use). */
  ledger(): Ledger {
    const g = this.game, w = g.world, gear = g.backend.gear(), now = Date.now();
    return {
      gold: g.backend.gold(),
      hold: g.backend.hold(),
      inventory: { ...g.backend.inventory() },
      rodLv: gear.rodLv,
      lineLv: gear.lineLv,
      hullLv: w.hullLv,
      hullHp: w.hullHp,
      fuel: w.fuel,
      tankLv: w.tankLv,
      iceLv: w.iceLv,
      holdLv: w.holdLv,
      clock: w.seaTime,
      date: kstDate(now),
      now,
      log: g.backend.marketLog(),
    };
  }

  fuelQuote() {
    return fuelQuote(this.ledger(), this.islandId);
  }
  repairQuote() {
    return repairQuote(this.ledger(), this.islandId);
  }
  giftGiven(): boolean {
    const l = this.ledger();
    return l.log.gift === l.date;
  }

  trade(op: TradeOp): boolean {
    this.game.save(); // fuel/hull as they are now
    const r = this.game.backend.trade({ ...op, island: this.islandId, t: Date.now() } as ShopOp);
    this.say(r.message, !r.ok);
    if (!r.ok) {
      this.fx.shake(1.5);
      return false;
    }
    this.traded = true;
    const [px, py] = this.purse();
    if (r.gold > 0) {
      this.fx.text(px, py, `+${r.gold}G`, "yellow", { big: true, life: 1.6 });
      this.fx.burst(px - 10, py - 8, 18, { colors: ["white", "yellow", "sand1"], speed: [30, 90], g: 160, drag: 0.4, life: [0.5, 1] });
    } else if (r.gold < 0) this.fx.text(px, py, `${r.gold}G`, "coral", { big: true, life: 1.4 });
    if (op.kind === "gift") this.fx.text(px, py, r.message, "yellow", { life: 1.8 });
    return true;
  }

  /** Full build: send the trades now (the server re-applies them and confirms the gold). */
  flush(): void {
    if (!this.traded || !this.game.remote) return;
    this.traded = false;
    void this.game.commit("shop").then((r) => {
      if (!r.ok) this.game.flash(r.message, 3, lutHex("coral"));
    });
  }
}

type Row = { fishId: string; items: HoldItem[]; total: number; sellable: boolean; fresh: number; special: boolean; demand: string };

const rowRect = (market: boolean, i: number) => {
  const top = market ? BIG.y + 78 : BIG.y + 50;
  const h = market ? ROW_H : 24;
  return { x: BIG.x + 12, y: top + i * h, w: BIG.w - 24, h: h - 2 };
};
const sellAllRect = { x: BIG.x + 16, y: BIG.y + BIG.h - 30, w: 200, h: 20 };
const closeRect = { x: BIG.x + BIG.w - 96, y: BIG.y + BIG.h - 30, w: 80, h: 20 };

/** Shared list navigation for both panels: rows, then the bottom buttons. */
abstract class ListPanel {
  sel = 0;
  scroll = 0;
  closed = false;
  constructor(protected readonly trader: Trader) {}
  protected abstract count(): number;
  protected abstract visible: number;
  protected abstract extra: number; // bottom buttons, the last one is 닫기
  protected abstract act(index: number): void;
  protected abstract isMarket: boolean;

  update(engine: Engine): void {
    const input = engine.input;
    if (input.hit("Escape")) return void (this.closed = true);
    const n = this.count(), total = n + this.extra;
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d) this.sel = (this.sel + d + total * 4) % total;
    this.sel = Math.min(this.sel, total - 1);
    if (input.wheel) this.scroll += input.wheel;
    if (this.sel < n) {
      if (this.sel < this.scroll) this.scroll = this.sel;
      if (this.sel >= this.scroll + this.visible) this.scroll = this.sel - this.visible + 1;
    }
    this.scroll = Math.max(0, Math.min(Math.max(0, n - this.visible), this.scroll));
    let go = -1;
    if (input.clicked) {
      const c = input.clicked;
      for (let i = 0; i < Math.min(this.visible, n - this.scroll); i++) if (inRect(c, rowRect(this.isMarket, i))) go = this.scroll + i;
      if (this.isMarket && inRect(c, sellAllRect)) go = n;
      if (inRect(c, closeRect)) go = total - 1;
      if (go >= 0) this.sel = go;
    } else if (input.pressed) go = this.sel;
    if (go < 0) return;
    if (go === total - 1) return void (this.closed = true);
    this.act(go);
  }
}

export class MarketPanel extends ListPanel {
  protected visible = MARKET_ROWS;
  protected extra = 2;
  protected isMarket = true;

  rows(): Row[] {
    const t = this.trader, l = t.ledger(), id = t.islandId;
    const ctx = { date: l.date, now: l.now, clock: l.clock, iceLv: l.iceLv, log: l.log };
    const specials = todaySpecials(l.date, id);
    const groups = new Map<string, HoldItem[]>();
    for (const h of t.game.backend.hold()) (groups.get(h.fishId) ?? groups.set(h.fishId, []).get(h.fishId)!).push(h);
    const rows = [...groups].map(([fishId, items]): Row => {
      const sellable = buys(id, fishId);
      return {
        fishId,
        items,
        sellable,
        total: sellable ? quoteSale(items, id, ctx).total : 0,
        fresh: Math.round(items.reduce((n, h) => n + freshnessPct(h, l.clock, l.iceLv), 0) / items.length),
        special: specials.includes(fishId),
        demand: demandLabel(recentSold(l.log, id, fishId, l.now)),
      };
    });
    return rows.sort((a, b) => Number(b.sellable) - Number(a.sellable) || b.total - a.total);
  }

  protected count(): number {
    return this.rows().length;
  }

  protected act(go: number): void {
    const rows = this.rows(), n = rows.length;
    const pick = go === n ? rows.filter((r) => r.sellable) : rows[go] ? [rows[go]!] : [];
    if (!pick.length || !pick.some((r) => r.sellable)) return void this.trader.trade({ kind: "sell", ids: [] });
    this.trader.trade({ kind: "sell", ids: pick.flatMap((r) => r.items.map((h) => h.id).filter((x): x is string => !!x)) });
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets, t = this.trader, m = t.market!, l = t.ledger(), P = BIG;
    const ink = lutHex("ink"), muted = lutHex("bark2");
    dim(ctx, 0.45);
    panel(ctx, assets, "panel_paper", P.x, P.y, P.w, P.h);
    text(ctx, `${m.keeper}의 시장 · 물고기 팔기`, P.x + 16, P.y + 10, { color: lutHex("red2"), shadow: null, font: FONT_B });
    text(ctx, `보유 ${l.gold}G`, P.x + P.w - 16, P.y + 10, { align: "right", color: ink, shadow: null });
    // today's market: 특가 and the daily swing per category (Economy.md §3-2, §3-3)
    const specials = todaySpecials(l.date, t.islandId).map((id) => FISH_BY_ID[id]?.name ?? id);
    text(ctx, specials.length ? `오늘의 특가 ×${m.specialMult}: ${specials.join(", ")}` : "오늘의 특가 없음", P.x + 16, P.y + 28, { color: lutHex("red2"), shadow: null, maxW: P.w - 32 });
    const mods = (Object.keys(m.buy) as Exclude<Category, "trash">[]).map((c) => {
      const pct = Math.round((dailyMod(l.date, t.islandId, c) - 1) * 100);
      return `${CATEGORY_NAME[c]} ${pct > 0 ? `▲${pct}` : pct < 0 ? `▼${-pct}` : "—"}${pct ? "%" : ""}`;
    });
    text(ctx, `오늘 시세 · ${mods.join(" · ")}`, P.x + 16, P.y + 42, { color: muted, shadow: null, maxW: P.w - 32 });
    const cols = { name: P.x + 22, n: P.x + 200, fresh: P.x + 248, demand: P.x + 360, tag: P.x + 448, price: P.x + P.w - 22 };
    const hy = P.y + 62;
    for (const [k, label] of [["name", "어종"], ["n", "수"], ["fresh", "신선도"], ["demand", "수요"]] as const) text(ctx, label, cols[k], hy, { color: muted, shadow: null });
    text(ctx, "값", cols.price, hy, { align: "right", color: muted, shadow: null });
    const rows = this.rows();
    if (!rows.length) text(ctx, "창고가 비어 있어요", P.x + P.w / 2, P.y + 140, { align: "center", color: muted, shadow: null });
    rows.slice(this.scroll, this.scroll + MARKET_ROWS).forEach((row, i) => {
      const r = rowRect(true, i), idx = this.scroll + i;
      const f = FISH_BY_ID[row.fishId];
      if (idx === this.sel) {
        ctx.fillStyle = lutHex("sand1");
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const y = r.y + 3;
      const c = !row.sellable ? lutHex("gray1") : f?.rarity === "legendary" ? lutHex("red2") : f?.rarity === "rare" ? lutHex("sea1") : ink;
      const grade = f && (f.rarity === "rare" || f.rarity === "legendary") ? ` (${GRADE_LABEL[f.rarity]})` : "";
      text(ctx, `${f?.name ?? row.fishId}${grade}`, cols.name, y, { color: c, shadow: null, maxW: cols.n - cols.name - 8 });
      text(ctx, `×${row.items.length}`, cols.n, y, { color: c, shadow: null });
      const cat = f ? categoryOf(f) : null;
      if (cat !== "polluted" && cat !== "trash") text(ctx, `${freshnessBand(row.fresh).name} ${row.fresh}%`, cols.fresh, y, { color: row.fresh < 40 ? lutHex("coral") : c, shadow: null });
      if (row.sellable && cat !== "trash") text(ctx, row.demand, cols.demand, y, { color: row.demand === "부족" ? lutHex("coral") : c, shadow: null });
      if (row.special) text(ctx, "특가", cols.tag, y, { color: lutHex("red2"), shadow: null });
      text(ctx, row.sellable ? `${row.total}G` : "여기선 안 삼", cols.price, y, { align: "right", color: c, shadow: null });
    });
    if (rows.length > MARKET_ROWS) text(ctx, `${this.scroll + 1}–${Math.min(rows.length, this.scroll + MARKET_ROWS)} / ${rows.length} · 휠·↑↓`, P.x + P.w / 2, P.y + P.h - 46, { align: "center", color: muted, shadow: null });
    const all = rows.filter((r) => r.sellable).reduce((n, r) => n + r.total, 0);
    const n = rows.length;
    button(ctx, assets, all ? (this.sel === n ? "hover" : "normal") : "disabled", all ? `전부 팔기 · ${all}G` : "팔 물고기 없음", sellAllRect.x, sellAllRect.y, sellAllRect.w, sellAllRect.h);
    button(ctx, assets, this.sel === n + 1 ? "hover" : "normal", "닫기", closeRect.x, closeRect.y, closeRect.w, closeRect.h);
    text(ctx, "Enter·클릭: 그 어종 팔기 · Esc: 닫기", P.x + 232, P.y + P.h - 26, { color: muted, shadow: null });
  }
}

export class ShopPanel extends ListPanel {
  protected visible = SHOP_ROWS;
  protected extra = 1;
  protected isMarket = false;

  constructor(
    trader: Trader,
    /** Who keeps this shop (the sign over the panel). */
    private readonly who: string,
  ) {
    super(trader);
  }

  rows(): { item: ItemId; price: number; why?: string; have: string }[] {
    const t = this.trader, m = t.market;
    if (!m) return [];
    const l = t.ledger();
    return m.shop.map((item) => {
      const def = ITEMS[item];
      const q = quote(l, t.islandId, item);
      return { item, price: itemPrice(t.islandId, item, l.hullLv), why: q.why, have: def.level !== undefined ? "" : `보유 ${l.inventory[item] ?? 0}` };
    });
  }

  protected count(): number {
    return this.rows().length;
  }

  protected act(go: number): void {
    const row = this.rows()[go];
    if (row) this.trader.trade({ kind: "buy", item: row.item });
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets, t = this.trader, l = t.ledger(), P = BIG;
    const ink = lutHex("ink"), muted = lutHex("bark2");
    dim(ctx, 0.45);
    panel(ctx, assets, "panel_paper", P.x, P.y, P.w, P.h);
    text(ctx, this.who, P.x + 16, P.y + 10, { color: lutHex("red2"), shadow: null, font: FONT_B });
    const gear = t.game.backend.gear(), w = t.game.world;
    text(ctx, `보유 ${l.gold}G · 낚싯대 Lv${gear.rodLv} · 줄 Lv${gear.lineLv} · 선체 Lv${w.hullLv} · 연료통 Lv${w.tankLv} · 얼음 Lv${w.iceLv} · 화물칸 Lv${w.holdLv}`, P.x + 16, P.y + 28, { color: muted, shadow: null, maxW: P.w - 32 });
    const rows = this.rows();
    rows.slice(this.scroll, this.scroll + SHOP_ROWS).forEach((row, i) => {
      const r = rowRect(false, i), idx = this.scroll + i;
      const def = ITEMS[row.item];
      if (idx === this.sel) {
        ctx.fillStyle = lutHex("sand1");
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const y = r.y + 5;
      const off = !!row.why || l.gold < row.price;
      const c = row.why ? lutHex("gray1") : ink;
      text(ctx, `${def.name}${def.bundle ? ` ×${def.bundle}` : ""}`, r.x + 10, y, { color: c, shadow: null, maxW: 128 });
      text(ctx, fitText(ctx, def.desc, 216), r.x + 144, y, { color: row.why ? lutHex("gray1") : muted, shadow: null });
      text(ctx, row.why ?? row.have, r.x + 370, y, { color: muted, shadow: null, maxW: r.w - 10 - 56 - 370 });
      text(ctx, `${row.price}G`, r.x + r.w - 10, y, { align: "right", color: off && !row.why ? lutHex("coral") : c, shadow: null });
    });
    button(ctx, assets, this.sel === rows.length ? "hover" : "normal", "닫기", closeRect.x, closeRect.y, closeRect.w, closeRect.h);
    text(ctx, "Enter·클릭: 사기 · Esc: 닫기", P.x + 16, P.y + P.h - 26, { color: muted, shadow: null });
  }
}

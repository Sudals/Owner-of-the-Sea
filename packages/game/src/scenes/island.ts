import {
  buys, CATEGORY_NAME, categoryOf, dailyMod, demandLabel, devShiftDays, FISH_BY_ID, freshnessBand, freshnessPct, fuelMax, fuelQuote, GRADE_LABEL,
  holdCap, HULLS, ISLAND_BY_ID, ITEMS, itemPrice, kstDate, marketOf, quote, quoteSale, recentSold, repairQuote, SEA_NAME, todaySpecials,
  type Category, type ItemId, type Ledger, type Market, type ShopOp,
} from "@sea/shared";
import { islandBg, lutHex } from "../assets";
import type { HoldItem } from "../backend";
import type { Engine, Scene } from "../engine";
import type { Game } from "../game";
import { button, dim, inRect, panel, text, textWidth, type ButtonState } from "../render/ui";
import { drawSurface } from "../render/water";
import { DexPanel } from "../ui/dexPanel";

// 섬 (design §3-1, §7-3; Economy.md §2–5): the island hub. The village's keeper and line, then
// what the island offers — 시장 (sell the hold), 상점, 연료, 수리, 덕배 할멈's worms — plus the 도감,
// dock fishing and casting off. Every trade runs through the shared rules (backend.trade) and,
// in the full build, is saved when a panel closes (Economy.md §8-1: the server re-applies it).
// Villages that haven't opened yet (M7) only offer the dock and the sea.

export type ArrivalNote = {
  towed?: boolean;
  lost?: number;
  /** Gold the tow (repair + fee) took. */
  fee?: number;
  /** came in from the sea: an autosave event */
  arrived?: boolean;
};

/** One-line concepts from design §3-1. */
const BLURB: Record<string, string> = {
  red_lighthouse: "할아버지가 지키던 빨간 등대가 서 있는 바위섬",
  water_market: "뗏목과 폐선을 엮어 만든 떠다니는 장터",
  salt_flower: "잠긴 들판 위의 소금밭과 바람개비",
  bell_tower: "잠긴 학교의 종탑 꼭대기에 사는 아이들",
  bridge: "끊어진 대교 상판 위의 마을",
  junk: "건져 올린 옛 물건이 산처럼 쌓인 섬",
  rusty_port: "녹슨 크레인과 컨테이너가 남은 옛 항구",
  whalebone: "거대한 고래 뼈 안에 지은 마을",
  glass_tower: "잠긴 고층빌딩 꼭대기, 옛 태평해운 본사",
  water_sound: "파도 소리만 들리는 작은 사당 섬",
  black_sand: "기름이 밴 검은 해변, 방독면을 쓴 사람들",
  taepyeong_wreck: "할아버지가 탔던 배의 거대한 잔해",
  black_lighthouse: "기름 연기에 그을린 마지막 등대",
};

const PANEL = { x: 396, y: 34, w: 232, h: 312 };
const BIG = { x: 22, y: 18, w: 596, h: 324 };
const ROW_H = 18;
const MARKET_ROWS = 11;
const SHOP_ROWS = 10;

type Action = "market" | "shop" | "fuel" | "repair" | "gift" | "dex" | "fish" | "sail" | "save" | "title";
type MenuItem = { id: Action; label: string; disabled?: boolean };
type Row = { fishId: string; items: HoldItem[]; total: number; sellable: boolean; fresh: number; special: boolean; demand: string };
type Sub = { k: "market"; sel: number; scroll: number } | { k: "shop"; sel: number; scroll: number } | { k: "dex"; dex: DexPanel };

const FONT_B = "bold 12px Galmuri11, monospace";

/** Cut `s` to fit `w` px, with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, s: string, w: number): string {
  if (textWidth(ctx, s) <= w) return s;
  let t = s;
  while (t.length > 1 && textWidth(ctx, `${t}…`) > w) t = t.slice(0, -1);
  return `${t}…`;
}

/** Break `s` into lines no wider than `w` px (Korean wraps anywhere; prefer spaces). */
function wrap(ctx: CanvasRenderingContext2D, s: string, w: number, maxLines = 3): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(ctx, next) <= w) line = next;
    else {
      if (line) out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = fit(ctx, `${kept[maxLines - 1]} ${out.slice(maxLines).join(" ")}`, w);
    return kept;
  }
  return out;
}

export class IslandScene implements Scene {
  sel = 0;
  private t = 0;
  private toast: { text: string; until: number; color?: string } | null = null;
  private engine!: Engine;
  private sub: Sub | null = null;
  /** Trades since the last save (full build: saved when a panel closes). */
  private traded = false;

  constructor(
    private readonly game: Game,
    readonly islandId: string,
    private readonly note?: ArrivalNote,
  ) {}

  /** For tests and the HUD: which island, the scene's kind, and the open panel. */
  get state() {
    return { k: "island" as const, island: this.islandId, panel: this.sub?.k ?? null };
  }

  /** Move the menu focus to an item (keyboard tests). False when the island doesn't offer it. */
  focus(id: Action): boolean {
    const i = this.menu().findIndex((m) => m.id === id);
    if (i >= 0) this.sel = i;
    return i >= 0;
  }

  private get market(): Market | null {
    return marketOf(this.islandId);
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.game.save();
    if (this.note?.towed) {
      const parts = ["배가 부서져 끌려왔다", this.note.fee ? `견인·수리 ${this.note.fee}G` : "", this.note.lost ? `물고기 ${this.note.lost}마리를 잃었다` : ""];
      this.say(parts.filter(Boolean).join(" · "), 5, lutHex("coral"));
    }
    // arriving at an island is an autosave (design §11-2)
    if (this.note?.arrived && this.game.remote) {
      void this.game.commit("dock").then((r) => this.game.flash(r.message, 3, r.ok ? undefined : lutHex("coral")));
    }
  }

  private say(s: string, seconds = 2.5, color?: string): void {
    this.toast = { text: s, until: this.t + seconds, color };
  }

  // ── state the panels read ─────────────────────────────────────────────────

  /** The trade view of everything on board (the same shape the shared rules and the server use). */
  private ledger(): Ledger {
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

  private menu(): MenuItem[] {
    const m = this.market, l = this.ledger();
    const items: MenuItem[] = [];
    if (m) {
      const sellable = l.hold.filter((h) => buys(this.islandId, h.fishId)).length;
      if (Object.keys(m.buy).length || m.trashFlat) items.push({ id: "market", label: `물고기 팔기${sellable ? ` (${sellable}마리)` : ""}` });
      if (m.shop.length) items.push({ id: "shop", label: "상점" });
      if (m.fuel != null) {
        const q = fuelQuote(l, this.islandId);
        items.push(q.why ? { id: "fuel", label: `연료 · ${q.why}`, disabled: true } : { id: "fuel", label: `연료 채우기 +${q.qty} · ${q.cost}G` });
      }
      if (m.repair != null) {
        const q = repairQuote(l, this.islandId);
        items.push(q.why ? { id: "repair", label: `수리 · ${q.why}`, disabled: true } : { id: "repair", label: `배 수리 +${q.hp} · ${q.cost}G` });
      }
      if (m.dailyWorms) {
        const given = l.log.gift === l.date;
        items.push({ id: "gift", label: given ? "할멈의 지렁이 · 오늘 받음" : `할멈의 지렁이 ${m.dailyWorms}개 받기`, disabled: given });
      }
    }
    items.push({ id: "dex", label: "도감" }, { id: "fish", label: "선착장에서 낚시" }, { id: "sail", label: "출항" }, { id: "save", label: "저장" }, { id: "title", label: "로비로 나가기" });
    return items;
  }

  private menuRect(i: number) {
    return { x: PANEL.x + 14, y: PANEL.y + 80 + i * 22, w: PANEL.w - 28, h: 18 };
  }

  private marketRows(): Row[] {
    const l = this.ledger(), id = this.islandId;
    const ctx = { date: l.date, now: l.now, clock: l.clock, iceLv: l.iceLv, log: l.log };
    const specials = todaySpecials(l.date, id);
    const groups = new Map<string, HoldItem[]>();
    for (const h of this.game.backend.hold()) {
      const g = groups.get(h.fishId);
      if (g) g.push(h);
      else groups.set(h.fishId, [h]);
    }
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

  private shopRows(): { item: ItemId; price: number; why?: string; have: string }[] {
    const m = this.market;
    if (!m) return [];
    const l = this.ledger();
    return m.shop.map((item) => {
      const def = ITEMS[item];
      const q = quote(l, this.islandId, item);
      const have = def.level !== undefined ? "" : `보유 ${l.inventory[item] ?? 0}`;
      return { item, price: itemPrice(this.islandId, item, l.hullLv), why: q.why, have };
    });
  }

  // ── trading ──────────────────────────────────────────────────────────────

  private trade(op: { kind: "sell"; ids: string[] } | { kind: "buy"; item: ItemId } | { kind: "fuel" } | { kind: "repair" } | { kind: "gift" }): boolean {
    this.game.save(); // fuel/hull as they are now
    const r = this.game.backend.trade({ ...op, island: this.islandId, t: Date.now() } as ShopOp);
    this.say(r.message, 2.5, r.ok ? undefined : lutHex("coral"));
    if (r.ok) this.traded = true;
    return r.ok;
  }

  /** Full build: send the trades now (the server re-applies them and confirms the gold). */
  private flushTrades(): void {
    if (!this.traded || !this.game.remote) return;
    this.traded = false;
    void this.game.commit("shop").then((r) => {
      if (!r.ok) this.game.flash(r.message, 3, lutHex("coral"));
    });
  }

  // ── update ───────────────────────────────────────────────────────────────

  update(dt: number, engine: Engine): void {
    this.t += dt;
    this.game.tick(dt, false);
    if (this.toast && this.t > this.toast.until) this.toast = null;
    if (engine.dev) this.devKeys(engine);
    if (this.sub) return this.updateSub(engine);

    const input = engine.input;
    const items = this.menu();
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d) this.sel = (this.sel + d + items.length * 4) % items.length;
    this.sel = Math.min(this.sel, items.length - 1);
    const hover = items.findIndex((_, i) => inRect(input.pointer, this.menuRect(i)));
    const clicked = input.clicked ? items.findIndex((_, i) => inRect(input.clicked, this.menuRect(i))) : -1;
    if (clicked >= 0) this.sel = clicked;
    else if (hover >= 0 && input.clicked) this.sel = hover;
    const go = input.clicked ? clicked : input.pressed ? this.sel : -1;
    const it = items[go];
    if (!it) return;
    if (it.disabled) return this.say(it.label.split(" · ")[1] ?? it.label, 1.8);
    switch (it.id) {
      case "market":
        this.sub = { k: "market", sel: 0, scroll: 0 };
        return;
      case "shop":
        this.sub = { k: "shop", sel: 0, scroll: 0 };
        return;
      case "dex":
        this.sub = { k: "dex", dex: new DexPanel(() => this.game.backend.dex()) };
        return;
      case "fuel":
      case "repair":
      case "gift":
        if (this.trade({ kind: it.id })) this.flushTrades();
        return;
      case "fish":
        return this.game.toFishing({ kind: "dock", islandId: this.islandId });
      case "sail":
        return this.game.toSea(this.islandId);
      case "save":
        return void this.game.manualSave();
      case "title":
        return this.game.leave("lobby");
    }
  }

  private closeSub(): void {
    this.sub = null;
    this.flushTrades();
  }

  private updateSub(engine: Engine): void {
    const sub = this.sub!;
    const input = engine.input;
    if (sub.k === "dex") {
      sub.dex.update(engine);
      if (sub.dex.closed) this.closeSub();
      return;
    }
    if (input.hit("Escape")) return this.closeSub();
    const market = sub.k === "market";
    const n = market ? this.marketRows().length : this.shopRows().length;
    const visible = market ? MARKET_ROWS : SHOP_ROWS;
    // focus runs over the rows, then the bottom buttons (market: 전부 팔기, 닫기 / shop: 닫기)
    const extra = market ? 2 : 1;
    const total = n + extra;
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d) sub.sel = (sub.sel + d + total * 4) % total;
    sub.sel = Math.min(sub.sel, total - 1);
    if (input.wheel) sub.scroll += input.wheel;
    // keep the focused row on screen
    if (sub.sel < n) {
      if (sub.sel < sub.scroll) sub.scroll = sub.sel;
      if (sub.sel >= sub.scroll + visible) sub.scroll = sub.sel - visible + 1;
    }
    sub.scroll = Math.max(0, Math.min(Math.max(0, n - visible), sub.scroll));

    let go = -1;
    if (input.clicked) {
      const c = input.clicked;
      for (let i = 0; i < Math.min(visible, n - sub.scroll); i++) if (inRect(c, this.rowRect(market, i))) go = sub.scroll + i;
      if (market && inRect(c, this.sellAllRect)) go = n;
      if (inRect(c, this.closeRect)) go = n + extra - 1;
      if (go >= 0) sub.sel = go;
    } else if (input.pressed) go = sub.sel;
    if (go < 0) return;
    if (go === n + extra - 1) return this.closeSub();
    if (market) {
      const rows = this.marketRows();
      const pick = go === n ? rows.filter((r) => r.sellable) : rows[go] ? [rows[go]!] : [];
      if (!pick.length || !pick.some((r) => r.sellable)) return this.say(go === n ? "여기서 팔 수 있는 물고기가 없어요" : "여기서는 사지 않는 물고기예요", 2);
      const ids = pick.flatMap((r) => r.items.map((h) => h.id).filter((x): x is string => !!x));
      this.trade({ kind: "sell", ids });
    } else {
      const row = this.shopRows()[go];
      if (row) this.trade({ kind: "buy", item: row.item });
    }
  }

  private rowRect(market: boolean, i: number) {
    const top = market ? BIG.y + 78 : BIG.y + 50;
    const h = market ? ROW_H : 24;
    return { x: BIG.x + 12, y: top + i * h, w: BIG.w - 24, h: h - 2 };
  }
  private readonly sellAllRect = { x: BIG.x + 16, y: BIG.y + BIG.h - 30, w: 200, h: 20 };
  private readonly closeRect = { x: BIG.x + BIG.w - 96, y: BIG.y + BIG.h - 30, w: 80, h: 20 };

  /** Economy.md §9: 골드 지급 (local saves) and 날짜 바꾸기 (check the daily prices). */
  private devKeys(engine: Engine): void {
    const input = engine.input;
    if (input.hit("KeyG")) {
      if (this.game.backend.devGrant) {
        this.game.backend.devGrant(500);
        this.say("[dev] +500G");
      } else this.say("[dev] 골드 지급은 로컬 저장에서만 돼요");
    }
    if (input.hit("KeyN")) {
      devShiftDays(1);
      this.say(`[dev] 시세 날짜 → ${kstDate(Date.now())}`);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const { a, b, t } = this.game.clock.blend();
    const lut = this.game.clock.lut();
    const bg = islandBg(this.islandId);
    ctx.globalAlpha = 1;
    ctx.drawImage(assets.background(bg, a), 0, 0);
    if (t > 0) {
      ctx.globalAlpha = t;
      ctx.drawImage(assets.background(bg, b), 0, 0);
      ctx.globalAlpha = 1;
    }
    const [fx, fy] = assets.meta.dock.stand;
    assets.draw(ctx, "angler", `idle_${Math.floor(this.t * 1.6) % 2}`, fx - 16, fy - 47, { lut });
    drawSurface(ctx, this.t, assets.meta.waterline, assets.meta.dock.shoreX - 30, lut);

    this.drawStatus(ctx, engine);
    this.drawMenu(ctx, engine);
    text(ctx, `${this.game.world.day}일차 ${this.game.clock.label()}`, 634, 344, { align: "right", color: lutHex("foam2") });
    this.game.drawSaveLabel(ctx, assets, 6, 344);

    if (this.sub?.k === "market") this.drawMarket(ctx, engine);
    else if (this.sub?.k === "shop") this.drawShop(ctx, engine);
    else if (this.sub?.k === "dex") this.sub.dex.render(ctx, engine);

    if (this.toast) {
      const tw = Math.max(160, textWidth(ctx, this.toast.text) + 28);
      panel(ctx, assets, "panel_sea", 320 - tw / 2, this.sub ? 2 : 40, tw, 22);
      text(ctx, this.toast.text, 320, (this.sub ? 2 : 40) + 5, { align: "center", color: this.toast.color });
    }
    this.game.drawFlash(ctx, assets);
  }

  private drawStatus(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const w = this.game.world, be = this.game.backend;
    const bait = Object.entries(be.inventory()).reduce((n, [id, q]) => n + (ITEMS[id as ItemId]?.kind === "bait" ? (q ?? 0) : 0), 0);
    const s = `${be.gold()}G · 창고 ${be.hold().length}/${holdCap(w.holdLv)} · 연료 ${Math.ceil(w.fuel)}/${fuelMax(w)} · 선체 ${Math.ceil(w.hullHp)}/${HULLS[w.hullLv].hp} · 미끼 ${bait}`;
    const tw = textWidth(ctx, s) + 20;
    panel(ctx, engine.assets, "panel_sea", 8, 8, tw, 22);
    text(ctx, s, 18, 13);
  }

  private drawMenu(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const isl = ISLAND_BY_ID[this.islandId]!;
    const m = this.market;
    const P = PANEL;
    panel(ctx, assets, "panel_wood", P.x, P.y, P.w, P.h);
    text(ctx, isl.name, P.x + P.w / 2, P.y + 10, { align: "center", color: lutHex("bark1"), shadow: null, font: FONT_B });
    text(ctx, SEA_NAME[isl.sea], P.x + P.w / 2, P.y + 25, { align: "center", color: lutHex("bark2"), shadow: null });
    const say = m ? `${m.keeper}: "${m.line}"` : `${BLURB[isl.id] ?? ""} — 마을은 아직 문을 닫았다`;
    wrap(ctx, say, P.w - 28, 3).forEach((ln, i) => text(ctx, ln, P.x + 14, P.y + 42 + i * 12, { color: lutHex("ink"), shadow: null }));
    const sel = this.sub ? -1 : this.sel;
    this.menu().forEach((it, i) => {
      const r = this.menuRect(i);
      const st: ButtonState = it.disabled ? "disabled" : i === sel ? "hover" : "normal";
      button(ctx, assets, st, fit(ctx, it.label, r.w - 8), r.x, r.y, r.w, r.h);
    });
  }

  private drawMarket(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets, sub = this.sub as Extract<Sub, { k: "market" }>;
    const m = this.market!, l = this.ledger(), P = BIG;
    const ink = lutHex("ink"), muted = lutHex("bark2");
    dim(ctx, 0.45);
    panel(ctx, assets, "panel_paper", P.x, P.y, P.w, P.h);
    text(ctx, `${m.keeper}의 시장 · 물고기 팔기`, P.x + 16, P.y + 10, { color: lutHex("red2"), shadow: null, font: FONT_B });
    text(ctx, `보유 ${l.gold}G`, P.x + P.w - 16, P.y + 10, { align: "right", color: ink, shadow: null });

    // today's market: 특가 and the daily swing per category (Economy.md §3-2, §3-3)
    const specials = todaySpecials(l.date, this.islandId).map((id) => FISH_BY_ID[id]?.name ?? id);
    text(ctx, specials.length ? `오늘의 특가 ×${m.specialMult}: ${specials.join(", ")}` : "오늘의 특가 없음", P.x + 16, P.y + 28, { color: lutHex("red2"), shadow: null });
    const mods = (Object.keys(m.buy) as Exclude<Category, "trash">[]).map((c) => {
      const pct = Math.round((dailyMod(l.date, this.islandId, c) - 1) * 100);
      return `${CATEGORY_NAME[c]} ${pct > 0 ? `▲${pct}` : pct < 0 ? `▼${-pct}` : "—"}${pct ? "%" : ""}`;
    });
    text(ctx, fit(ctx, `오늘 시세 · ${mods.join(" · ")}`, P.w - 32), P.x + 16, P.y + 42, { color: muted, shadow: null });

    const cols = { name: P.x + 22, n: P.x + 200, fresh: P.x + 248, demand: P.x + 360, tag: P.x + 448, price: P.x + P.w - 22 };
    const hy = P.y + 62;
    for (const [k, label] of [["name", "어종"], ["n", "수"], ["fresh", "신선도"], ["demand", "수요"]] as const) text(ctx, label, cols[k], hy, { color: muted, shadow: null });
    text(ctx, "값", cols.price, hy, { align: "right", color: muted, shadow: null });

    const rows = this.marketRows();
    if (!rows.length) text(ctx, "창고가 비어 있어요", P.x + P.w / 2, P.y + 140, { align: "center", color: muted, shadow: null });
    rows.slice(sub.scroll, sub.scroll + MARKET_ROWS).forEach((row, i) => {
      const r = this.rowRect(true, i), idx = sub.scroll + i;
      const f = FISH_BY_ID[row.fishId];
      if (idx === sub.sel) {
        ctx.fillStyle = lutHex("sand1");
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const y = r.y + 3;
      const c = !row.sellable ? lutHex("gray1") : f?.rarity === "legendary" ? lutHex("red2") : f?.rarity === "rare" ? lutHex("sea1") : ink;
      const grade = f && (f.rarity === "rare" || f.rarity === "legendary") ? ` (${GRADE_LABEL[f.rarity]})` : "";
      text(ctx, fit(ctx, `${f?.name ?? row.fishId}${grade}`, cols.n - cols.name - 8), cols.name, y, { color: c, shadow: null });
      text(ctx, `×${row.items.length}`, cols.n, y, { color: c, shadow: null });
      const cat = f ? categoryOf(f) : null;
      if (cat !== "polluted" && cat !== "trash") text(ctx, `${freshnessBand(row.fresh).name} ${row.fresh}%`, cols.fresh, y, { color: row.fresh < 40 ? lutHex("coral") : c, shadow: null });
      if (row.sellable) text(ctx, row.demand, cols.demand, y, { color: row.demand === "부족" ? lutHex("coral") : c, shadow: null });
      if (row.special) text(ctx, "특가", cols.tag, y, { color: lutHex("red2"), shadow: null });
      text(ctx, row.sellable ? `${row.total}G` : "여기선 안 삼", cols.price, y, { align: "right", color: c, shadow: null });
    });
    if (rows.length > MARKET_ROWS) text(ctx, `${sub.scroll + 1}–${Math.min(rows.length, sub.scroll + MARKET_ROWS)} / ${rows.length} · 휠·↑↓`, P.x + P.w / 2, P.y + P.h - 46, { align: "center", color: muted, shadow: null });

    const all = rows.filter((r) => r.sellable).reduce((n, r) => n + r.total, 0);
    const n = rows.length;
    button(ctx, assets, all ? (sub.sel === n ? "hover" : "normal") : "disabled", all ? `전부 팔기 · ${all}G` : "팔 물고기 없음", this.sellAllRect.x, this.sellAllRect.y, this.sellAllRect.w, this.sellAllRect.h);
    button(ctx, assets, sub.sel === n + 1 ? "hover" : "normal", "닫기", this.closeRect.x, this.closeRect.y, this.closeRect.w, this.closeRect.h);
    text(ctx, "Enter·클릭: 그 어종 팔기 · Esc: 닫기", P.x + 232, P.y + P.h - 26, { color: muted, shadow: null });
  }

  private drawShop(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets, sub = this.sub as Extract<Sub, { k: "shop" }>;
    const m = this.market!, l = this.ledger(), P = BIG;
    const ink = lutHex("ink"), muted = lutHex("bark2");
    dim(ctx, 0.45);
    panel(ctx, assets, "panel_paper", P.x, P.y, P.w, P.h);
    text(ctx, `${m.keeper}의 상점`, P.x + 16, P.y + 10, { color: lutHex("red2"), shadow: null, font: FONT_B });
    const gear = this.game.backend.gear(), w = this.game.world;
    text(ctx, `보유 ${l.gold}G · 낚싯대 Lv${gear.rodLv} · 줄 Lv${gear.lineLv} · 선체 Lv${w.hullLv} · 연료통 Lv${w.tankLv} · 얼음 Lv${w.iceLv} · 화물칸 Lv${w.holdLv}`, P.x + 16, P.y + 28, { color: muted, shadow: null });

    const rows = this.shopRows();
    rows.slice(sub.scroll, sub.scroll + SHOP_ROWS).forEach((row, i) => {
      const r = this.rowRect(false, i), idx = sub.scroll + i;
      const def = ITEMS[row.item];
      if (idx === sub.sel) {
        ctx.fillStyle = lutHex("sand1");
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const y = r.y + 5;
      const off = !!row.why || l.gold < row.price;
      const c = row.why ? lutHex("gray1") : ink;
      const name = `${def.name}${def.bundle ? ` ×${def.bundle}` : ""}`;
      text(ctx, fit(ctx, name, 128), r.x + 10, y, { color: c, shadow: null });
      text(ctx, fit(ctx, def.desc, 268), r.x + 144, y, { color: row.why ? lutHex("gray1") : muted, shadow: null });
      text(ctx, row.why ?? row.have, r.x + 420, y, { color: muted, shadow: null });
      text(ctx, `${row.price}G`, r.x + r.w - 10, y, { align: "right", color: off && !row.why ? lutHex("coral") : c, shadow: null });
    });
    button(ctx, assets, sub.sel === rows.length ? "hover" : "normal", "닫기", this.closeRect.x, this.closeRect.y, this.closeRect.w, this.closeRect.h);
    text(ctx, "Enter·클릭: 사기 · Esc: 닫기", P.x + 16, P.y + P.h - 26, { color: muted, shadow: null });
  }
}

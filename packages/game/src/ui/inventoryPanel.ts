import {
  FISH_BY_ID, FRESH_DECAY_PER_MIN, freshnessBand, freshnessPct, fuelMax, GRADE_LABEL, holdCap, HULLS, ISLAND_BY_ID, isOpen, ITEMS, lineMax, MARKETS, rodSpeed,
  sizeGradeOf, type ItemId, type ItemKind, type OpResult,
} from "@sea/shared";
import { lutHex } from "../assets";
import type { HoldItem } from "../backend";
import type { Engine } from "../engine";
import type { Game } from "../game";
import { button, dim, inRect, panel, text, textWidth, type ButtonState } from "../render/ui";

// 창고 · 장비 (design §3-4, §4-4; Economy.md §4): what's in the hold — every catch grouped by
// species with its sizes and freshness — and what the boat carries: gear levels with what they
// do (and where the next level is sold), bait and other items. Opened from the island hub, the
// sea (I) and between casts (I).
//   창고 tab: pick a fish, Enter = 소금 절임 (one of them, the least fresh)
//   장비 tab: pick an item, Enter = use it (수리 키트, 얼음 덩이) or put that bait on the hook

const P = { x: 22, y: 18, w: 596, h: 324 };
const ROWS = 12;
const ROW_H = 18;
const ITEM_H = 20;

type Group = { fishId: string; items: HoldItem[]; min: number; max: number; best: string; fresh: number; salted: number };

const GEAR_LINES: { kind: ItemKind; label: string }[] = [
  { kind: "rod", label: "낚싯대" },
  { kind: "line", label: "낚싯줄" },
  { kind: "hull", label: "선체" },
  { kind: "tank", label: "연료통" },
  { kind: "ice", label: "얼음 창고" },
  { kind: "hold", label: "화물칸" },
];

const perishable = (fishId: string) => {
  const f = FISH_BY_ID[fishId];
  return !!f && !f.trash && f.rarity !== "boss";
};

export class InventoryPanel {
  tab: 0 | 1 = 0;
  closed = false;
  /** Focused row in the current tab. */
  sel = 0;
  private scroll = 0;
  private note: { text: string; until: number; bad: boolean } | null = null;
  private t = 0;

  /** `onUsed` lets the scene play an effect (the sea sparkles for a 수리 키트). */
  constructor(
    private readonly game: Game,
    private readonly onUsed?: (item: ItemId, r: OpResult) => void,
  ) {}

  private tabRect(i: number) {
    return { x: P.x + 16 + i * 150, y: P.y + 30, w: 144, h: 18 };
  }
  private readonly closeRect = { x: P.x + P.w - 92, y: P.y + 8, w: 80, h: 18 };
  private readonly actRect = { x: P.x + 16, y: P.y + P.h - 26, w: 170, h: 18 };

  /** Hold items grouped by species, fish first (biggest groups first), trash last. */
  private groups(): Group[] {
    const w = this.game.world;
    const by = new Map<string, HoldItem[]>();
    for (const h of this.game.backend.hold()) (by.get(h.fishId) ?? by.set(h.fishId, []).get(h.fishId)!).push(h);
    const order = ["S", "A", "B", "C", "D"];
    return [...by]
      .map(([fishId, items]): Group => {
        const sizes = items.map((h) => h.sizeCm);
        const grades = items.map((h) => sizeGradeOf(h.fishId, h.sizeCm));
        return {
          fishId,
          items,
          min: Math.min(...sizes),
          max: Math.max(...sizes),
          best: order.find((g) => grades.includes(g as never)) ?? "B",
          fresh: Math.round(items.reduce((n, h) => n + freshnessPct(h, w.seaTime, w.iceLv), 0) / items.length),
          salted: items.filter((h) => h.salted !== undefined).length,
        };
      })
      .sort((a, b) => Number(!!FISH_BY_ID[a.fishId]?.trash) - Number(!!FISH_BY_ID[b.fishId]?.trash) || b.items.length - a.items.length);
  }

  /** Items on board that aren't gear levels: bait first, then consumables. */
  private owned(): ItemId[] {
    const inv = this.game.backend.inventory();
    const ids = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].level === undefined && (inv[id] ?? 0) > 0);
    return ids.sort((a, b) => Number(ITEMS[a].kind !== "bait") - Number(ITEMS[b].kind !== "bait"));
  }

  private say(s: string, bad = false): void {
    this.note = { text: s, until: this.t + 2.6, bad };
  }

  /** What Enter does on the focused row, or null. */
  private action(): { label: string; run: () => void } | null {
    const inv = this.game.backend.inventory();
    if (this.tab === 0) {
      const g = this.groups()[this.sel];
      if (!g || !perishable(g.fishId)) return null;
      const salt = inv.salt ?? 0;
      const target = g.items.filter((h) => h.salted === undefined && h.id).sort((a, b) => freshnessPct(a, this.game.world.seaTime, this.game.world.iceLv) - freshnessPct(b, this.game.world.seaTime, this.game.world.iceLv))[0];
      if (!target) return { label: "모두 절였어요", run: () => this.say("이 어종은 모두 소금에 절였어요") };
      return {
        label: `소금 절임 (소금 ${salt}개)`,
        run: () => (salt > 0 ? this.use("salt", target.id) : this.say("소금이 없어요 — 소금꽃섬에서 팔아요", true)),
      };
    }
    const id = this.owned()[this.sel];
    if (!id) return null;
    const def = ITEMS[id];
    if (def.kind === "bait") return { label: "미끼로 쓰기", run: () => (this.game.chooseBait(id), this.say(`${def.name}을(를) 바늘에 끼웠다`)) };
    if (def.kind === "consumable" && id !== "salt") return { label: `${def.name} 쓰기`, run: () => this.use(id) };
    if (id === "salt") return { label: "창고 탭에서 물고기를 골라요", run: () => ((this.tab = 0), (this.sel = 0), (this.scroll = 0)) };
    return null;
  }

  private use(item: ItemId, target?: string): void {
    this.game.save(); // hull and the freshness clock as they are now
    const r = this.game.backend.trade({ kind: "use", item, ...(target ? { target } : {}), t: Date.now() });
    this.say(r.message, !r.ok);
    this.onUsed?.(item, r);
  }

  update(engine: Engine, dt = 1 / 60): void {
    this.t += dt;
    if (this.note && this.t > this.note.until) this.note = null;
    const input = engine.input;
    if (input.hit("Escape") || input.hit("KeyI")) return void (this.closed = true);
    const d = input.hit("ArrowRight") + input.hit("KeyD") - input.hit("ArrowLeft") - input.hit("KeyA") + input.hit("Tab");
    if (d) {
      this.tab = ((this.tab + d + 2) % 2) as 0 | 1;
      this.sel = 0;
      this.scroll = 0;
    }
    const n = this.tab === 0 ? this.groups().length : this.owned().length;
    const visible = this.tab === 0 ? ROWS : 99;
    const step = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (step && n) this.sel = (this.sel + step + n * 4) % n;
    this.sel = Math.max(0, Math.min(Math.max(0, n - 1), this.sel));
    this.scroll += input.wheel;
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + visible) this.scroll = this.sel - visible + 1;
    this.scroll = Math.max(0, Math.min(Math.max(0, n - visible), this.scroll));

    if (input.clicked) {
      const c = input.clicked;
      if (inRect(c, this.closeRect)) return void (this.closed = true);
      for (const i of [0, 1]) if (inRect(c, this.tabRect(i))) {
        this.tab = i as 0 | 1;
        this.sel = 0;
        this.scroll = 0;
        return;
      }
      if (inRect(c, this.actRect)) return this.action()?.run();
      for (let i = 0; i < n; i++) if (inRect(c, this.rowRect(i - this.scroll))) this.sel = i;
    } else if (input.hit("Enter")) this.action()?.run();
  }

  private rowRect(i: number) {
    return this.tab === 0 ? { x: P.x + 12, y: P.y + 72 + i * ROW_H, w: P.w - 24, h: ROW_H - 1 } : { x: P.x + 352, y: P.y + 74 + i * ITEM_H - 3, w: P.w - 352 - 12, h: ITEM_H - 2 };
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets, be = this.game.backend, w = this.game.world;
    const ink = lutHex("ink"), muted = lutHex("bark2");
    dim(ctx, 0.5);
    panel(ctx, assets, "panel_paper", P.x, P.y, P.w, P.h);
    text(ctx, "창고 · 장비", P.x + 16, P.y + 10, { color: lutHex("red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });
    text(ctx, `${be.gold().toLocaleString("ko-KR")}G`, this.closeRect.x - 12, P.y + 10, { align: "right", color: ink, shadow: null });
    button(ctx, assets, "normal", "닫기", this.closeRect.x, this.closeRect.y, this.closeRect.w, this.closeRect.h);
    const cap = holdCap(w.holdLv);
    const labels = [`창고 ${be.hold().length}/${cap}`, "장비 · 소지품"];
    labels.forEach((l, i) => {
      const r = this.tabRect(i);
      button(ctx, assets, i === this.tab ? "hover" : "normal", l, r.x, r.y, r.w, r.h);
    });
    if (this.tab === 0) this.drawHold(ctx, ink, muted);
    else this.drawGear(ctx, ink, muted);

    // bottom line: what Enter does here, the keys, and the last result
    const act = this.action();
    const st: ButtonState = act ? "normal" : "disabled";
    button(ctx, assets, st, act ? `Enter · ${act.label}` : "Enter · —", this.actRect.x, this.actRect.y, this.actRect.w, this.actRect.h);
    text(ctx, "↑↓ 고르기 · ←→ 탭 · I/Esc 닫기", P.x + P.w - 16, P.y + P.h - 23, { align: "right", color: muted, shadow: null });
    if (this.note) text(ctx, fitW(ctx, this.note.text, P.w - 40), P.x + P.w / 2, P.y + P.h - 44, { align: "center", color: this.note.bad ? lutHex("coral") : lutHex("red2"), shadow: null });
  }

  private drawHold(ctx: CanvasRenderingContext2D, ink: string, muted: string): void {
    const w = this.game.world;
    const groups = this.groups();
    const cols = { name: P.x + 22, n: P.x + 210, size: P.x + 260, grade: P.x + 380, fresh: P.x + 440 };
    const hy = P.y + 56;
    text(ctx, "어종", cols.name, hy, { color: muted, shadow: null });
    text(ctx, "수", cols.n, hy, { color: muted, shadow: null });
    text(ctx, "크기", cols.size, hy, { color: muted, shadow: null });
    text(ctx, "최고", cols.grade, hy, { color: muted, shadow: null });
    text(ctx, "신선도", cols.fresh, hy, { color: muted, shadow: null });
    if (!groups.length) text(ctx, "창고가 비어 있어요", P.x + P.w / 2, P.y + 150, { align: "center", color: muted, shadow: null });
    groups.slice(this.scroll, this.scroll + ROWS).forEach((g, i) => {
      const f = FISH_BY_ID[g.fishId];
      const r = this.rowRect(i);
      if (this.scroll + i === this.sel) {
        ctx.fillStyle = lutHex("sand1");
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const y = r.y + 2;
      const junk = !!f?.trash;
      const c = junk ? lutHex("gray1") : f?.rarity === "legendary" || f?.rarity === "boss" ? lutHex("red2") : f?.rarity === "rare" ? lutHex("sea1") : ink;
      const grade = f && !junk && f.rarity !== "common" ? ` (${GRADE_LABEL[f.rarity]})` : junk ? " (쓰레기)" : "";
      text(ctx, `${f?.name ?? g.fishId}${grade}`, cols.name, y, { color: c, shadow: null });
      text(ctx, `×${g.items.length}`, cols.n, y, { color: c, shadow: null });
      text(ctx, g.min === g.max ? `${g.min.toFixed(1)}cm` : `${g.min.toFixed(1)}–${g.max.toFixed(1)}cm`, cols.size, y, { color: c, shadow: null });
      if (!junk) {
        text(ctx, `${g.best}급`, cols.grade, y, { color: g.best === "S" ? lutHex("red2") : g.best === "A" ? lutHex("sea1") : c, shadow: null });
        if (f?.rarity !== "boss") {
          const salt = g.salted ? (g.salted === g.items.length ? " · 절임" : ` · 절임 ${g.salted}`) : "";
          text(ctx, `${freshnessBand(g.fresh).name} ${g.fresh}%${salt}`, cols.fresh, y, { color: g.fresh < 40 ? lutHex("coral") : c, shadow: null });
        }
      }
    });
    const n = groups.length;
    const decay = FRESH_DECAY_PER_MIN[w.iceLv] ?? 1;
    const info = n > ROWS ? `${this.scroll + 1}–${Math.min(n, this.scroll + ROWS)} / ${n}종 · ` : "";
    if (!this.note) text(ctx, `${info}신선도는 1분에 ${decay}%씩 떨어져요 (얼음 창고 Lv${w.iceLv}) · 값은 섬에서 팔 때 정해져요`, P.x + 16, P.y + P.h - 44, { color: muted, shadow: null });
  }

  private drawGear(ctx: CanvasRenderingContext2D, ink: string, muted: string): void {
    const be = this.game.backend, w = this.game.world, gear = be.gear();
    const lv: Record<string, number> = { rod: gear.rodLv, line: gear.lineLv, hull: w.hullLv, tank: w.tankLv, ice: w.iceLv, hold: w.holdLv };
    const what: Record<string, string> = {
      rod: `감기 속도 ×${rodSpeed(gear.rodLv)}`,
      line: `텐션 최대 ${Math.round(lineMax(gear.lineLv) * 100)}`,
      hull: `${HULLS[w.hullLv].name} · 내구도 ${Math.ceil(w.hullHp)}/${HULLS[w.hullLv].hp} · 속도 ${HULLS[w.hullLv].speed}`,
      tank: `연료 ${Math.ceil(w.fuel)}/${fuelMax(w)}`,
      ice: `신선도 −${FRESH_DECAY_PER_MIN[w.iceLv] ?? 1}%/분`,
      hold: `${holdCap(w.holdLv)}칸 (${be.hold().length}칸 사용)`,
    };
    const x = P.x + 22, x2 = P.x + 360;
    text(ctx, "장비", x, P.y + 56, { color: muted, shadow: null });
    GEAR_LINES.forEach((g, i) => {
      const y = P.y + 74 + i * 30;
      const have = lv[g.kind] ?? 0;
      text(ctx, `${g.label} Lv${have}`, x, y, { color: ink, shadow: null, font: "bold 12px Galmuri11, monospace" });
      text(ctx, what[g.kind] ?? "", x + 92, y, { color: ink, shadow: null });
      text(ctx, fitW(ctx, this.nextHint(g.kind, have), 230), x + 92, y + 13, { color: muted, shadow: null });
    });
    text(ctx, `등불 ${w.lantern ? "있음 — 먹빛 바다를 밝힌다" : "없음 (먹빛 바다에 필요)"}`, x, P.y + 74 + GEAR_LINES.length * 30, { color: w.lantern ? ink : muted, shadow: null });

    text(ctx, "소지품", x2, P.y + 56, { color: muted, shadow: null });
    const inv = be.inventory();
    const owned = this.owned();
    const bait = this.game.currentBait();
    if (!owned.length) text(ctx, "없음 — 미끼는 섬 상점에서", x2, P.y + 74, { color: muted, shadow: null });
    owned.forEach((id, i) => {
      const r = this.rowRect(i);
      if (i === this.sel) {
        ctx.fillStyle = lutHex("sand1");
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const on = id === bait;
      text(ctx, `${ITEMS[id].name} ×${inv[id]}${on ? "  ← 지금 미끼" : ""}`, x2, r.y + 3, { color: on ? lutHex("red2") : ink, shadow: null });
    });
    if (bait === "none") text(ctx, "미끼 없음 — 맨 바늘은 입질이 늦어요", x2, P.y + 74 + Math.max(1, owned.length) * ITEM_H + 4, { color: lutHex("coral"), shadow: null });
    const focus = owned[this.sel];
    if (focus && !this.note) text(ctx, fitW(ctx, ITEMS[focus].desc, P.x + P.w - 22 - x2), x2, P.y + P.h - 62, { color: muted, shadow: null });
  }

  /** "다음 Lv2: 물장터 300G" — where the next level is sold among the open villages. */
  private nextHint(kind: ItemKind, have: number): string {
    const next = (Object.keys(ITEMS) as ItemId[]).find((id) => ITEMS[id].kind === kind && ITEMS[id].level === have + 1);
    if (!next) return have > 0 ? "최고 레벨" : "";
    const where = Object.entries(MARKETS)
      .filter(([isl, m]) => m.shop.includes(next) && isOpen(isl))
      .map(([isl]) => ISLAND_BY_ID[isl]?.name ?? isl);
    return `다음 Lv${have + 1}: ${where.length ? where.join(", ") : "아직 열린 마을에 없음"} · ${ITEMS[next].price}G`;
  }
}

function fitW(ctx: CanvasRenderingContext2D, s: string, w: number): string {
  if (textWidth(ctx, s) <= w) return s;
  let t = s;
  while (t.length > 1 && textWidth(ctx, `${t}…`) > w) t = t.slice(0, -1);
  return `${t}…`;
}

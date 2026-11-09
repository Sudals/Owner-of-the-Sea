import { devShiftDays, fuelMax, holdCap, HULLS, ISLAND_BY_ID, ITEMS, kstDate, marketOf, SEA_NAME, type ItemId } from "@sea/shared";
import { islandBg, lutHex } from "../assets";
import type { Engine, Scene } from "../engine";
import type { Game } from "../game";
import { Fx } from "../render/fx";
import { button, fitText, inRect, panel, text, textWidth, type ButtonState } from "../render/ui";
import { drawSurface } from "../render/water";
import { DexPanel } from "../ui/dexPanel";
import { InventoryPanel } from "../ui/inventoryPanel";
import { villageOf } from "../village/maps";

// 섬 (design §3-1, §7-3): the dock. You tie up here; the village — the market, the shops, fuel,
// repairs, 덕배 할멈 — is a walk away (마을 들어가기 → VillageScene), and nothing is bought or
// sold from the dock itself. From here: the 도감, the hold, dock fishing, casting off.
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
const FONT_B = "bold 12px Galmuri11, monospace";

type Action = "village" | "dex" | "bag" | "fish" | "sail" | "save" | "title";
type MenuItem = { id: Action; label: string; disabled?: boolean; why?: string };
type Sub = { k: "dex"; dex: DexPanel } | { k: "bag"; bag: InventoryPanel };

/** Break `s` into lines no wider than `w` px (prefer spaces). */
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
    kept[maxLines - 1] = fitText(ctx, `${kept[maxLines - 1]} ${out.slice(maxLines).join(" ")}`, w);
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
  /** The tow-in flash and the fee floater. */
  readonly fx = new Fx();

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
    const i = this.menu().findIndex((m) => m.id === id && !m.disabled);
    if (i >= 0) this.sel = i;
    return i >= 0;
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.game.save();
    if (this.note?.towed) {
      const parts = ["배가 부서져 끌려왔다", this.note.fee ? `견인·수리 ${this.note.fee}G` : "", this.note.lost ? `물고기 ${this.note.lost}마리를 잃었다` : ""];
      this.say(parts.filter(Boolean).join(" · "), 5, lutHex("coral"));
      this.fx.flash("red2", 0.5, 0.6);
      if (this.note.fee) this.fx.text(60, 34, `-${this.note.fee}G`, "coral", { big: true, life: 2 });
    }
    // arriving at an island is an autosave (design §11-2)
    if (this.note?.arrived && this.game.remote) {
      void this.game.commit("dock").then((r) => this.game.flash(r.message, 3, r.ok ? undefined : lutHex("coral")));
    }
  }

  private say(s: string, seconds = 2.5, color?: string): void {
    this.toast = { text: s, until: this.t + seconds, color };
  }

  private menu(): MenuItem[] {
    const open = !!marketOf(this.islandId) && !!villageOf(this.islandId);
    const keeper = marketOf(this.islandId)?.keeper;
    return [
      open ? { id: "village", label: `마을 들어가기${keeper ? ` · ${keeper}` : ""}` } : { id: "village", label: "마을 · 아직 문을 닫았다", disabled: true, why: "이 마을은 아직 문을 닫았어요" },
      { id: "dex", label: "도감" },
      { id: "bag", label: "창고 · 장비" },
      { id: "fish", label: "선착장에서 낚시" },
      { id: "sail", label: "출항" },
      { id: "save", label: "저장" },
      { id: "title", label: "로비로 나가기" },
    ];
  }

  private menuRect(i: number) {
    return { x: PANEL.x + 14, y: PANEL.y + 104 + i * 24, w: PANEL.w - 28, h: 20 };
  }

  update(dt: number, engine: Engine): void {
    this.t += dt;
    this.fx.update(dt);
    this.game.tick(dt, false);
    if (this.toast && this.t > this.toast.until) this.toast = null;
    if (engine.dev) this.devKeys(engine);
    if (this.sub) {
      const p = this.sub.k === "dex" ? this.sub.dex : this.sub.bag;
      p.update(engine);
      if (p.closed) this.sub = null;
      return;
    }
    const input = engine.input;
    if (input.hit("KeyI")) return void (this.sub = { k: "bag", bag: new InventoryPanel(this.game) });
    const items = this.menu();
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d) this.sel = (this.sel + d + items.length * 4) % items.length;
    this.sel = Math.min(this.sel, items.length - 1);
    const clicked = input.clicked ? items.findIndex((_, i) => inRect(input.clicked, this.menuRect(i))) : -1;
    if (clicked >= 0) this.sel = clicked;
    const go = input.clicked ? clicked : input.pressed ? this.sel : -1;
    const it = items[go];
    if (!it) return;
    if (it.disabled) return this.say(it.why ?? it.label, 1.8);
    switch (it.id) {
      case "village":
        return this.game.toVillage(this.islandId);
      case "dex":
        this.sub = { k: "dex", dex: new DexPanel(() => this.game.backend.dex()) };
        return;
      case "bag":
        this.sub = { k: "bag", bag: new InventoryPanel(this.game) };
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

    if (this.sub?.k === "dex") this.sub.dex.render(ctx, engine);
    else if (this.sub?.k === "bag") this.sub.bag.render(ctx, engine);

    if (this.toast) {
      const tw = Math.min(620, Math.max(160, textWidth(ctx, this.toast.text) + 28));
      panel(ctx, assets, "panel_sea", 320 - tw / 2, this.sub ? 2 : 40, tw, 22);
      text(ctx, this.toast.text, 320, (this.sub ? 2 : 40) + 5, { align: "center", color: this.toast.color, maxW: tw - 20 });
    }
    this.fx.draw(ctx);
    this.fx.drawScreen(ctx);
    this.game.drawFlash(ctx, assets);
  }

  private drawStatus(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const w = this.game.world, be = this.game.backend;
    const bait = Object.entries(be.inventory()).reduce((n, [id, q]) => n + (ITEMS[id as ItemId]?.kind === "bait" ? (q ?? 0) : 0), 0);
    const s = `${be.gold().toLocaleString("ko-KR")}G · 창고 ${be.hold().length}/${holdCap(w.holdLv)} · 연료 ${Math.ceil(w.fuel)}/${fuelMax(w)} · 선체 ${Math.ceil(w.hullHp)}/${HULLS[w.hullLv].hp} · 미끼 ${bait}`;
    const tw = textWidth(ctx, s) + 20;
    panel(ctx, engine.assets, "panel_sea", 8, 8, tw, 22);
    text(ctx, s, 18, 13);
  }

  private drawMenu(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const isl = ISLAND_BY_ID[this.islandId]!;
    const m = marketOf(this.islandId);
    const P = PANEL;
    panel(ctx, assets, "panel_wood", P.x, P.y, P.w, P.h);
    text(ctx, isl.name, P.x + P.w / 2, P.y + 10, { align: "center", color: lutHex("bark1"), shadow: null, font: FONT_B });
    text(ctx, `${SEA_NAME[isl.sea]} · 선착장`, P.x + P.w / 2, P.y + 25, { align: "center", color: lutHex("bark2"), shadow: null });
    const about = m ? `${BLURB[isl.id] ?? ""}. 시장과 상점, 연료와 수리는 마을 안에 있다.` : `${BLURB[isl.id] ?? ""} — 마을은 아직 문을 닫았다.`;
    wrap(ctx, about, P.w - 28, 4).forEach((ln, i) => text(ctx, ln, P.x + 14, P.y + 44 + i * 13, { color: lutHex("ink"), shadow: null }));
    const sel = this.sub ? -1 : this.sel;
    this.menu().forEach((it, i) => {
      const r = this.menuRect(i);
      const st: ButtonState = it.disabled ? "disabled" : i === sel ? "hover" : "normal";
      button(ctx, assets, st, it.label, r.x, r.y, r.w, r.h);
    });
  }
}

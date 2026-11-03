import { fuelMax, HULLS, ISLAND_BY_ID, SEA_NAME } from "@sea/shared";
import { lutHex } from "../assets";
import type { Engine, Scene } from "../engine";
import type { Game } from "../game";
import { button, inRect, panel, text, textWidth } from "../render/ui";
import { drawSurface } from "../render/water";

// 섬 (design §3-1, §7-3) — a stand-in for the island hub until M5 brings the village (shops,
// quests, NPCs, its own side-view background). For now every island shows the dock scene and
// offers what M6 needs: fish from the dock, or cast off onto the sea map.

export type ArrivalNote = { towed?: boolean; lost?: number };

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

const PANEL = { x: 380, y: 92, w: 236, h: 190 };

export class IslandScene implements Scene {
  sel = 0;
  private t = 0;
  private toast: { text: string; until: number } | null = null;
  private engine!: Engine;

  constructor(
    private readonly game: Game,
    readonly islandId: string,
    private readonly note?: ArrivalNote,
  ) {}

  /** For tests and the HUD: which island, and the scene's kind. */
  get state() {
    return { k: "island" as const, island: this.islandId };
  }

  enter(engine: Engine): void {
    this.engine = engine;
    const w = this.game.world;
    // Until shops exist (M5) an island tops up fuel and patches the hull for free.
    const refuel = w.fuel < fuelMax(w), repair = w.hullHp < HULLS[w.hullLv].hp;
    w.fuel = fuelMax(w);
    w.hullHp = HULLS[w.hullLv].hp;
    this.game.save();
    if (this.note?.towed) this.say(`배가 부서져 끌려왔다${this.note.lost ? ` · 물고기 ${this.note.lost}마리를 잃었다` : ""}`, 4.5);
    else if (refuel || repair) this.say("연료를 채우고 배를 손봤다 (상점이 열리기 전까지 무료)", 3.5);
  }

  private items() {
    const x = PANEL.x + 16, w = PANEL.w - 32;
    return [
      { id: "fish", label: "선착장에서 낚시", rect: { x, y: PANEL.y + 90, w, h: 20 } },
      { id: "sail", label: "출항", rect: { x, y: PANEL.y + 116, w, h: 20 } },
      { id: "title", label: "로비로 나가기", rect: { x, y: PANEL.y + 142, w, h: 20 } },
    ];
  }

  private say(s: string, seconds = 2.5): void {
    this.toast = { text: s, until: this.t + seconds };
  }

  update(dt: number, engine: Engine): void {
    this.t += dt;
    this.game.tick(dt, false);
    if (this.toast && this.t > this.toast.until) this.toast = null;
    const input = engine.input;
    const items = this.items();
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d) this.sel = (this.sel + d + items.length * 4) % items.length;
    const hover = items.findIndex((it) => inRect(input.pointer, it.rect));
    if (hover >= 0 && input.clicked) this.sel = hover;
    const go = input.clicked ? items.findIndex((it) => inRect(input.clicked, it.rect)) : input.pressed ? this.sel : -1;
    switch (items[go]?.id) {
      case "fish":
        return this.game.toFishing({ kind: "dock", islandId: this.islandId });
      case "sail":
        return this.game.toSea(this.islandId);
      case "title":
        return this.game.toTitle();
    }
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const { a, b, t } = this.game.clock.blend();
    const lut = this.game.clock.lut();
    ctx.globalAlpha = 1;
    ctx.drawImage(assets.background("bg_dock", a), 0, 0);
    if (t > 0) {
      ctx.globalAlpha = t;
      ctx.drawImage(assets.background("bg_dock", b), 0, 0);
      ctx.globalAlpha = 1;
    }
    const [fx, fy] = assets.meta.dock.stand;
    assets.draw(ctx, "angler", `idle_${Math.floor(this.t * 1.6) % 2}`, fx - 16, fy - 47, { lut });
    drawSurface(ctx, this.t, assets.meta.waterline, assets.meta.dock.shoreX - 30, lut);

    const isl = ISLAND_BY_ID[this.islandId]!;
    const w = this.game.world;
    const P = PANEL;
    panel(ctx, assets, "panel_wood", P.x, P.y, P.w, P.h);
    text(ctx, isl.name, P.x + P.w / 2, P.y + 12, { align: "center", color: lutHex("bark1"), shadow: null, font: "bold 12px Galmuri11, monospace" });
    text(ctx, SEA_NAME[isl.sea], P.x + P.w / 2, P.y + 28, { align: "center", color: lutHex("bark2"), shadow: null });
    text(ctx, BLURB[isl.id] ?? "", P.x + P.w / 2, P.y + 46, { align: "center", color: lutHex("ink"), shadow: null });
    text(ctx, `연료 ${Math.ceil(w.fuel)} · 선체 ${w.hullHp} · 창고 ${this.game.backend.hold().length}마리`, P.x + P.w / 2, P.y + 66, { align: "center", color: lutHex("bark2"), shadow: null });
    this.items().forEach((it, i) => button(ctx, assets, i === this.sel ? "hover" : "normal", it.label, it.rect.x, it.rect.y, it.rect.w, it.rect.h));
    text(ctx, "마을(상점·의뢰)은 준비 중이에요", P.x + P.w / 2, P.y + P.h + 6, { align: "center", color: lutHex("foam2") });
    text(ctx, `${w.day}일차 ${this.game.clock.label()}`, 634, 344, { align: "right", color: lutHex("foam2") });

    if (this.toast) {
      const tw = Math.max(160, textWidth(ctx, this.toast.text) + 28);
      panel(ctx, assets, "panel_sea", 320 - tw / 2, 40, tw, 26);
      text(ctx, this.toast.text, 320, 47, { align: "center" });
    }
  }
}

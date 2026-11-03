import { FISH_BY_ID, GRADE_LABEL, POINTS, SEA_NAME, SEA_ORDER, type SeaColor } from "@sea/shared";
import { lutHex } from "../assets";
import type { DexEntry } from "../backend";
import type { Engine } from "../engine";
import { button, dim, inRect, panel, text } from "../render/ui";

// 도감 (design §4-3): a tab per sea color, every species that lives there. Caught ones show the
// fish, its biggest size and how many; the rest are dark silhouettes. Used from the island hub
// and the sea's menu.

const P = { x: 22, y: 18, w: 596, h: 324 };
const COLS = 4, ROWS = 5, CW = 140, CH = 52;
const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3, boss: 4 } as const;

/** Species living in each sea (dock and open-water pools), common first. */
export const SPECIES_BY_SEA: Readonly<Record<SeaColor, string[]>> = Object.fromEntries(
  SEA_ORDER.map((sea) => {
    const ids = [...new Set(POINTS.filter((p) => p.sea === sea).flatMap((p) => p.pool))].filter((id) => FISH_BY_ID[id]);
    ids.sort((a, b) => RARITY_ORDER[FISH_BY_ID[a]!.rarity] - RARITY_ORDER[FISH_BY_ID[b]!.rarity] || FISH_BY_ID[a]!.name.localeCompare(FISH_BY_ID[b]!.name, "ko"));
    return [sea, ids];
  }),
) as Record<SeaColor, string[]>;

export class DexPanel {
  tab = 0;
  closed = false;

  constructor(private readonly dex: () => DexEntry[]) {}

  private tabRect(i: number) {
    return { x: P.x + 16 + i * 104, y: P.y + 30, w: 98, h: 18 };
  }
  private readonly closeRect = { x: P.x + P.w - 92, y: P.y + 8, w: 80, h: 18 };

  update(engine: Engine): void {
    const input = engine.input;
    if (input.hit("Escape") || input.hit("KeyB")) return void (this.closed = true);
    const d = input.hit("ArrowRight") + input.hit("KeyD") - input.hit("ArrowLeft") - input.hit("KeyA");
    if (d) this.tab = (this.tab + d + SEA_ORDER.length * 4) % SEA_ORDER.length;
    if (input.clicked) {
      if (inRect(input.clicked, this.closeRect)) return void (this.closed = true);
      SEA_ORDER.forEach((_, i) => inRect(input.clicked, this.tabRect(i)) && (this.tab = i));
    } else if (input.hit("Enter")) this.closed = true;
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const book = new Map(this.dex().map((e) => [e.fishId, e]));
    dim(ctx, 0.5);
    panel(ctx, assets, "panel_paper", P.x, P.y, P.w, P.h);
    const total = SEA_ORDER.reduce((n, s) => n + SPECIES_BY_SEA[s].filter((id) => book.has(id)).length, 0);
    const all = SEA_ORDER.reduce((n, s) => n + SPECIES_BY_SEA[s].length, 0);
    text(ctx, `도감 · ${total}/${all}종`, P.x + 16, P.y + 10, { color: lutHex("red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });
    button(ctx, assets, "normal", "닫기", this.closeRect.x, this.closeRect.y, this.closeRect.w, this.closeRect.h);

    SEA_ORDER.forEach((sea, i) => {
      const r = this.tabRect(i);
      const got = SPECIES_BY_SEA[sea].filter((id) => book.has(id)).length;
      button(ctx, assets, i === this.tab ? "hover" : "normal", `${SEA_NAME[sea].replace(" 바다", "")} ${got}/${SPECIES_BY_SEA[sea].length}`, r.x, r.y, r.w, r.h);
    });

    const sea = SEA_ORDER[this.tab]!;
    const ids = SPECIES_BY_SEA[sea];
    const gx = P.x + 18, gy = P.y + 56;
    ids.slice(0, COLS * ROWS).forEach((id, k) => {
      const f = FISH_BY_ID[id]!;
      const e = book.get(id);
      const cx = gx + (k % COLS) * CW, cy = gy + Math.floor(k / COLS) * CH;
      ctx.fillStyle = lutHex(e ? "sand2" : "sand1");
      ctx.globalAlpha = 0.5;
      ctx.fillRect(cx, cy, CW - 6, CH - 4);
      ctx.globalAlpha = 1;
      const fr = assets.frame(f.sheet, f.id);
      const sx = cx + (CW - 6 - fr.w) / 2, sy = cy + 2 + (32 - fr.h) / 2;
      if (e) assets.draw(ctx, f.sheet, f.id, sx, sy);
      else assets.drawSilhouette(ctx, f.sheet, f.id, sx, sy, lutHex("bark2"));
      const label = e ? `${f.name} · ${e.maxSizeCm.toFixed(1)}cm` : "???";
      text(ctx, label, cx + (CW - 6) / 2, cy + 35, { align: "center", color: lutHex(e ? "ink" : "bark2"), shadow: null });
      if (e) text(ctx, `×${e.count}`, cx + CW - 9, cy + 2, { align: "right", color: lutHex("bark2"), shadow: null });
      if (f.rarity === "rare" || f.rarity === "legendary") text(ctx, GRADE_LABEL[f.rarity], cx + 3, cy + 2, { color: lutHex(f.rarity === "legendary" ? "red2" : "sea1"), shadow: null });
    });
    text(ctx, "← → 바다 바꾸기 · ESC 닫기", P.x + P.w / 2, P.y + P.h - 16, { align: "center", color: lutHex("bark2"), shadow: null });
  }
}

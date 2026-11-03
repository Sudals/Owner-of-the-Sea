import { C } from "../palette";
import { disc, dither, ellipse, hline, line, polygon, rect, thickLine, vline } from "../lib/draw";
import { Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";

// UI kit (design §6-2): 9-slice panels, buttons, gauge frames, 16×16 icons.
// 9-slice panels are 24×24 with 8px corners (anchor `slice` = [8, 8]).

const ol = (img: Img) => img.outline(C.ink);

function panel(kind: "wood" | "sea" | "paper"): Img {
  const S = 24;
  const img = new Img(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const corner = (x < 1 || x > S - 2) && (y < 1 || y > S - 2);
      if (corner) continue;
      const d = Math.min(x, y, S - 1 - x, S - 1 - y);
      const tl = x <= y ? x < S - 1 - y : false; // which half — top/left vs bottom/right
      const topLeft = Math.min(x, y) === d && (x === d || y === d) && !(x === S - 1 - d || y === S - 1 - d);
      void tl;
      let c: number;
      if (kind === "wood") {
        if (d === 0) c = C.ink;
        else if (d <= 2) c = topLeft && d === 1 ? C.wood : C.bark2;
        else if (d === 3) c = C.bark1;
        else c = x === 4 || y === 4 ? C.sand1 : C.sand2;
      } else if (kind === "sea") {
        if (d === 0) c = C.ink;
        else if (d === 1) c = topLeft ? C.sea3 : C.sea2;
        else if (d === 2) c = C.deep2;
        else c = x === 3 || y === 3 ? C.deep1 : C.navy;
      } else {
        if (d === 0) c = C.ink;
        else if (d === 1) c = C.sand1;
        else c = (x * 7 + y * 13) % 23 === 0 ? C.sand1 : (x * 5 + y * 3) % 31 === 0 ? C.white : C.sand2;
      }
      img.set(x, y, c);
    }
  if (kind === "wood") for (const [x, y] of [[2, 2], [21, 2], [2, 21], [21, 21]] as const) img.set(x, y, C.gray2); // nails
  if (kind === "sea") for (const [x, y] of [[2, 2], [21, 2], [2, 21], [21, 21]] as const) img.set(x, y, C.foam1);
  return img;
}

function button(state: "normal" | "hover" | "pressed" | "disabled"): Img {
  const W = 40, H = 14;
  const img = new Img(W, H);
  const face = { normal: C.sand2, hover: C.yellow, pressed: C.sand1, disabled: C.gray2 }[state];
  const bevel = { normal: C.sand1, hover: C.sand1, pressed: C.wood, disabled: C.gray1 }[state];
  const top = state === "pressed" ? 1 : 0;
  for (let y = top; y < H; y++)
    for (let x = 0; x < W; x++) {
      const corner = (x < 1 || x > W - 2) && (y < top + 1 || y > H - 2);
      if (corner) continue;
      const edge = x === 0 || x === W - 1 || y === top || y === H - 1;
      let c = face;
      if (edge) c = C.ink;
      else if (state !== "pressed" && y >= H - 3) c = bevel;
      else if (y === top + 1 && state !== "disabled") c = C.white;
      img.set(x, y, c);
    }
  return img;
}

function gaugeFrame(w: number, h: number): Img {
  const img = new Img(w, h);
  rect(img, 0, 0, w, h, C.ink);
  rect(img, 1, 1, w - 2, h - 2, C.navy);
  hline(img, 1, w - 2, 1, C.deep1);
  // tick marks at 70% and 90% (tension warning zones)
  for (const f of [0.7, 0.9]) vline(img, Math.round(1 + (w - 3) * f), h - 3, h - 2, C.gray1);
  return img;
}

// ── icons ──
const icon = (draw: (img: Img) => void): Img => {
  const img = new Img(16, 16);
  draw(img);
  return ol(img);
};

const ICONS: Record<string, (img: Img) => void> = {
  gold: (g) => {
    disc(g, 7.5, 7.5, 6, C.sand1);
    disc(g, 7, 7, 5.3, C.yellow);
    ellipse(g, 7.5, 7.5, 3.2, 3.2, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.75 ? C.sand1 : C.yellow));
    vline(g, 7, 5, 9, C.sand1);
    g.set(4, 4, C.white); g.set(5, 3, C.white);
  },
  dex: (g) => {
    rect(g, 2, 1, 11, 14, C.bark2);
    vline(g, 2, 1, 14, C.bark1);
    rect(g, 13, 2, 1, 12, C.sand2);
    polygon(g, [[5, 8], [8, 6], [11, 8], [8, 10]], C.sea3); // fish on the cover
    polygon(g, [[4, 6.5], [5.5, 8], [4, 9.5]], C.sea3);
    g.set(10, 7, C.ink);
    hline(g, 4, 11, 3, C.sand1);
  },
  shop: (g) => {
    polygon(g, [[2, 6], [13, 6], [12, 14], [3, 14]], C.sand1);
    hline(g, 3, 12, 6, C.sand2);
    vline(g, 3, 7, 13, C.wood);
    thickLine(g, 5, 6, 5, 3, 0.5, C.bark2); thickLine(g, 10, 6, 10, 3, 0.5, C.bark2); hline(g, 5, 10, 2, C.bark2);
    disc(g, 7.5, 10, 2, C.yellow);
    g.set(7, 10, C.sand1);
  },
  save: (g) => {
    // anchor
    disc(g, 7.5, 2.5, 1.6, C.gray2);
    g.set(7, 2, 0); g.set(8, 2, 0);
    vline(g, 7, 4, 13, C.gray2); vline(g, 8, 4, 13, C.gray1);
    hline(g, 4, 11, 6, C.gray2);
    line(g, 2, 10, 5, 13, C.gray2); line(g, 13, 10, 10, 13, C.gray1);
    hline(g, 5, 10, 13, C.gray2);
    g.set(2, 9, C.gray2); g.set(13, 9, C.gray1);
  },
  fuel: (g) => {
    rect(g, 3, 4, 10, 11, C.red2);
    vline(g, 3, 4, 14, C.coral);
    vline(g, 12, 4, 14, C.red1);
    line(g, 4, 5, 11, 13, C.red1); line(g, 11, 5, 4, 13, C.red1);
    rect(g, 9, 1, 3, 3, C.gray1);
    hline(g, 4, 7, 2, C.gray2); vline(g, 4, 2, 4, C.gray2);
  },
  repair: (g) => {
    thickLine(g, 4, 12, 10, 6, 1, C.gray2);
    disc(g, 11.5, 4.5, 3, C.gray2);
    disc(g, 12.5, 3.5, 1.3, 0);
    line(g, 5, 13, 11, 7, C.gray1);
    disc(g, 3.5, 12.5, 1.6, C.gray1);
  },
  clear: (g) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(g, 7.5 + Math.cos(a) * 5, 7.5 + Math.sin(a) * 5, 7.5 + Math.cos(a) * 7, 7.5 + Math.sin(a) * 7, C.sand1);
    }
    disc(g, 7.5, 7.5, 3.8, C.yellow);
    g.set(6, 6, C.white);
  },
  storm: (g) => {
    ellipse(g, 5.5, 6.5, 4, 3, C.gray1);
    ellipse(g, 9.5, 5.5, 4.5, 3.5, C.gray2);
    hline(g, 2, 13, 8, C.gray1);
    polygon(g, [[8, 8], [10, 8], [8.5, 11], [10.5, 11], [6.5, 15], [7.5, 12], [6, 12]], C.yellow);
    g.set(3, 11, C.sea3); g.set(2, 13, C.sea3); g.set(12, 11, C.sea3); g.set(11, 13, C.sea3);
  },
  omen: (g) => {
    ellipse(g, 7.5, 6.5, 6.5, 3.6, (x, y, nx, ny) => (Math.hypot(nx, ny) < 0.55 ? C.violet1 : C.violet2));
    disc(g, 7.5, 6.5, 1.6, C.ink);
    g.set(6, 5, C.gray2);
    vline(g, 7, 10, 13, C.ink); vline(g, 9, 10, 11, C.ink); g.set(5, 10, C.ink); // black drip
    g.set(7, 14, C.violet1);
  },
  settings: (g) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      disc(g, 7.5 + Math.cos(a) * 5.2, 7.5 + Math.sin(a) * 5.2, 1.3, C.gray2);
    }
    disc(g, 7.5, 7.5, 4.6, C.gray2);
    disc(g, 7.5, 7.5, 1.8, 0);
    g.set(5, 4, C.white);
  },
  star: (g) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? 7 : 3;
      pts.push([7.5 + Math.cos(a) * r, 8 + Math.sin(a) * r]);
    }
    polygon(g, pts, (x, y) => (x > 8 && y > 8 ? C.sand1 : C.yellow));
    g.set(6, 5, C.white);
  },
  title_scale: (g) => {
    // the blackened scale (grandfather's keepsake) wearing a crown — weekly "바다의 주인"
    polygon(g, [[7.5, 4], [13, 7], [12, 12], [7.5, 15], [3, 12], [2, 7]], (x, y) => dither(x, y, (y - 5) / 10, C.sea1, C.deep1));
    line(g, 4, 8, 7, 12, C.sea3);
    polygon(g, [[3, 4], [5, 1], [6.5, 3], [7.5, 0.5], [8.5, 3], [10, 1], [12, 4]], C.yellow);
    g.set(7, 1, C.white);
  },
  lock: (g) => {
    ellipse(g, 7.5, 5, 4, 4.5, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.6 && y < 7 ? C.gray2 : 0));
    rect(g, 2, 7, 12, 8, C.yellow);
    hline(g, 2, 13, 14, C.sand1);
    vline(g, 13, 7, 14, C.sand1);
    rect(g, 7, 9, 2, 3, C.bark1);
  },
  journal: (g) => {
    polygon(g, [[2, 2], [13, 1], [14, 10], [12, 11], [13, 13], [10, 14], [3, 15], [1, 9]], C.sand2);
    for (const y of [5, 8, 11]) hline(g, 4, 11, y, C.sand1);
    g.set(4, 4, C.bark2); g.set(9, 12, C.coral);
  },
  compass: (g) => {
    disc(g, 7.5, 7.5, 6.5, C.wood);
    disc(g, 7.5, 7.5, 5, C.sand2);
    polygon(g, [[7.5, 2.5], [9, 7.5], [6, 7.5]], C.coral);
    polygon(g, [[7.5, 12.5], [9, 7.5], [6, 7.5]], C.gray1);
    g.set(7, 7, C.ink);
  },
};

export function buildUi(): SheetItem[] {
  return [
    { name: "panel_wood", img: panel("wood"), anchor: { slice: [8, 8] } },
    { name: "panel_sea", img: panel("sea"), anchor: { slice: [8, 8] } },
    { name: "panel_paper", img: panel("paper"), anchor: { slice: [8, 8] } },
    { name: "button_normal", img: button("normal"), anchor: { slice: [4, 4] } },
    { name: "button_hover", img: button("hover"), anchor: { slice: [4, 4] } },
    { name: "button_pressed", img: button("pressed"), anchor: { slice: [4, 4] } },
    { name: "button_disabled", img: button("disabled"), anchor: { slice: [4, 4] } },
    { name: "gauge_h", img: gaugeFrame(52, 8), anchor: { slice: [3, 3] } },
    { name: "gauge_v", img: gaugeFrame(8, 40).flipX(), anchor: { slice: [3, 3] } },
    ...Object.entries(ICONS).map(([name, draw]) => ({ name: `icon_${name}`, img: icon(draw) })),
  ];
}

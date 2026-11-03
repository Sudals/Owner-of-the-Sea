import { C, lighter, LUTS, type LutName } from "../palette";
import { bayer, dither, disc, ellipse, hline, line, polygon, rect, rng, vline } from "../lib/draw";
import { Img } from "../lib/image";

// Sea backgrounds (design §3-2, §6-2): 640×360, split view — sky / far sea / underwater
// cross-section where the drowned old world shows through. Baked in "day"; the game
// swaps time of day and pollution with the palette LUTs (§4-7).
// Water ripples, reflections and splashes are runtime effects drawn over this.

export const BG_W = 640, BG_H = 360;
export const HORIZON = 132, WATERLINE = 176;

export type SeaId = "jade" | "azure" | "indigo" | "ink";

type SeaLook = {
  sky: number[]; far: number[]; under: number[];
  sun: boolean; clouds: number; overcast?: boolean;
  rays: number; snow: number; fogBase: number;
};

const LOOK: Record<SeaId, SeaLook> = {
  jade: { sky: [C.sea1, C.sea2, C.sea3, C.foam1, C.foam2], far: [C.foam1, C.jade3, C.jade2], under: [C.jade3, C.jade2, C.jade1, C.deep1], sun: false, clouds: 5, rays: 1, snow: 60, fogBase: 0.28 },
  azure: { sky: [C.deep2, C.sea1, C.sea2, C.sea3, C.foam1], far: [C.sea3, C.sea2, C.sea1], under: [C.sea2, C.sea1, C.deep2, C.deep1], sun: false, clouds: 4, rays: 0.7, snow: 90, fogBase: 0.1 },
  indigo: { sky: [C.deep1, C.deep2, C.sea1, C.sea2, C.sea3], far: [C.sea2, C.sea1, C.deep2], under: [C.sea1, C.deep2, C.deep1, C.navy], sun: false, clouds: 6, rays: 0.35, snow: 140, fogBase: 0.08 },
  ink: { sky: [C.ink, C.violet1, C.gray1, C.gray1, C.gray2], far: [C.gray1, C.violet1, C.navy], under: [C.deep1, C.navy, C.violet1, C.ink], sun: false, clouds: 14, overcast: true, rays: 0, snow: 220, fogBase: 0.08 },
};

function vgrad(img: Img, y0: number, y1: number, stops: number[]): void {
  for (let y = y0; y <= y1; y++) {
    const t = ((y - y0) / Math.max(1, y1 - y0)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < BG_W; x++) img.set(x, y, dither(x, y, f, stops[i]!, stops[i + 1]!));
  }
}

function cloud(img: Img, cx: number, cy: number, s: number, light: number, mid: number, dark: number, r: () => number): void {
  const puffs = 3 + Math.floor(r() * 3);
  for (let i = 0; i < puffs; i++) {
    const px = cx + (i - puffs / 2) * s * 0.9 + r() * s * 0.4;
    const py = cy - Math.sin((i / (puffs - 1 || 1)) * Math.PI) * s * 0.5;
    ellipse(img, px, py, s * (0.8 + r() * 0.4), s * (0.55 + r() * 0.2), (x, y, nx, ny) =>
      ny > 0.35 ? dark : ny > -0.1 ? dither(x, y, (ny + 0.1) / 0.45, mid, dark) : dither(x, y, (ny + 0.6) / 0.5, light, mid),
    );
  }
  hline(img, Math.round(cx - s * puffs * 0.5), Math.round(cx + s * puffs * 0.5), Math.round(cy + s * 0.45), dark);
}

/** A building drawn on its own layer (later fogged into the water). */
function building(layer: Img, x: number, w: number, top: number, bottom: number, body: number, edge: number, win: number, roof: "flat" | "gable" | "broken", r: () => number): void {
  rect(layer, x, top, w, bottom - top, body);
  vline(layer, x, top, bottom, edge);
  if (roof === "gable") polygon(layer, [[x - 2, top + 1], [x + w / 2, top - w * 0.4], [x + w + 2, top + 1]], C.red2);
  if (roof === "broken") for (let i = 0; i < w; i += 2) rect(layer, x + i, top - Math.floor(r() * 4), 2, 4, body);
  for (let wy = top + 3; wy < bottom - 2; wy += 5)
    for (let wx = x + 2; wx < x + w - 2; wx += 4) if (r() > 0.18) rect(layer, wx, wy, 2, 2, r() > 0.9 ? edge : win);
}

function fogInto(base: Img, layer: Img, fogAt: (y: number) => number): void {
  for (let y = 0; y < BG_H; y++)
    for (let x = 0; x < BG_W; x++) {
      const c = layer.get(x, y);
      if (!c) continue;
      base.set(x, y, bayer(x, y) < fogAt(y) ? base.get(x, y) : c);
    }
}

export function renderSea(sea: SeaId): Img {
  const L = LOOK[sea];
  const img = new Img(BG_W, BG_H);
  const r = rng(sea.length * 7919 + sea.charCodeAt(0));

  // ── sky ──
  vgrad(img, 0, HORIZON, L.sky);
  if (L.sun) {
    disc(img, 508, 46, 15, C.sand2);
    disc(img, 508, 46, 12, C.yellow);
    disc(img, 505, 43, 6, C.white);
  }
  for (let i = 0; i < L.clouds; i++) {
    const cy = L.overcast ? 12 + r() * 70 : 22 + r() * 70;
    const s = L.overcast ? 14 + r() * 10 : 8 + r() * 8;
    if (L.overcast) cloud(img, r() * BG_W, cy, s, C.gray2, C.gray1, C.violet1, r);
    else cloud(img, r() * BG_W, cy, s, C.white, C.foam2, C.foam1, r);
  }

  // ── far sea & horizon silhouettes ──
  vgrad(img, HORIZON, WATERLINE - 1, L.far);
  const sil = L.far[L.far.length - 1]!;
  if (sea === "jade") {
    // small green islets
    for (const [x, w, h] of [[60, 70, 10], [150, 30, 6], [420, 90, 14], [560, 40, 7]] as const)
      ellipse(img, x + w / 2, HORIZON + 1, w / 2, h, (px, py, nx, ny) => (py > HORIZON ? 0 : ny < -0.6 ? C.green3 : nx < 0 ? C.green2 : C.green1));
  } else {
    // drowned skyscraper tips breaking the surface
    const n = sea === "azure" ? 7 : sea === "indigo" ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const x = 20 + r() * 600, w = 6 + r() * 12, h = 6 + r() * (sea === "indigo" ? 30 : 18);
      const col = sea === "ink" ? C.ink : sea === "indigo" ? C.deep1 : C.deep2;
      rect(img, Math.round(x), Math.round(HORIZON - h), Math.round(w), Math.round(h) + 2, col);
      if (sea === "ink" && r() > 0.5) polygon(img, [[x, HORIZON - h], [x + w, HORIZON - h - 4], [x + w, HORIZON - h]], col); // broken top
      for (let wy = Math.round(HORIZON - h + 2); wy < HORIZON - 1; wy += 4) img.set(Math.round(x + w / 2), wy, sil);
    }
    if (sea === "ink") for (let i = 0; i < 40; i++) disc(img, 300 + r() * 200, 60 + r() * 70, 2 + r() * 5, r() > 0.5 ? C.gray1 : C.violet1); // smoke plume
  }
  // horizon line + far glints
  hline(img, 0, BG_W - 1, HORIZON, lighter(L.far[0]!));
  for (let i = 0; i < 80; i++) {
    const y = HORIZON + 3 + Math.floor(r() ** 2 * (WATERLINE - HORIZON - 6));
    const x = Math.floor(r() * BG_W);
    hline(img, x, x + 1 + Math.floor(r() * 3), y, lighter(img.get(x, y)));
  }

  // ── underwater ──
  vgrad(img, WATERLINE, BG_H - 1, L.under);
  // light rays slanting down from the surface
  if (L.rays > 0)
    for (let y = WATERLINE; y < BG_H; y++)
      for (let x = 0; x < BG_W; x++) {
        const band = (x + (y - WATERLINE) * 0.55) % 110;
        const depthFade = 1 - (y - WATERLINE) / (BG_H - WATERLINE);
        if (band < 22 && bayer(x, y) < 0.32 * L.rays * depthFade * Math.sin((band / 22) * Math.PI)) img.set(x, y, lighter(img.get(x, y)));
      }

  // drowned city on its own layer, fogged by depth
  const city = new Img(BG_W, BG_H);
  if (sea === "jade") {
    rect(city, 0, 334, BG_W, 26, C.sand1); // sandy floor
    for (let x = 0; x < BG_W; x += 3) city.set(x, 334 + Math.floor(r() * 2), C.sand2);
    rect(city, 0, 342, BG_W, 7, C.gray1); // old road
    for (let x = 6; x < BG_W; x += 22) hline(city, x, x + 10, 345, C.white);
    for (const [x, w, h] of [[30, 40, 34], [92, 30, 26], [250, 46, 40], [330, 26, 22], [470, 38, 30], [560, 52, 38]] as const)
      building(city, x, w, 334 - h, 334, C.sand2, C.sand1, C.deep1, "gable", r);
    // power pole + traffic light
    vline(city, 200, 270, 334, C.bark2); hline(city, 192, 208, 276, C.bark2);
    vline(city, 420, 296, 342, C.gray1); rect(city, 416, 288, 6, 12, C.navy);
    city.set(418, 290, C.coral); city.set(418, 294, C.yellow); city.set(418, 297, C.jade3);
  } else if (sea === "azure") {
    for (let i = 0; i < 9; i++) {
      const w = 26 + r() * 40, x = i * 72 + r() * 20, top = 236 + r() * 60;
      building(city, Math.round(x), Math.round(w), Math.round(top), BG_H, C.sea1, C.deep2, C.deep1, r() > 0.6 ? "broken" : "flat", r);
    }
    for (let i = 0; i < 5; i++) { const x = r() * BG_W; line(city, x, 300 + r() * 40, x + 8, 300 + r() * 40, C.gray1); } // dangling cables
  } else if (sea === "indigo") {
    for (let i = 0; i < 6; i++) {
      const w = 40 + r() * 50, x = i * 110 + r() * 30, top = 205 + r() * 50;
      building(city, Math.round(x), Math.round(w), Math.round(top), BG_H, C.deep2, C.sea1, C.deep1, "broken", r);
    }
  } else {
    // 버려진 골: trench walls, dumped drums, an oil plume rising
    polygon(city, [[0, 230], [70, 250], [110, 300], [140, BG_H], [0, BG_H]], C.violet2);
    polygon(city, [[0, 234], [66, 254], [104, 302], [132, BG_H], [0, BG_H]], C.violet1);
    polygon(city, [[BG_W, 220], [560, 245], [520, 310], [500, BG_H], [BG_W, BG_H]], C.violet2);
    polygon(city, [[BG_W, 224], [564, 249], [526, 312], [508, BG_H], [BG_W, BG_H]], C.violet1);
    polygon(city, [[140, BG_H], [220, 338], [420, 342], [500, BG_H]], C.navy);
    for (let i = 0; i < 14; i++) {
      const x = 170 + r() * 300, y = 330 + r() * 18;
      rect(city, Math.round(x), Math.round(y), 6, 8, r() > 0.4 ? C.red1 : C.gray1);
      hline(city, Math.round(x), Math.round(x) + 5, Math.round(y) + 3, C.ink);
    }
    for (let y = 200; y < 340; y++) {
      const cx = 330 + Math.sin(y * 0.05) * 14, w = 4 + (340 - y) * 0.08;
      for (let x = Math.round(cx - w); x <= cx + w; x++) if (bayer(x, y) < 0.55) city.set(x, y, C.ink);
    }
  }
  fogInto(img, city, (y) => Math.min(0.9, L.fogBase + ((BG_H - y) / (BG_H - WATERLINE)) * 0.12));

  // marine snow / pollution specks
  for (let i = 0; i < L.snow; i++) {
    const x = Math.floor(r() * BG_W), y = WATERLINE + 4 + Math.floor(r() * (BG_H - WATERLINE - 4));
    img.set(x, y, sea === "ink" ? (r() > 0.5 ? C.gray1 : C.violet2) : lighter(lighter(img.get(x, y))));
  }

  // static surface band (the game animates waves on top)
  hline(img, 0, BG_W - 1, WATERLINE, C.foam2);
  hline(img, 0, BG_W - 1, WATERLINE + 1, lighter(L.under[0]!));
  for (let x = 0; x < BG_W; x += 2) if (bayer(x, WATERLINE + 2) < 0.5) img.set(x, WATERLINE + 2, lighter(L.under[0]!));
  return img;
}

export const SEAS: SeaId[] = ["jade", "azure", "indigo", "ink"];

/** Preview: one background in every LUT (time of day + pollution). */
export function lutVariants(base: Img): { name: LutName; img: Img }[] {
  return (Object.keys(LUTS) as LutName[]).map((name) => ({ name, img: base.remap(LUTS[name]) }));
}

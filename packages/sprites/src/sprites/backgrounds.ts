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
  underwaterRays(img, L.rays);

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

  surfaceBand(img, L.under[0]!, 0);
  return img;
}

export const SEAS: SeaId[] = ["jade", "azure", "indigo", "ink"];

/** Light rays slanting down from the surface, fading with depth. */
function underwaterRays(img: Img, strength: number, x0 = 0): void {
  if (strength <= 0) return;
  for (let y = WATERLINE; y < BG_H; y++)
    for (let x = x0; x < BG_W; x++) {
      const band = (x + (y - WATERLINE) * 0.55) % 110;
      const depthFade = 1 - (y - WATERLINE) / (BG_H - WATERLINE);
      if (band < 22 && bayer(x, y) < 0.32 * strength * depthFade * Math.sin((band / 22) * Math.PI)) img.set(x, y, lighter(img.get(x, y)));
    }
}

/** Static surface band from x0 rightward (the game animates waves on top). */
function surfaceBand(img: Img, under0: number, x0: number): void {
  hline(img, x0, BG_W - 1, WATERLINE, C.foam2);
  hline(img, x0, BG_W - 1, WATERLINE + 1, lighter(under0));
  for (let x = x0; x < BG_W; x += 2) if (bayer(x, WATERLINE + 2) < 0.5) img.set(x, WATERLINE + 2, lighter(under0));
}

// ── Starting-island dock (선착장). Islands are TBD (design §3-1), so this is a generic
//    village: lighthouse, houses on a green hill, a beach, and a wooden pier into jade water.

/** Where things sit in the dock background; exported to the game via bg_meta.json. */
export const DOCK = {
  stand: [344, 146] as [number, number], pierTop: 146, pierFrom: 168, pierTo: 362, shoreX: 236,
  /** seabed: flat ground until bedFrom, slopes down to bedY at bedTo, flat after */
  bedFrom: 200, bedTo: 340, bedY: 330,
};

const hillTop = (x: number) => 62 + (WATERLINE - 62) * Math.min(1, x / 250) ** 1.55;

function house(img: Img, x: number, base: number, w: number, h: number, wall: number, roof: number): void {
  rect(img, x, base - h, w, h, wall);
  vline(img, x, base - h, base - 1, darkerOf(wall));
  polygon(img, [[x - 2, base - h + 1], [x + w / 2, base - h - w * 0.45], [x + w + 2, base - h + 1]], roof);
  hline(img, x - 2, x + w + 1, base - h, darkerOf(roof));
  rect(img, x + w - 6, base - 6, 3, 6, C.bark2); // door
  rect(img, x + 3, base - h + 3, 3, 3, C.foam1); // window
  img.set(x + 3, base - h + 3, C.white);
}
const darkerOf = (c: number) => (c === C.white ? C.gray2 : c === C.sand2 ? C.sand1 : c === C.red2 ? C.red1 : c === C.coral ? C.red2 : c === C.sea1 ? C.deep2 : c === C.wood ? C.bark2 : C.bark1);

/** Which village sits on the hill. All share DOCK (pier, waterline, seabed), so the island hub
 *  and dock fishing line up on every island. */
export type DockLook = "lighthouse" | "market" | "salt" | "village";
export const DOCK_LOOKS: Record<DockLook, string> = { lighthouse: "bg_dock", market: "bg_dock_market", salt: "bg_dock_salt", village: "bg_dock_village" };

/** The hill's ground at (x, y), `d` px below its top edge. */
function ground(look: DockLook, x: number, y: number, d: number): number {
  switch (look) {
    case "salt":
      // white salt crust over sand
      if (d < 2) return C.white;
      if (d < 8) return dither(x, y, d / 14, C.white, C.foam2);
      return dither(x, y, Math.min(0.6, (d - 8) / 50), C.sand2, C.sand1);
    case "market": {
      // a heap of lashed rafts and old hulls: plank decks stacked down the slope
      const band = Math.floor(d / 5), seam = (x + band * 5) % 11 === 0;
      if (d % 5 === 0) return C.bark1;
      if (seam) return C.bark2;
      return band % 3 === 0 ? C.wood : band % 3 === 1 ? dither(x, y, 0.3, C.wood, C.bark2) : C.bark2;
    }
    default:
      if (d < 2) return C.green3;
      if (d < 10) return dither(x, y, d / 20, C.green3, C.green2);
      return dither(x, y, Math.min(0.55, (d - 10) / 60), C.green2, C.green1);
  }
}

/** A market stall: two poles, a striped awning, a counter with goods. */
function stall(img: Img, x: number, base: number, w: number, stripe: number): void {
  vline(img, x, base - 16, base - 1, C.bark1);
  vline(img, x + w, base - 16, base - 1, C.bark1);
  for (let i = 0; i <= w + 4; i++) {
    const c = Math.floor(i / 3) % 2 === 0 ? stripe : C.white;
    vline(img, x - 2 + i, base - 19, base - 16, c);
    if (i % 3 === 1) img.set(x - 2 + i, base - 15, c); // scalloped edge
  }
  hline(img, x - 2, x + w + 2, base - 20, darkerOf(stripe));
  rect(img, x + 1, base - 6, w - 1, 6, C.wood);
  hline(img, x + 1, x + w - 1, base - 6, C.sand1);
  for (let gx = x + 3; gx < x + w - 2; gx += 4) rect(img, gx, base - 8, 2, 2, gx % 8 === 0 ? C.sea2 : C.foam1); // fish on the counter
}

/** A 바람개비 on a pole (소금꽃섬). */
function pinwheel(img: Img, x: number, base: number, h: number, colors: number[]): void {
  vline(img, x, base - h, base - 1, C.gray2);
  const cy = base - h;
  const blades: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  blades.forEach(([dx, dy], i) => {
    const c = colors[i % colors.length]!;
    // a little triangle per blade, swept clockwise
    polygon(img, [[x, cy], [x + dx * 6 - dy * 2, cy + dy * 6 + dx * 2], [x + dx * 6 + dy * 2, cy + dy * 6 - dx * 2]], c);
  });
  img.set(x, cy, C.yellow);
}

export function renderDock(look: DockLook = "lighthouse"): Img {
  const L = LOOK.jade;
  const img = new Img(BG_W, BG_H);
  const r = rng(4242);

  // sky + far sea (shared with the jade sea)
  vgrad(img, 0, HORIZON, L.sky);
  for (let i = 0; i < 4; i++) cloud(img, 280 + r() * 360, 20 + r() * 60, 8 + r() * 8, C.white, C.foam2, C.foam1, r);
  vgrad(img, HORIZON, WATERLINE - 1, L.far);
  for (const [x, w, h] of [[440, 80, 12], [580, 40, 6]] as const)
    ellipse(img, x + w / 2, HORIZON + 1, w / 2, h, (px, py, nx, ny) => (py > HORIZON ? 0 : ny < -0.6 ? C.green3 : nx < 0 ? C.green2 : C.green1));
  hline(img, 0, BG_W - 1, HORIZON, lighter(L.far[0]!));
  for (let i = 0; i < 60; i++) {
    const y = HORIZON + 3 + Math.floor(r() ** 2 * (WATERLINE - HORIZON - 6)), x = 240 + Math.floor(r() * 400);
    hline(img, x, x + 1 + Math.floor(r() * 3), y, lighter(img.get(x, y)));
  }

  // underwater
  vgrad(img, WATERLINE, BG_H - 1, L.under);
  underwaterRays(img, L.rays);

  // island hill: grass on top, beach where it meets the water
  for (let x = 0; x < 250; x++) {
    const top = Math.round(hillTop(x));
    for (let y = top; y < WATERLINE; y++) {
      const d = y - top;
      const beach = x > 150 && y > WATERLINE - 12 - (x - 150) * 0.05;
      img.set(x, y, beach ? dither(x, y, (y - (WATERLINE - 14)) / 14, C.sand2, C.sand1) : ground(look, x, y, d));
    }
  }
  const trees = (xs: number[]) => {
    for (const tx of xs) {
      const ty = Math.round(hillTop(tx)) - 2;
      disc(img, tx, ty - 3, 4, C.green1);
      disc(img, tx - 1, ty - 4, 3, C.green2);
      img.set(tx - 2, ty - 6, C.green3);
      vline(img, tx, ty, ty + 3, C.bark2);
    }
  };
  const houses = (list: readonly (readonly [number, number, number, number, number])[]) => {
    for (const [x, w, h, wall, roof] of list) house(img, x, Math.round(hillTop(x + w / 2)) + 4, w, h, wall, roof);
  };

  if (look === "lighthouse") {
    const lx = 26, lb = Math.round(hillTop(lx)) + 2;
    for (let y = lb - 44; y < lb; y++) {
      const half = 4 + Math.floor((y - (lb - 44)) / 14);
      hline(img, lx - half, lx + half, y, Math.floor((y - (lb - 44)) / 7) % 2 === 0 ? C.white : C.red2);
      img.set(lx - half, y, C.gray2);
    }
    rect(img, lx - 4, lb - 52, 9, 8, C.navy);
    rect(img, lx - 3, lb - 51, 7, 6, C.yellow);
    polygon(img, [[lx - 6, lb - 52], [lx, lb - 58], [lx + 6, lb - 52]], C.red1);
    houses([[52, 16, 11, C.white, C.red2], [84, 18, 12, C.sand2, C.sea1], [118, 14, 10, C.white, C.coral], [146, 18, 11, C.sand2, C.wood]]);
    trees([42, 74, 108, 138, 172]);
  } else if (look === "market") {
    // 물시장: a mast strung with pennants, stalls down the raft heap, an old hull on the beach
    const mx = 22, mb = Math.round(hillTop(mx)) + 2;
    vline(img, mx, mb - 54, mb, C.bark1);
    vline(img, mx + 1, mb - 54, mb, C.bark2);
    hline(img, mx - 6, mx + 7, mb - 44, C.bark1);
    const flags = [C.coral, C.yellow, C.sea2, C.white, C.red2];
    for (let i = 0; i < 26; i++) {
      const x = mx + 2 + i * 6, y = mb - 52 + Math.round(i * 2.4 + Math.sin(i * 0.5) * 1.5);
      if (x > 200) break;
      img.set(x, y, C.bark1);
      polygon(img, [[x, y + 1], [x + 4, y + 1], [x + 2, y + 5]], flags[i % flags.length]!);
    }
    for (const [x, w, stripe] of [[40, 18, C.coral], [74, 20, C.sea1], [108, 16, C.yellow], [138, 20, C.red2]] as const)
      stall(img, x, Math.round(hillTop(x + w / 2)) + 4, w, stripe);
    for (const [x, y] of [[66, 0], [100, 0], [132, 0]] as const) {
      const by = Math.round(hillTop(x)) + 2 + y;
      rect(img, x, by - 5, 5, 5, C.wood); // crates
      hline(img, x, x + 4, by - 5, C.sand1);
      vline(img, x + 2, by - 4, by - 1, C.bark2);
    }
    // a beached old hull, upside down, used as a shed
    ellipse(img, 186, WATERLINE - 8, 16, 6, (px, py, nx, ny) => (ny > 0.2 ? 0 : ny < -0.6 ? C.sea2 : C.sea1));
    hline(img, 171, 201, WATERLINE - 8, C.deep2);
    rect(img, 183, WATERLINE - 8, 5, 5, C.bark2);
    // lanterns
    for (const lxx of [50, 118, 160]) {
      const ly = Math.round(hillTop(lxx)) - 18;
      vline(img, lxx, ly - 3, ly - 1, C.bark1);
      rect(img, lxx - 1, ly, 3, 3, C.yellow);
      img.set(lxx, ly + 1, C.peach);
    }
  } else if (look === "salt") {
    // 소금꽃섬: salt pans on terraces, white heaps, 바람개비 turning in the wind
    for (const [x0, x1] of [[34, 70], [78, 116], [124, 150]] as const) {
      const y = Math.round(hillTop((x0 + x1) / 2)) + 3;
      for (let x = x0; x <= x1; x++) {
        const top = Math.round(hillTop(x)) + 2;
        for (let yy = Math.min(top, y); yy <= y + 2; yy++) img.set(x, yy, yy === y + 2 ? C.sand1 : dither(x, yy, 0.25, C.foam1, C.foam2));
      }
      for (let x = x0 + 9; x < x1; x += 10) vline(img, x, y - 1, y + 1, C.sand1);
    }
    for (const [x, h] of [[58, 7], [100, 9], [140, 6]] as const) {
      const b = Math.round(hillTop(x)) + 1;
      polygon(img, [[x - h, b], [x, b - h], [x + h, b]], (px) => (px < x ? C.white : C.gray2));
    }
    pinwheel(img, 20, Math.round(hillTop(20)) + 2, 30, [C.coral, C.yellow, C.sea2, C.white]);
    pinwheel(img, 86, Math.round(hillTop(86)) + 2, 22, [C.yellow, C.sea2, C.coral, C.white]);
    pinwheel(img, 160, Math.round(hillTop(160)) + 2, 18, [C.sea2, C.coral, C.yellow, C.white]);
    houses([[112, 16, 10, C.white, C.sea1]]);
  } else {
    // a plain village (islands without their own art yet): a water tower, more houses
    const tx = 30, tb = Math.round(hillTop(tx)) + 2;
    for (const dx of [-6, 6]) line(img, tx + dx, tb, tx + Math.sign(dx) * 3, tb - 30, C.bark2);
    rect(img, tx - 8, tb - 42, 17, 12, C.gray2);
    hline(img, tx - 8, tx + 8, tb - 42, C.white);
    hline(img, tx - 8, tx + 8, tb - 31, C.gray1);
    polygon(img, [[tx - 9, tb - 42], [tx, tb - 48], [tx + 9, tb - 42]], C.red1);
    houses([[48, 14, 10, C.sand2, C.red2], [70, 18, 12, C.white, C.sea1], [96, 16, 11, C.white, C.wood], [122, 14, 10, C.sand2, C.coral], [146, 18, 11, C.white, C.red2]]);
    trees([64, 90, 116, 140, 172]);
  }

  // seabed: the beach slopes down under the water, then a flat sandy floor
  const bed = (x: number) => (x < DOCK.bedFrom ? WATERLINE : Math.min(DOCK.bedY, WATERLINE + ((x - DOCK.bedFrom) / (DOCK.bedTo - DOCK.bedFrom)) * (DOCK.bedY - WATERLINE)));
  const under = new Img(BG_W, BG_H);
  for (let x = 0; x < BG_W; x++)
    for (let y = Math.round(bed(x)); y < BG_H; y++) {
      // ground cross-section: a sandy skin over darker soil
      const d = y - bed(x);
      under.set(x, y, d < 6 ? dither(x, y, d / 6, C.sand2, C.sand1) : d < 26 ? dither(x, y, (d - 6) / 20, C.sand1, C.wood) : dither(x, y, Math.min(1, (d - 26) / 40), C.wood, C.bark2));
    }
  for (const [x, y, w, h] of [[262, 268, 10, 6], [300, 300, 14, 8], [470, 326, 18, 8], [560, 328, 12, 6]] as const)
    ellipse(under, x, y, w / 2, h / 2, (px, py, nx, ny) => (ny < -0.3 ? C.gray2 : C.gray1));
  for (const sx of [250, 284, 320, 420, 512, 600]) {
    const base = Math.round(bed(sx));
    for (let k = 0; k < 14; k++) under.set(sx + Math.round(Math.sin(k * 0.7 + sx) * 1.5), base - k, k % 4 === 0 ? C.green3 : C.green2);
  }
  ellipse(under, 520, 322, 7, 6, (px, py, nx, ny) => (Math.hypot(nx, ny) < 0.45 ? 0 : C.navy)); // sunken tire

  // pier pilings reach the seabed (fogged with the rest of the underwater layer)
  for (let px = DOCK.pierFrom + 8; px <= DOCK.pierTo; px += 38) {
    rect(under, px, WATERLINE, 3, Math.round(bed(px)) - WATERLINE, C.bark2);
    vline(under, px + 2, WATERLINE, Math.round(bed(px)), C.bark1);
    for (let y = WATERLINE; y < WATERLINE + 8; y++) if (r() > 0.4) under.set(px + (r() > 0.5 ? 0 : 2), y, C.green2);
  }
  fogInto(img, under, (y) => Math.min(0.85, 0.12 + ((y - WATERLINE) / (BG_H - WATERLINE)) * 0.3));

  // marine snow
  for (let i = 0; i < 50; i++) {
    const x = 200 + Math.floor(r() * 440), y = WATERLINE + 4 + Math.floor(r() * (BG_H - WATERLINE - 4));
    img.set(x, y, lighter(lighter(img.get(x, y))));
  }
  surfaceBand(img, L.under[0]!, Math.round(DOCK.shoreX - 30));

  // pier above water: pilings, deck, railing posts and rope
  for (let px = DOCK.pierFrom + 8; px <= DOCK.pierTo; px += 38) {
    rect(img, px, DOCK.pierTop + 3, 3, WATERLINE - DOCK.pierTop - 3, C.bark2);
    vline(img, px + 2, DOCK.pierTop + 3, WATERLINE - 1, C.bark1);
  }
  rect(img, DOCK.pierFrom, DOCK.pierTop, DOCK.pierTo - DOCK.pierFrom, 4, C.wood);
  hline(img, DOCK.pierFrom, DOCK.pierTo - 1, DOCK.pierTop, C.sand1);
  hline(img, DOCK.pierFrom, DOCK.pierTo - 1, DOCK.pierTop + 3, C.bark1);
  for (let x = DOCK.pierFrom; x < DOCK.pierTo; x += 6) vline(img, x, DOCK.pierTop + 1, DOCK.pierTop + 2, C.bark2);
  const posts: number[] = [];
  for (let x = DOCK.pierFrom + 2; x < DOCK.pierTo - 30; x += 28) posts.push(x);
  for (const x of posts) {
    rect(img, x, DOCK.pierTop - 11, 2, 11, C.bark2);
    img.set(x, DOCK.pierTop - 11, C.wood);
  }
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i]!, b = posts[i + 1]!;
    for (let x = a + 2; x < b; x++) img.set(x, DOCK.pierTop - 9 + Math.round(Math.sin(((x - a) / (b - a)) * Math.PI) * 2), C.sand1);
  }
  // bollard with a rope coil at the end of the pier
  rect(img, DOCK.pierTo - 8, DOCK.pierTop - 5, 4, 5, C.gray1);
  hline(img, DOCK.pierTo - 9, DOCK.pierTo - 3, DOCK.pierTop - 5, C.gray2);
  ellipse(img, DOCK.pierTo - 18, DOCK.pierTop - 1, 3, 1.5, C.sand1);

  return img;
}

/** Preview: one background in every LUT (time of day + pollution). */
export function lutVariants(base: Img): { name: LutName; img: Img }[] {
  return (Object.keys(LUTS) as LutName[]).map((name) => ({ name, img: base.remap(LUTS[name]) }));
}

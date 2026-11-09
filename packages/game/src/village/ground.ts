import { lutHex } from "../assets";
import type { Ground, VillageDef } from "./maps";

// Bakes a village's ground once. The coast isn't drawn tile by tile: a smoothed land field
// (bilinear between tile centers, roughened a little) gives rounded shores; water grows
// lighter toward land; soft grounds fray into each other; raft decks and log rafts float
// with a front face, a shadow on the water and rope railings where they meet it.
// Two foam rings along the shore are returned separately — the scene fades them in turn so
// the water laps at the land. Day colors; time of day is a tint on top.
// A margin of open sea can be baked around the map (a wide view shows past the map's edges);
// the map itself comes out the same whatever the margin.

export const TL = 16;

type Col = Parameters<typeof lutHex>[0];
const rgbCache = new Map<string, [number, number, number]>();
function rgb(name: Col): [number, number, number] {
  let c = rgbCache.get(name);
  if (!c) {
    const h = lutHex(name);
    rgbCache.set(name, (c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]));
  }
  return c;
}

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

export const isDeck = (t: Ground) => t === "=" || t === "#";
const isLand = (t: Ground) => t !== "~" && !isDeck(t);

function texel(t: Ground, x: number, y: number): Col {
  switch (t) {
    case ".":
    case ",": {
      const n = hash(x >> 2, y >> 2, 3);
      if (t === "," && hash(x, y, 9) < 0.03) return (["coral", "yellow", "white", "violet2", "peach"] as Col[])[Math.floor(hash(x, y, 10) * 5)]!;
      if (hash(x, y, 4) < 0.012 && (y & 1) === 0) return "green3";
      return n < 0.1 ? (bayer(x, y) < 0.5 ? "green1" : "green2") : n > 0.86 ? (bayer(x, y) < 0.5 ? "green3" : "green2") : "green2";
    }
    case "s":
      return hash(x, y, 5) < 0.08 ? "sand1" : hash(x, y, 6) < 0.012 ? "white" : "sand2";
    case ":":
      return hash(x, y, 7) < 0.025 ? "gray2" : hash(x >> 1, y >> 1, 8) < 0.3 ? "wood" : "sand1";
    case "o": {
      const row = Math.floor(y / 5), cx = (x + (row % 2) * 3) % 6;
      if (y % 5 === 4 || cx === 5) return "gray1";
      return cx === 0 && y % 5 === 0 ? "white" : "gray2";
    }
    case "=": {
      // planks across, staggered joints and nails
      const plank = Math.floor(y / 4);
      if (y % 4 === 3) return "bark2";
      const joint = (x + plank * 7) % 24;
      if (joint === 0) return "bark2";
      if (joint === 2 && y % 4 === 1) return "bark1";
      return plank % 3 === 1 ? (bayer(x, y) < 0.3 ? "sand1" : "wood") : "wood";
    }
    case "#": {
      // a raft of round logs running up and down, lashed every tile
      const log = Math.floor(x / 5), lx = x % 5;
      if (lx === 4) return "bark1"; // gap between logs
      if (y % TL === 6 || y % TL === 7) return lx === 0 ? "bark2" : "sand1"; // rope lashing
      if (lx === 0) return "sand1"; // lit side of the log
      if (lx === 3) return "bark2";
      return hash(log, y >> 3, 14) < 0.15 ? "bark2" : "wood";
    }
    case "r": {
      const row = Math.floor(y / 6), off = (row % 2) * 4;
      const cx = (x + off) % 8, cy = y % 6;
      if (cx === 7 || cy === 5) return "gray1";
      if ((cx === 0 && cy === 0) || (cx === 6 && cy === 4)) return "gray1";
      if (cy === 0 || cx === 0) return hash(Math.floor((x + off) / 8), row, 11) < 0.5 ? "white" : "gray2";
      if (cy === 4 || cx === 6) return "gray1";
      return "gray2";
    }
    case "w":
      return hash(x, y, 13) < 0.1 ? "foam2" : (x + y) % 9 === 0 ? "foam1" : "white";
    case "~":
      return "jade3";
  }
}

/** Darker shade a land texel takes right at the shore (a bevel). */
const EDGE: Partial<Record<Ground, Col>> = { ".": "green1", ",": "green1", s: "sand1", ":": "wood", r: "gray1", w: "foam1", o: "gray1" };

/** `ox`, `oy`: where the map's top-left sits in the canvases (the margin, px); `mx`, `my` the
 *  margin in tiles. */
export type BakedGround = { ground: HTMLCanvasElement; foamIn: HTMLCanvasElement; foamOut: HTMLCanvasElement; ox: number; oy: number; mx: number; my: number };

/** A modulo that stays positive for negative x (the margin left of / above the map). */
const pmod = (x: number, m: number) => ((x % m) + m) % m;

export function bakeGround(def: VillageDef, mx = 0, my = 0): BakedGround {
  const W = def.w, H = def.h, ox = mx * TL, oy = my * TL, Wp = W * TL + 2 * ox, Hp = H * TL + 2 * oy;
  const tile = (tx: number, ty: number): Ground => def.ground[ty]?.[tx] ?? "~";
  const tileAt = (px: number, py: number): Ground => tile(Math.floor(px / TL), Math.floor(py / TL));

  // land per tile (1/0), and a wider blur of it for the water's depth
  const land = new Float32Array(W * H), wide = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) land[y * W + x] = isLand(tile(x, y)) ? 1 : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          s += xx >= 0 && yy >= 0 && xx < W && yy < H ? land[yy * W + xx]! : 0;
          n++;
        }
      wide[y * W + x] = s / n;
    }
  const field = (arr: Float32Array, px: number, py: number) => {
    const u = px / TL - 0.5, v = py / TL - 0.5;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    const at = (a: number, b: number) => (a >= 0 && b >= 0 && a < W && b < H ? arr[b * W + a]! : 0);
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  };
  /** Which land a pixel shows: the four nearest tile centers vote, weighted by closeness (with
   *  a little noise), so borders between grounds come out rounded instead of tile-stepped. */
  const landAt = (px: number, py: number): Ground => {
    const u = px / TL - 0.5, v = py / TL - 0.5;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    const votes = new Map<Ground, number>();
    const corners: [number, number, number][] = [[i, j, (1 - fx) * (1 - fy)], [i + 1, j, fx * (1 - fy)], [i, j + 1, (1 - fx) * fy], [i + 1, j + 1, fx * fy]];
    for (const [a, b, w] of corners) {
      const t = tile(a, b);
      if (!isLand(t)) continue;
      votes.set(t, (votes.get(t) ?? 0) + w + (hash(px >> 1, py >> 1, 40 + t.charCodeAt(0)) - 0.5) * 0.18);
    }
    let best: Ground = "s", bv = -9;
    for (const [t, w] of votes) if (w > bv) (bv = w), (best = t);
    return best;
  };

  const make = () => {
    const c = document.createElement("canvas");
    c.width = Wp;
    c.height = Hp;
    return c;
  };
  const ground = make(), foamIn = make(), foamOut = make();
  const g = ground.getContext("2d")!, fi = foamIn.getContext("2d")!, fo = foamOut.getContext("2d")!;
  const img = g.createImageData(Wp, Hp), inner = fi.createImageData(Wp, Hp), outer = fo.createImageData(Wp, Hp);
  const d = img.data;
  const put = (data: Uint8ClampedArray, x: number, y: number, c: Col, a = 255) => {
    const [r, gg, b] = rgb(c);
    const i = (y * Wp + x) * 4;
    data[i] = r;
    data[i + 1] = gg;
    data[i + 2] = b;
    data[i + 3] = a;
  };

  for (let cy = 0; cy < Hp; cy++)
    for (let cx = 0; cx < Wp; cx++) {
      // map pixel (negative / past the map in the margin: open water)
      const x = cx - ox, y = cy - oy;
      const own = tileAt(x, y);
      const f = field(land, x, y) + (hash(x >> 1, y >> 1, 31) - 0.5) * 0.14;
      let c: Col;
      if (isDeck(own)) c = deckTexel(own, x, y, tileAt);
      else if (f >= 0.5) {
        const t = landAt(x, y);
        c = f < 0.57 ? (EDGE[t] ?? texel(t, x, y)) : texel(t, x, y);
      } else {
        // water: lighter toward land, a thin foam line at the shore, a deck's shadow
        const shallow = Math.min(1, field(wide, x, y) * 2.4);
        const p = 0.65 + shallow * 1.35;
        const ramp: Col[] = ["jade2", "jade3", "foam1"];
        const k = Math.floor(p);
        c = bayer(x, y) < p - k ? ramp[Math.min(2, k + 1)]! : ramp[k]!;
        if (shallow < 0.3 && pmod(y, 7) === 0 && pmod(x + Math.floor(y / 7) * 9, 13) < 3) c = "foam1"; // still wave streaks
        if (f >= 0.45) c = bayer(x, y) < 0.7 ? "white" : "foam2";
        else if (f >= 0.41) put(inner.data, cx, cy, "white", 230);
        else if (f >= 0.33 && f < 0.36) put(outer.data, cx, cy, bayer(x, y) < 0.5 ? "white" : "foam2", 200);
        const up = tileAt(x, y - 1), up2 = tileAt(x, y - 2), up3 = tileAt(x, y - 3);
        if (isDeck(up)) c = "jade1";
        else if (isDeck(up2) || isDeck(up3)) c = bayer(x, y) < 0.6 ? "jade2" : c;
      }
      put(d, cx, cy, c);
    }
  g.putImageData(img, 0, 0);
  fi.putImageData(inner, 0, 0);
  fo.putImageData(outer, 0, 0);
  return { ground, foamIn, foamOut, ox, oy, mx, my };
}

/** A deck or log raft pixel: its texture, a front face and side rims at the water, rope railings
 *  with posts along every edge that faces open water (not where a bridge or land joins it). */
function deckTexel(t: Ground, x: number, y: number, tileAt: (x: number, y: number) => Ground): Col {
  const lx = x % TL, ly = y % TL;
  const N = tileAt(x, y - ly - 1), S = tileAt(x, y - ly + TL), Wt = tileAt(x - lx - 1, y), E = tileAt(x - lx + TL, y);
  const water = (n: Ground) => n === "~";
  // the front face where the raft meets the water below
  if (water(S) && ly >= 14) return ly === 15 ? "bark1" : "bark2";
  // posts at the corners of water edges, ropes between them
  const post = (a: number) => a % 8 === 1 || a % 8 === 2;
  if (water(N) && ly <= 2) {
    if (post(lx) && ly <= 2) return ly === 0 ? "sand1" : "bark1";
    if (ly === 1) return "sand2"; // rope
  }
  if (water(S) && ly >= 9 && ly <= 13) {
    if (post(lx)) return ly === 9 ? "sand1" : "bark1";
    if (ly === 10) return "sand2";
  }
  if (water(Wt) && lx <= 2) {
    if (post(ly) && lx <= 1) return lx === 0 ? "bark1" : "sand1";
    if (lx === 1) return "sand2";
  }
  if (water(E) && lx >= 13) {
    if (post(ly) && lx >= 14) return lx === 15 ? "bark1" : "sand1";
    if (lx === 14) return "sand2";
  }
  // a dark rim along sides open to the water
  if ((water(Wt) && lx === 0) || (water(E) && lx === 15)) return "bark1";
  return texel(t, x, y);
}

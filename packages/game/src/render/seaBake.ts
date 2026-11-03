import {
  deepField, depthAt, fbm, FLAG_RUINS, FLAG_VALLEY, ISLANDS, islandField, Kind, LAND, MAP_H, MAP_W,
  ruinsField, RUINS_CUT, seaGrid, TILE, VALLEY, ZONE_CUTS, type Island, type Part,
} from "@sea/shared";
import { C } from "@sea/sprites/palette";

// Bakes the whole top-down sea map (design §3-1, §3-3, §6-2) into palette indices, once.
// Pure (no DOM): the game turns it into pixels per frame (with time-of-day LUTs), and
// scripts/map-preview.ts writes the same buffer to PNG for review.

// Imported bindings can compile to getter calls (tsx/CJS interop); these loops run over ~8M
// pixels, so snapshot everything they touch into plain module constants.
const PAL = { ...C };
const TL = TILE, MW = MAP_W, MH = MAP_H;
const LANDL = { ...LAND };
const F_RUINS = FLAG_RUINS, F_VALLEY = FLAG_VALLEY, R_CUT = RUINS_CUT;
const K_REEF = Kind.Reef, K_PIER = Kind.Pier, K_WATER = Kind.Water;
const ISL: Island[] = [...ISLANDS];
const VAL = { ...VALLEY };
const ruinsF = ruinsField, fbmF = fbm, islandF = islandField, depthF = depthAt, deepF = deepField;
const CUT_A = ZONE_CUTS[0], CUT_B = ZONE_CUTS[1], CUT_C = ZONE_CUTS[2];

export const WORLD_W = MW * TL;
export const WORLD_H = MH * TL;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// light → dark water ramp; depth picks a fractional position along it
const RAMP = [PAL.foam2, PAL.foam1, PAL.jade3, PAL.jade2, PAL.sea2, PAL.sea1, PAL.deep2, PAL.deep1, PAL.navy, PAL.ink];

function rampPos(d: number): number {
  if (d < CUT_A) return 2 + (d / CUT_A) * 1.2; // jade3 → jade2
  if (d < CUT_B) return 4 + ((d - CUT_A) / (CUT_B - CUT_A)) * 1.1; // sea2 → sea1
  if (d < CUT_C) return 5.4 + ((d - CUT_B) / (CUT_C - CUT_B)) * 1.2; // sea1 → deep2
  return 7 + Math.min(1, (d - CUT_C) / 0.3) * 1.2; // deep1 → navy
}

/** 0..1 how far inside 버려진 골 a point is — per pixel, so the edge isn't tile-stepped. */
const valleyAt = (fx: number, fy: number) => {
  const d = Math.hypot(fx - VAL.cx, fy - VAL.cy);
  if (d > VAL.r + 3) return 0;
  return Math.max(0, Math.min(1, (VAL.r + (fbmF(fx / 4, fy / 4, 13) - 0.5) * 4 - d) / 1.5 + 0.5));
};

export function bakeSea(): Uint8Array {
  const g = seaGrid();
  const W = WORLD_W, H = WORLD_H;
  const out = new Uint8Array(W * H);

  // zone depth + deep pockets on the tile-corner lattice
  const LW = MW + 1, LH = MH + 1;
  const depthL = new Float32Array(LW * LH), deepL = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++)
    for (let x = 0; x < LW; x++) {
      depthL[y * LW + x] = depthF(x, y);
      deepL[y * LW + x] = deepF(x, y);
    }
  const lerp2 = (arr: Float32Array, fx: number, fy: number) => {
    const x0 = Math.min(LW - 2, Math.floor(fx)), y0 = Math.min(LH - 2, Math.floor(fy));
    const u = fx - x0, v = fy - y0, i = y0 * LW + x0;
    return arr[i]! * (1 - u) * (1 - v) + arr[i + 1]! * u * (1 - v) + arr[i + LW]! * (1 - u) * v + arr[i + LW + 1]! * u * v;
  };

  // island field (the expensive part) on a 4 px lattice near natural islands, interpolated
  const S = 4, QW = W / S + 1, QH = H / S + 1;
  const landQ = new Float32Array(QW * QH).fill(9);
  const islQ = new Int8Array(QW * QH).fill(-1);
  const grassQ = new Float32Array(QW * QH);
  for (const isl of ISL) {
    if (isl.ground === "none") continue;
    const rx = isl.r * Math.max(1, isl.squash) * 1.9 + 1, ry = isl.r * 1.9 + 1;
    const qx0 = Math.max(0, Math.floor(((isl.cx - rx) * TL) / S)), qx1 = Math.min(QW - 1, Math.ceil(((isl.cx + rx) * TL) / S));
    const qy0 = Math.max(0, Math.floor(((isl.cy - ry) * TL) / S)), qy1 = Math.min(QH - 1, Math.ceil(((isl.cy + ry) * TL) / S));
    for (let qy = qy0; qy <= qy1; qy++)
      for (let qx = qx0; qx <= qx1; qx++) {
        const i = qy * QW + qx;
        const f = islandF((qx * S) / TL, (qy * S) / TL);
        if (f.d < landQ[i]!) { landQ[i] = f.d; islQ[i] = f.island; }
        if (f.d < LANDL.sand) grassQ[i] = fbmF((qx * S * 1.5) / TL, (qy * S * 1.5) / TL, 41);
      }
  }
  const lerpQ = (arr: Float32Array, x: number, y: number) => {
    const fx = x / S, fy = y / S;
    const x0 = Math.min(QW - 2, Math.floor(fx)), y0 = Math.min(QH - 2, Math.floor(fy));
    const u = fx - x0, v = fy - y0, i = y0 * QW + x0;
    return arr[i]! * (1 - u) * (1 - v) + arr[i + 1]! * u * (1 - v) + arr[i + QW]! * (1 - u) * v + arr[i + QW + 1]! * u * v;
  };
  const landD = new Float32Array(W * H);
  const landIsl = new Int8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      landD[y * W + x] = lerpQ(landQ, x + 0.5, y + 0.5);
      landIsl[y * W + x] = islQ[Math.round(y / S) * QW + Math.round(x / S)]!;
    }

  for (let y = 0; y < H; y++) {
    const ty = Math.floor(y / TL), fy = (y + 0.5) / TL;
    for (let x = 0; x < W; x++) {
      const tx = Math.floor(x / TL), fx = (x + 0.5) / TL;
      const ti = ty * MW + tx, i = y * W + x;
      const flags = g.flags[ti]!;
      const ld = landD[i]!;

      // ── natural land, styled by the island's ground ──
      if (ld < LANDL.sand) {
        const ground = ISL[landIsl[i]!]?.ground ?? "grass";
        out[i] = ld >= LANDL.grass ? beach(ground, x, y, ld) : interior(ground, x, y, ld, lerpQ(grassQ, x + 0.5, y + 0.5));
        continue;
      }

      // ── water ──
      const depth = lerp2(depthL, fx, fy);
      let p = rampPos(depth);
      if (ld < LANDL.shallow) p -= ((LANDL.shallow - ld) / (LANDL.shallow - LANDL.sand)) * 1.8; // shallows brighten
      if (g.sea[ti]! >= 1 && ld >= LANDL.shallow) p += Math.max(0, Math.min(1, (lerp2(deepL, fx, fy) - 0.56) / 0.1)) * 1.3; // deep pockets
      const vk = flags & F_VALLEY || Math.abs(tx - VAL.cx) < VAL.r + 3 ? valleyAt(fx, fy) : 0;
      if (vk > 0) p += 1.2 * vk;
      if (ld >= LANDL.shallow && y % 5 === 0 && (x + (y / 5) * 7) % 13 < 2) p -= 0.7; // static wave streaks
      p = Math.max(0, Math.min(RAMP.length - 1.001, p));
      const k = Math.floor(p);
      let c = bayer(x, y) < p - k ? RAMP[k + 1]! : RAMP[k]!;

      if (ld < 1.06) {
        const ground = ISL[landIsl[i]!]?.ground;
        c = ground === "black" ? (bayer(x, y) < 0.5 ? PAL.gray1 : PAL.violet1) : bayer(x, y) < 0.7 ? PAL.foam2 : PAL.white; // surf (oily on 검은모래섬)
      }

      if (vk > 0 && fbmF(fx * 3, fy * 3, 19, 2) > 0.62 && bayer(x, y) < 0.5 * vk) c = PAL.violet1; // oil sheen

      out[i] = c;
    }
  }

  const b: Bake = { out, W, H, landD, landIsl };
  drawDrownedTown(b, g);
  drawUnderwater(b);
  drawTrees(b);
  drawReefs(b, g);
  drawPiers(b, g);
  for (const isl of ISL) for (const part of isl.parts) drawPart(b, isl, part);
  ISL.forEach((isl, k) => drawDeco(b, isl, k));
  drawHouses(b);
  return out;
}

type Bake = { out: Uint8Array; W: number; H: number; landD: Float32Array; landIsl: Int8Array };

/** 잠긴 마을 (design §3-3): roofs and streets of the drowned town under the jade water.
 *  Drawn as clean shapes one or two shades darker than the water around them — the water
 *  "tints" them — so they read as sunken houses, not as dithered stains. Each 3×2-tile block
 *  holds 0–2 houses (gable roof: north face, ridge, south face), with streets between. */
function drawDrownedTown(b: Bake, g: ReturnType<typeof seaGrid>): void {
  const BX = 3 * TL, BY = 2 * TL;
  // [north face, south face, ridge]: mostly mossy teal, now and then an old brown roof
  const TEAL: [number, number, number] = [PAL.jade2, PAL.jade1, PAL.deep2];
  const DEEP: [number, number, number] = [PAL.jade1, PAL.deep2, PAL.deep1];
  const BROWN: [number, number, number] = [PAL.wood, PAL.bark2, PAL.bark1];
  const onWater = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= b.W || y >= b.H) return -1;
    const i = y * b.W + x;
    if (b.landD[i]! < LANDL.shallow) return -1;
    const ti = Math.floor(y / TL) * MW + Math.floor(x / TL);
    return g.flags[ti]! & F_RUINS && g.kind[ti] === K_WATER ? i : -1;
  };
  const put = (x: number, y: number, c: number) => {
    const i = onWater(x, y);
    if (i >= 0) b.out[i] = c;
  };
  for (let by = 0; by * BY < b.H; by++)
    for (let bx = 0; bx * BX < b.W; bx++) {
      const x0 = bx * BX, y0 = by * BY;
      const ti = Math.floor((y0 + BY / 2) / TL) * MW + Math.floor((x0 + BX / 2) / TL);
      if (!(g.flags[ti]! & F_RUINS)) continue;
      // toward the edge of the town the houses thin out
      const strength = Math.max(0, Math.min(1, (ruinsF((x0 + BX / 2) / TL, (y0 + BY / 2) / TL) - R_CUT) / 0.08 + 0.3));
      // streets: a faint dashed line along the block's north and west edges
      for (let x = 0; x < BX; x++) if ((x >> 1) % 2 === 0 && strength > 0.45) put(x0 + x, y0 + 1, PAL.jade1);
      for (let y = 0; y < BY; y++) if ((y >> 1) % 2 === 0 && strength > 0.45) put(x0 + 1, y0 + y, PAL.jade1);
      const n = hash(bx, by, 9) > strength ? 0 : hash(bx, by, 10) < 0.55 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const w = 12 + Math.floor(hash(bx, by, 20 + k) * 8), h = 8 + Math.floor(hash(bx, by, 30 + k) * 4) * 2;
        const half = n === 2 ? BX / 2 : BX;
        const hx = x0 + (n === 2 && k === 1 ? BX / 2 : 0) + 5 + Math.floor(hash(bx, by, 40 + k) * Math.max(0, half - 8 - w));
        const hy = y0 + 5 + Math.floor(hash(bx, by, 50 + k) * Math.max(0, BY - 9 - h));
        // only whole houses: a roof cut by the shore or the town's edge would read as a stray sliver
        const fits = [[0, 0], [w, 0], [0, h], [w, h], [w >> 1, h >> 1]].every(([dx, dy]) => onWater(hx + dx!, hy + dy!) >= 0);
        if (!fits) continue;
        const r = hash(bx, by, 60 + k);
        const [north, south, ridgeC] = r < 0.2 ? BROWN : r < 0.6 ? TEAL : DEEP;
        const ridge = h / 2;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) put(hx + x, hy + y, y === ridge || y === ridge - 1 ? ridgeC : y < ridge ? north : south);
        // the house's shadow on the sea floor (south and east)
        for (let x = 2; x <= w; x++) put(hx + x, hy + h, PAL.deep1);
        for (let y = 2; y < h; y++) put(hx + w, hy + y, PAL.deep1);
      }
    }
}

// ── ground styles ───────────────────────────────────────────────────────────

function beach(ground: Island["ground"], x: number, y: number, ld: number): number {
  const wet = ld > 0.95;
  switch (ground) {
    case "rock":
      return hash(x >> 1, y >> 1, 3) < 0.35 ? PAL.gray1 : PAL.gray2; // pebbles
    case "darkrock":
      return hash(x >> 1, y >> 1, 3) < 0.4 ? PAL.navy : PAL.gray1;
    case "black":
      return wet ? (bayer(x, y) < 0.5 ? PAL.ink : PAL.violet1) : hash(x, y, 3) < 0.15 ? PAL.gray1 : PAL.ink; // oily black sand
    case "port":
      return (x + y) % 6 === 0 ? PAL.gray1 : PAL.gray2; // concrete apron
    default:
      return wet ? (bayer(x, y) < 0.5 ? PAL.sand1 : PAL.sand2) : hash(x, y, 3) < 0.07 ? PAL.sand1 : PAL.sand2;
  }
}

function interior(ground: Island["ground"], x: number, y: number, ld: number, n: number): number {
  switch (ground) {
    case "rock":
      return n > 0.55 ? (ld > 0.6 ? PAL.green3 : PAL.green2) : n > 0.42 ? PAL.gray2 : PAL.gray1;
    case "darkrock":
      return n > 0.6 ? PAL.gray1 : bayer(x, y) < 0.3 ? PAL.ink : PAL.navy;
    case "black":
      return n > 0.58 ? PAL.green1 : bayer(x, y) < 0.35 ? PAL.gray1 : PAL.ink; // dead scrub on soot
    case "salt":
      return ld > 0.7 ? PAL.green3 : PAL.sand2; // salt pans drawn on top
    case "junk":
      return n > 0.5 ? PAL.bark2 : PAL.sand1; // packed dirt under the heaps
    case "port":
      return x % 12 === 0 || y % 12 === 0 ? PAL.gray1 : PAL.gray2; // slab joints
    default:
      return ld > 0.7 ? PAL.green3 : n > 0.56 ? (bayer(x, y) < (n - 0.56) * 6 ? PAL.green1 : PAL.green2) : PAL.green2;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

const put = (b: Bake, x: number, y: number, c: number) => {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < b.W && y < b.H) b.out[y * b.W + x] = c;
};
const box = (b: Bake, x0: number, y0: number, w: number, h: number, fill: (lx: number, ly: number, x: number, y: number) => number) => {
  x0 = Math.round(x0); y0 = Math.round(y0);
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++) {
      const c = fill(lx, ly, x0 + lx, y0 + ly);
      if (c) put(b, x0 + lx, y0 + ly, c);
    }
};
const disc = (b: Bake, cx: number, cy: number, r: number, fill: (d: number, dx: number, dy: number) => number) => {
  for (let dy = -Math.ceil(r); dy <= r; dy++)
    for (let dx = -Math.ceil(r); dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3) continue;
      const c = fill(d, dx, dy);
      if (c) put(b, cx + dx, cy + dy, c);
    }
};
const line = (b: Bake, x0: number, y0: number, x1: number, y1: number, c: number) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let s = 0; s <= n; s++) put(b, x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, c);
};
const isWater = (b: Bake, x: number, y: number) => {
  const xi = Math.round(x), yi = Math.round(y);
  return xi >= 0 && yi >= 0 && xi < b.W && yi < b.H && b.landD[yi * b.W + xi]! >= LANDL.sand;
};

// ── underwater landmarks ────────────────────────────────────────────────────

function drawUnderwater(b: Bake): void {
  for (const isl of ISL) {
    if (!isl.deco.includes("school_under")) continue;
    // the drowned school around 종탑섬: a long roof with a courtyard, faint under the water
    const x0 = (isl.cx - 5.5) * TL, y0 = (isl.cy - 3.5) * TL, w = 11 * TL, h = 7 * TL;
    box(b, x0, y0, w, h, (lx, ly, x, y) => {
      const edge = lx < 3 || ly < 3 || lx >= w - 3 || ly >= h - 3;
      const court = lx > 30 && lx < w - 30 && ly > 24 && ly < h - 24;
      if (court) return bayer(x, y) < 0.3 ? PAL.jade1 : 0;
      return bayer(x, y) < (edge ? 0.55 : 0.4) ? (edge ? PAL.red1 : PAL.red2) : 0;
    });
  }
}

function drawTrees(b: Bake): void {
  const CELL = 7;
  for (const isl of ISL) {
    if (isl.ground !== "grass" && isl.ground !== "salt" && isl.ground !== "rock") continue;
    const sparse = isl.ground === "grass" ? 0.25 : 0.7; // salt & rock islands: just a few
    const rx = isl.r * Math.max(1, isl.squash) + 1, ry = isl.r + 1;
    for (let cy = Math.floor(((isl.cy - ry) * TL) / CELL); cy <= ((isl.cy + ry) * TL) / CELL; cy++)
      for (let cx = Math.floor(((isl.cx - rx) * TL) / CELL); cx <= ((isl.cx + rx) * TL) / CELL; cx++) {
        const x = cx * CELL + Math.floor(hash(cx, cy, 71) * 4), y = cy * CELL + Math.floor(hash(cx, cy, 72) * 4);
        if (x < 3 || y < 3 || x >= b.W - 3 || y >= b.H - 3) continue;
        const ld = b.landD[y * b.W + x]!;
        if (ld > (isl.ground === "salt" ? 0.74 : 0.6)) continue;
        if (isl.ground === "salt" && ld < 0.62) continue; // only around the pans
        if (fbmF(x / 40, y / 40, 47) < 0.5 || hash(cx, cy, 73) < sparse) continue;
        const r = 2 + hash(cx, cy, 74) * 1.2;
        disc(b, x, y, r, (d, dx, dy) => (d > r - 0.5 && dx + dy > 0 ? PAL.ink : dx + dy < -1.5 ? PAL.green3 : PAL.green1));
      }
  }
}

function drawReefs(b: Bake, g: ReturnType<typeof seaGrid>): void {
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      if (g.kind[ty * MW + tx] !== K_REEF) continue;
      const rocks = 1 + Math.floor(hash(tx, ty, 21) * 3);
      for (let r = 0; r < rocks; r++) {
        const cx = tx * TL + 3 + hash(tx, ty, 30 + r) * 10, cy = ty * TL + 3 + hash(tx, ty, 40 + r) * 10;
        const rad = 2.5 + hash(tx, ty, 50 + r) * 2.5;
        for (let y = Math.floor(cy - rad - 2); y <= cy + rad + 2; y++)
          for (let x = Math.floor(cx - rad - 2); x <= cx + rad + 2; x++) {
            if (x < 0 || y < 0 || x >= b.W || y >= b.H) continue;
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            const i = y * b.W + x;
            if (d <= rad) b.out[i] = x - cx + (y - cy) < -rad * 0.6 ? PAL.gray2 : x - cx + (y - cy) > rad * 0.7 ? PAL.navy : PAL.gray1;
            else if (d <= rad + 1.3 && b.out[i] !== PAL.gray1 && b.out[i] !== PAL.gray2 && b.out[i] !== PAL.navy) b.out[i] = bayer(x, y) < 0.6 ? PAL.foam2 : PAL.white;
          }
      }
    }
}

const inPart = (fx: number, fy: number) => ISL.some((isl) => isl.parts.some((p) => fx - isl.cx >= p.x && fx - isl.cx < p.x + p.w && fy - isl.cy >= p.y && fy - isl.cy < p.y + p.h));

function drawPiers(b: Bake, g: ReturnType<typeof seaGrid>): void {
  const isPier = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < MW && ty < MH && g.kind[ty * MW + tx] === K_PIER;
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      if (!isPier(tx, ty) || inPart(tx + 0.5, ty + 0.5)) continue; // structures are drawn by drawPart
      const horizontal = isPier(tx - 1, ty) || isPier(tx + 1, ty) || !(isPier(tx, ty - 1) || isPier(tx, ty + 1));
      for (let ly = 0; ly < TL; ly++)
        for (let lx = 0; lx < TL; lx++) {
          const along = horizontal ? lx : ly, across = horizontal ? ly : lx;
          if (across < 4 || across > 11) continue;
          const i = (ty * TL + ly) * b.W + tx * TL + lx;
          b.out[i] = across === 4 || across === 11 ? PAL.bark1 : along % 4 === 0 ? PAL.bark2 : PAL.wood;
          if ((across === 4 || across === 11) && along % 8 === 2) b.out[i] = PAL.ink;
        }
    }
}

// ── built structures ────────────────────────────────────────────────────────

function drawPart(b: Bake, isl: Island, p: Part): void {
  const x0 = (isl.cx + p.x) * TL, y0 = (isl.cy + p.y) * TL, w = Math.round(p.w * TL), h = Math.round(p.h * TL);
  const edge = (lx: number, ly: number) => lx === 0 || ly === 0 || lx === w - 1 || ly === h - 1;
  switch (p.mat) {
    case "raft":
      box(b, x0, y0, w, h, (lx, ly) => (edge(lx, ly) ? PAL.bark1 : ly % 4 === 0 ? PAL.bark2 : lx % 11 === 5 ? PAL.bark2 : PAL.wood));
      break;
    case "boat_red":
    case "boat_blue":
    case "boat_white": {
      const hull = p.mat === "boat_red" ? PAL.red2 : p.mat === "boat_blue" ? PAL.sea1 : PAL.white;
      const rim = p.mat === "boat_white" ? PAL.gray2 : hull === PAL.red2 ? PAL.red1 : PAL.deep2;
      box(b, x0, y0, w, h, (lx, ly) => {
        const u = ((lx + 0.5) / w) * 2 - 1, v = ((ly + 0.5) / h) * 2 - 1;
        if (Math.abs(v) > 1 - Math.max(0, Math.abs(u) - 0.55) * 2.2) return 0; // pointed ends
        const inner = Math.abs(v) < 0.55 - Math.max(0, Math.abs(u) - 0.5) * 2;
        if (!inner) return Math.abs(v) > 0.8 || Math.abs(u) > 0.85 ? PAL.ink : rim;
        return lx % 5 === 0 ? PAL.bark2 : PAL.wood;
      });
      break;
    }
    case "tower":
      // the bell tower's top: a stone cap with the bell seen from above
      box(b, x0, y0, w, h, (lx, ly) => (edge(lx, ly) ? PAL.ink : lx < 3 || ly < 3 ? PAL.white : lx > w - 4 || ly > h - 4 ? PAL.gray1 : PAL.gray2));
      disc(b, x0 + w / 2, y0 + h / 2, 4.5, (d) => (d > 3.6 ? PAL.ink : d > 2.2 ? PAL.sand1 : PAL.yellow));
      break;
    case "deck":
      // a broken bridge span: concrete, lane marks, crumbling ends
      box(b, x0, y0, w, h, (lx, ly, x, y) => {
        const endFade = Math.min(lx, w - 1 - lx);
        if (endFade < 4 && hash(x, y, 81) < (4 - endFade) * 0.25) return 0;
        if (ly === 0 || ly === h - 1) return PAL.ink;
        if (ly === 2 || ly === h - 3) return PAL.gray1;
        if (Math.abs(ly - h / 2) < 1 && lx % 10 < 5) return PAL.white;
        return PAL.gray2;
      });
      break;
    case "glass":
      // a drowned skyscraper's roof: glass panels in a steel grid
      box(b, x0, y0, w, h, (lx, ly) => {
        if (edge(lx, ly)) return PAL.ink;
        if (lx % 8 === 0 || ly % 8 === 0) return PAL.gray1;
        return (lx + ly) % 23 < 3 ? PAL.foam2 : (lx >> 3) % 2 === (ly >> 3) % 2 ? PAL.sea3 : PAL.sea2;
      });
      break;
    case "hull":
      // the 태평호 wreck: rusted plates, a deck rail, torn edges
      box(b, x0, y0, w, h, (lx, ly, x, y) => {
        const u = ((lx + 0.5) / w) * 2 - 1, v = ((ly + 0.5) / h) * 2 - 1;
        if (Math.abs(v) > 1 - Math.max(0, u - 0.6) * 2.5) return 0; // tapered bow on the east end
        if ((p.x < 0 ? lx > w - 5 : lx < 4) && hash(x, y, 83) < 0.45) return 0; // torn where it broke
        if (Math.abs(v) > 0.86) return PAL.ink;
        if (Math.abs(v) > 0.7) return PAL.red1;
        return hash(x >> 1, y >> 1, 85) < 0.3 ? PAL.wood : lx % 9 === 0 ? PAL.bark1 : PAL.bark2;
      });
      break;
    case "concrete":
      box(b, x0, y0, w, h, (lx, ly) => (edge(lx, ly) ? PAL.ink : lx % 12 === 0 ? PAL.gray1 : ly === 2 && lx % 16 === 8 ? PAL.ink : PAL.gray2));
      break;
  }
}

// ── landmarks ───────────────────────────────────────────────────────────────

function lighthouse(b: Bake, x: number, y: number, dark: boolean): void {
  disc(b, x + 1, y + 2, 6, (d) => (d > 5 ? 0 : PAL.ink)); // shadow
  disc(b, x, y, 6, (d) => {
    if (d > 5.4) return PAL.ink;
    if (dark) return d > 4 ? PAL.gray1 : d > 2.4 ? PAL.navy : d > 1.2 ? PAL.gray1 : PAL.sand1; // soot-black, a dim lamp
    return d > 4 ? PAL.white : d > 2.4 ? PAL.red2 : d > 1.2 ? PAL.white : PAL.yellow;
  });
  // a short beam pointing at the other lighthouse
  line(b, x + (dark ? -7 : 7), y, x + (dark ? -11 : 11), y, dark ? PAL.sand1 : PAL.yellow);
}

function house(b: Bake, x: number, y: number, roof: number): void {
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -4; dx <= 4; dx++)
      put(b, x + dx, y + dy, dy === 3 || dx === -4 || dx === 4 || dy === -3 ? PAL.ink : dy === 0 ? (roof === PAL.wood ? PAL.bark2 : PAL.red1) : dy < 0 ? roof : roof === PAL.sea1 ? PAL.deep2 : PAL.red1);
}

function drawDeco(b: Bake, isl: Island, k: number): void {
  const cx = isl.cx * TL, cy = isl.cy * TL;
  for (const d of isl.deco) {
    switch (d) {
      case "lighthouse_red":
        lighthouse(b, cx + 4, cy - 2, false);
        break;
      case "lighthouse_black":
        lighthouse(b, cx - 4, cy - 2, true);
        break;
      case "stalls": {
        // awnings over the central raft of 물장터
        const cols = [PAL.coral, PAL.yellow, PAL.sea3, PAL.red2, PAL.jade3];
        for (let s = 0; s < 6; s++) {
          const sx = cx - 26 + (s % 3) * 18, sy = cy - 16 + Math.floor(s / 3) * 16;
          const col = cols[(s + k) % cols.length]!;
          box(b, sx, sy, 12, 8, (lx, ly) => (ly === 7 ? PAL.ink : lx % 4 < 2 ? col : PAL.white));
        }
        break;
      }
      case "saltpans": {
        const w = isl.r * isl.squash * TL * 1.1, h = isl.r * TL * 0.95;
        box(b, cx - w / 2, cy - h / 2, Math.round(w), Math.round(h), (lx, ly, x, y) => {
          if (x < 0 || y < 0 || x >= b.W || y >= b.H || b.landD[y * b.W + x]! > 0.62) return 0;
          if (lx % 14 < 2 || ly % 10 < 2) return PAL.sand1; // dikes
          return hash(x, y, 91) < 0.08 ? PAL.foam1 : (lx + ly) % 19 < 2 ? PAL.foam2 : PAL.white;
        });
        break;
      }
      case "windmills":
        for (const [ox, oy] of [[-0.75, -0.75], [0.8, -0.55], [0.1, 0.85]] as const) {
          const x = cx + ox * isl.r * isl.squash * TL * 0.75, y = cy + oy * isl.r * TL * 0.75;
          line(b, x - 5, y - 5, x + 5, y + 5, PAL.white);
          line(b, x - 5, y + 5, x + 5, y - 5, PAL.white);
          disc(b, x, y, 1.5, () => PAL.coral);
        }
        break;
      case "school_under":
        break; // drawn under the water in drawUnderwater
      case "bridge_houses":
        for (let s = 0; s < 8; s++) {
          const x = cx - 180 + s * 46, y = cy - 6 + (s % 2) * 7;
          if (x > cx - 50 && x < cx - 10) continue; // the broken gap
          house(b, x, y, [PAL.red2, PAL.sea1, PAL.wood, PAL.coral][s % 4]!);
        }
        break;
      case "junk": {
        const cols = [PAL.gray1, PAL.gray2, PAL.red1, PAL.wood, PAL.sea1, PAL.coral, PAL.yellow, PAL.white];
        for (let s = 0; s < 16; s++) {
          const a = hash(k, s, 93) * Math.PI * 2, rr = hash(k, s, 94) * isl.r * 0.6;
          const x = cx + Math.cos(a) * rr * isl.squash * TL, y = cy + Math.sin(a) * rr * TL;
          const rad = 3 + hash(k, s, 95) * 3;
          disc(b, x, y, rad, (dd, dx, dy) => (dd > rad - 0.6 ? PAL.ink : cols[Math.floor(hash(Math.round(x) + dx, Math.round(y) + dy, 96) * cols.length)]!));
        }
        break;
      }
      case "containers": {
        const cols = [PAL.red2, PAL.sea1, PAL.jade2, PAL.yellow, PAL.coral];
        for (let s = 0; s < 10; s++) {
          const x = cx - 40 + (s % 5) * 16, y = cy - 10 + Math.floor(s / 5) * 12;
          const col = cols[(s * 3 + k) % cols.length]!;
          box(b, x, y, 13, 6, (lx, ly) => (lx === 0 || ly === 0 || lx === 12 || ly === 5 || lx % 3 === 0 ? PAL.ink : col));
        }
        break;
      }
      case "cranes":
        // two rusty cranes on the piers, arms reaching west over the water
        for (const oy of [-2.5, 2.5]) {
          const x = cx - 8.5 * TL, y = cy + oy * TL;
          box(b, x - 4, y - 4, 8, 8, (lx, ly) => (lx === 0 || ly === 0 || lx === 7 || ly === 7 ? PAL.ink : PAL.wood));
          for (let s = 4; s < 40; s++) {
            put(b, x - s, y - 1, s % 3 === 0 ? PAL.bark1 : PAL.sand1);
            put(b, x - s, y + 1, s % 3 === 0 ? PAL.bark1 : PAL.wood);
          }
        }
        break;
      case "whalebone": {
        // a whale skeleton over the village: spine, ribs, skull
        const len = isl.r * isl.squash * TL * 1.2;
        for (let s = -len / 2; s <= len / 2; s++) put(b, cx + s, cy, PAL.white);
        for (let r = 0; r < 7; r++) {
          const x = cx - len / 2 + 10 + (r * (len - 30)) / 6, rib = 12 - Math.abs(r - 3) * 1.5;
          for (let t = 0; t <= 1; t += 0.05) {
            put(b, x + Math.sin(t * Math.PI) * 4, cy - t * rib, PAL.white);
            put(b, x + Math.sin(t * Math.PI) * 4, cy + t * rib, PAL.white);
          }
        }
        disc(b, cx + len / 2 + 4, cy, 6, (dd) => (dd > 5 ? PAL.gray2 : dd > 3 ? PAL.white : 0));
        break;
      }
      case "rooftop":
        // 태평해운 tower roof: a helipad and a rooftop shed
        disc(b, cx - 18, cy - 18, 13, (dd, dx, dy) => (dd > 12 ? PAL.ink : dd > 11 ? PAL.yellow : (Math.abs(dx) === 5 && Math.abs(dy) < 6) || (dy === 0 && Math.abs(dx) < 5) ? PAL.white : PAL.gray1));
        box(b, cx + 10, cy + 12, 22, 14, (lx, ly) => (lx === 0 || ly === 0 || lx === 21 || ly === 13 ? PAL.ink : ly < 4 ? PAL.white : PAL.gray2));
        break;
      case "shrine":
        // a small shrine with a red gate facing the water
        house(b, cx - 6, cy - 2, PAL.red1);
        line(b, cx + 8, cy - 8, cx + 8, cy + 6, PAL.red2);
        line(b, cx + 16, cy - 8, cx + 16, cy + 6, PAL.red2);
        line(b, cx + 5, cy - 8, cx + 19, cy - 8, PAL.red2);
        line(b, cx + 7, cy - 5, cx + 17, cy - 5, PAL.red1);
        break;
      case "smoke":
        for (let s = 0; s < 9; s++) {
          const x = cx + (hash(k, s, 97) - 0.3) * isl.r * isl.squash * TL + s * 3, y = cy - 10 - s * 6;
          disc(b, x, y, 4 + s * 0.6, (dd, dx, dy) => (bayer(Math.round(x) + dx, Math.round(y) + dy) < 0.5 - s * 0.04 ? (dd > 3 ? PAL.gray1 : PAL.navy) : 0));
        }
        break;
      case "wreck": {
        // the bridge house on the stern, spilled drums, an oil slick
        box(b, cx - 150, cy - 14, 26, 22, (lx, ly) => (lx === 0 || ly === 0 || lx === 25 || ly === 21 ? PAL.ink : ly < 6 ? PAL.gray2 : lx % 5 === 2 && ly < 12 ? PAL.navy : PAL.white));
        for (let s = 0; s < 14; s++) {
          const x = cx - 130 + hash(k, s, 98) * 260, y = cy + (hash(k, s, 99) - 0.5) * 80;
          if (isWater(b, x, y)) disc(b, x, y, 2.4, (dd) => (dd > 1.8 ? PAL.ink : PAL.red2));
        }
        disc(b, cx + 30, cy + 46, 26, (dd, dx, dy) => (isWater(b, cx + 30 + dx, cy + 46 + dy) && bayer(dx & 1023, dy & 1023) < 0.45 * (1 - dd / 26) ? PAL.ink : 0));
        break;
      }
    }
  }
}

/** Houses on islands with houses > 0, placed on solid ground away from the shore. */
function drawHouses(b: Bake): void {
  const ROOFS = [PAL.red2, PAL.coral, PAL.sea1, PAL.wood];
  ISL.forEach((isl, k) => {
    const spots: [number, number][] = [];
    for (let tries = 0; spots.length < isl.houses && tries < 400; tries++) {
      const a = hash(k, tries, 61) * Math.PI * 2, rr = hash(k, tries, 62) * isl.r * 0.55;
      const x = Math.round((isl.cx + Math.cos(a) * rr * isl.squash) * TL), y = Math.round((isl.cy + Math.sin(a) * rr) * TL);
      if (b.landD[y * b.W + x]! > 0.55) continue;
      if (spots.some(([sx, sy]) => Math.abs(sx - x) < 10 && Math.abs(sy - y) < 9)) continue;
      spots.push([x, y]);
    }
    spots.forEach(([x, y], h) => {
      house(b, x, y, isl.ground === "black" ? PAL.gray1 : ROOFS[(k + h) % ROOFS.length]!);
      put(b, x, y + 4, PAL.green1);
    });
  });
}

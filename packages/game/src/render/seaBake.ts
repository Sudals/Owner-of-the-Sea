import { depthAt, deepField, FLAG_RUINS, FLAG_VALLEY, fbm, VALLEY, ISLANDS, islandField, Kind, LAND, MAP_H, MAP_W, ruinsField, RUINS_CUT, seaGrid, TILE, ZONE_CUTS } from "@sea/shared";
import { C } from "@sea/sprites/palette";

// Imported bindings can compile to getter calls (tsx/CJS interop); this file runs tight
// loops over ~8M pixels, so snapshot everything it touches into plain module constants.
const PAL = { ...C };
const TL = TILE, MW = MAP_W, MH = MAP_H;
const LANDL = { ...LAND };
const F_RUINS = FLAG_RUINS, F_VALLEY = FLAG_VALLEY, R_CUT = RUINS_CUT;
const K_REEF = Kind.Reef, K_PIER = Kind.Pier;
const VAL = { ...VALLEY };
/** 0..1 how far inside 버려진 골 a point is — per pixel, so the edge isn't tile-stepped. */
const valleyAt = (fx: number, fy: number) => {
  const d = Math.hypot(fx - VAL.cx, fy - VAL.cy);
  if (d > VAL.r + 3) return 0;
  return Math.max(0, Math.min(1, (VAL.r + (fbmF(fx / 4, fy / 4, 13) - 0.5) * 4 - d) / 1.5 + 0.5));
};
const ISL = [...ISLANDS];
const ruinsF = ruinsField, fbmF = fbm, islandF = islandField, depthF = depthAt, deepF = deepField;

// Bakes the whole top-down sea map (design §3-3, §6-2) into palette indices, once.
// Pure (no DOM): the game turns it into pixels per frame (with time-of-day LUTs), and
// scripts/map-preview.ts writes the same buffer to PNG for review.

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

// hoisted: this runs for ~8M pixels, so no per-call array destructuring
const CUT_A = ZONE_CUTS[0], CUT_B = ZONE_CUTS[1], CUT_C = ZONE_CUTS[2];

function rampPos(d: number): number {
  // each sea gets its own span with a visible step at the borders
  const a = CUT_A, b = CUT_B, c = CUT_C;
  if (d < a) return 2 + (d / a) * 1.2; // jade3 → jade2
  if (d < b) return 4 + ((d - a) / (b - a)) * 1.1; // sea2 → sea1
  if (d < c) return 5.4 + ((d - b) / (c - b)) * 1.2; // sea1 → deep2
  return 7 + Math.min(1, (d - c) / 0.3) * 1.2; // deep1 → navy
}

export function bakeSea(): Uint8Array {
  const g = seaGrid();
  const W = WORLD_W, H = WORLD_H;
  const out = new Uint8Array(W * H);

  // fields sampled on the tile-corner lattice, then interpolated per pixel
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

  // The island field is the expensive part: sample it on a 4 px lattice near islands only,
  // then interpolate per pixel (coastlines stay smooth, bake time drops ~16×).
  const S = 4, QW = W / S + 1, QH = H / S + 1;
  const landQ = new Float32Array(QW * QH).fill(9);
  const grassQ = new Float32Array(QW * QH);
  for (const isl of ISL) {
    const rx = isl.r * Math.max(1, isl.squash) * 1.9 + 1, ry = isl.r * 1.9 + 1;
    const qx0 = Math.max(0, Math.floor(((isl.cx - rx) * TL) / S)), qx1 = Math.min(QW - 1, Math.ceil(((isl.cx + rx) * TL) / S));
    const qy0 = Math.max(0, Math.floor(((isl.cy - ry) * TL) / S)), qy1 = Math.min(QH - 1, Math.ceil(((isl.cy + ry) * TL) / S));
    for (let qy = qy0; qy <= qy1; qy++)
      for (let qx = qx0; qx <= qx1; qx++) {
        const i = qy * QW + qx;
        const d = islandF((qx * S) / TL, (qy * S) / TL).d;
        if (d < landQ[i]!) landQ[i] = d;
        if (d < LANDL.sand) grassQ[i] = fbmF((qx * S * 1.5) / TL, (qy * S * 1.5) / TL, 41);
      }
  }
  const lerpQ = (arr: Float32Array, x: number, y: number) => {
    const fx = x / S, fy = y / S;
    const x0 = Math.min(QW - 2, Math.floor(fx)), y0 = Math.min(QH - 2, Math.floor(fy));
    const u = fx - x0, v = fy - y0, i = y0 * QW + x0;
    return arr[i]! * (1 - u) * (1 - v) + arr[i + 1]! * u * (1 - v) + arr[i + QW]! * (1 - u) * v + arr[i + QW + 1]! * u * v;
  };
  const landD = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) landD[y * W + x] = lerpQ(landQ, x + 0.5, y + 0.5);

  for (let y = 0; y < H; y++) {
    const ty = Math.floor(y / TL), fy = (y + 0.5) / TL;
    for (let x = 0; x < W; x++) {
      const tx = Math.floor(x / TL), fx = (x + 0.5) / TL;
      const ti = ty * MW + tx, i = y * W + x;
      const kind = g.kind[ti]!, flags = g.flags[ti]!;
      const ld = landD[i]!;

      // ── land ──
      if (ld < LANDL.sand) {
        if (ld >= LANDL.grass) {
          const wet = ld > 0.95;
          out[i] = wet ? (bayer(x, y) < 0.5 ? PAL.sand1 : PAL.sand2) : hash(x, y, 3) < 0.07 ? PAL.sand1 : PAL.sand2;
        } else {
          const n = lerpQ(grassQ, x + 0.5, y + 0.5);
          out[i] = ld > 0.7 ? PAL.green3 : n > 0.56 ? (bayer(x, y) < (n - 0.56) * 6 ? PAL.green1 : PAL.green2) : PAL.green2;
        }
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

      if (ld < 1.06) c = bayer(x, y) < 0.7 ? PAL.foam2 : PAL.white; // surf line on the beach

      // drowned town: a street grid with roofed blocks, seen through jade water
      if (flags & F_RUINS) {
        const strength = Math.min(1, (ruinsF(fx, fy) - R_CUT) / 0.08); // fade at the town's edge
        const BX = 3 * TL, BY = 2 * TL; // block size
        const bx = Math.floor(x / BX), by = Math.floor(y / BY), lx = x - bx * BX, ly = y - by * BY;
        const street = lx < 4 || ly < 4;
        const hb = hash(bx, by, 9);
        const show = bayer(x, y) < 0.55 * strength;
        if (street) {
          if (show && (lx === 1 || ly === 1)) c = PAL.gray1;
        } else if (hb > 0.18 && show) {
          const roofs = [PAL.red2, PAL.jade1, PAL.wood, PAL.deep1];
          const inset = lx < 6 || ly < 6 || lx > BX - 3 || ly > BY - 3;
          c = inset ? PAL.jade1 : roofs[Math.floor(hb * 4) % 4]!;
        }
      }
      if (vk > 0 && fbmF(fx * 3, fy * 3, 19, 2) > 0.62 && bayer(x, y) < 0.5 * vk) c = PAL.violet1; // oil sheen

      out[i] = c;
    }
  }

  drawTrees(out, landD);
  drawReefs(out, g);
  drawPiers(out, g);
  drawSettlements(out, landD);
  return out;
}

function drawTrees(out: Uint8Array, landD: Float32Array): void {
  const W = WORLD_W, CELL = 7;
  for (const isl of ISL) {
    const rx = isl.r * Math.max(1, isl.squash) + 1, ry = isl.r + 1;
    for (let cy = Math.floor(((isl.cy - ry) * TL) / CELL); cy <= ((isl.cy + ry) * TL) / CELL; cy++)
      for (let cx = Math.floor(((isl.cx - rx) * TL) / CELL); cx <= ((isl.cx + rx) * TL) / CELL; cx++) {
        const x = cx * CELL + Math.floor(hash(cx, cy, 71) * 4), y = cy * CELL + Math.floor(hash(cx, cy, 72) * 4);
        if (x < 3 || y < 3 || x >= W - 3 || y >= WORLD_H - 3 || landD[y * W + x]! > 0.6) continue;
        if (fbmF(x / 40, y / 40, 47) < 0.5 || hash(cx, cy, 73) < 0.25) continue; // groves, not a carpet
        const r = 2 + hash(cx, cy, 74) * 1.2;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const d = Math.hypot(dx, dy);
            if (d > r + 0.5) continue;
            const i = (y + dy) * W + x + dx;
            out[i] = d > r - 0.5 && dx + dy > 0 ? PAL.ink : dx + dy < -1.5 ? PAL.green3 : PAL.green1;
          }
      }
  }
}

function drawReefs(out: Uint8Array, g: ReturnType<typeof seaGrid>): void {
  const W = WORLD_W;
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      if (g.kind[ty * MW + tx] !== K_REEF) continue;
      const rocks = 1 + Math.floor(hash(tx, ty, 21) * 3);
      for (let r = 0; r < rocks; r++) {
        const cx = tx * TL + 3 + hash(tx, ty, 30 + r) * 10, cy = ty * TL + 3 + hash(tx, ty, 40 + r) * 10;
        const rad = 2.5 + hash(tx, ty, 50 + r) * 2.5;
        for (let y = Math.floor(cy - rad - 2); y <= cy + rad + 2; y++)
          for (let x = Math.floor(cx - rad - 2); x <= cx + rad + 2; x++) {
            if (x < 0 || y < 0 || x >= W || y >= WORLD_H) continue;
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            const i = y * W + x;
            if (d <= rad) out[i] = x - cx + (y - cy) < -rad * 0.6 ? PAL.gray2 : x - cx + (y - cy) > rad * 0.7 ? PAL.navy : PAL.gray1;
            else if (d <= rad + 1.3 && out[i] !== PAL.gray1 && out[i] !== PAL.gray2 && out[i] !== PAL.navy) out[i] = bayer(x, y) < 0.6 ? PAL.foam2 : PAL.white;
          }
      }
    }
}

function drawPiers(out: Uint8Array, g: ReturnType<typeof seaGrid>): void {
  const W = WORLD_W;
  const isPier = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < MW && ty < MH && g.kind[ty * MW + tx] === K_PIER;
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      if (!isPier(tx, ty)) continue;
      const horizontal = isPier(tx - 1, ty) || isPier(tx + 1, ty) || !(isPier(tx, ty - 1) || isPier(tx, ty + 1));
      for (let ly = 0; ly < TL; ly++)
        for (let lx = 0; lx < TL; lx++) {
          const along = horizontal ? lx : ly, across = horizontal ? ly : lx;
          if (across < 4 || across > 11) continue;
          const i = (ty * TL + ly) * W + tx * TL + lx;
          out[i] = across === 4 || across === 11 ? PAL.bark1 : along % 4 === 0 ? PAL.bark2 : PAL.wood;
          if ((across === 4 || across === 11) && along % 8 === 2) out[i] = PAL.ink; // posts
        }
    }
}

/** Houses and lighthouses on the grass, deterministic per island. */
function drawSettlements(out: Uint8Array, landD: Float32Array): void {
  const W = WORLD_W;
  const ROOFS = [PAL.red2, PAL.coral, PAL.sea1, PAL.wood];
  ISL.forEach((isl, k) => {
    const spots: [number, number][] = [];
    for (let tries = 0; spots.length < isl.houses && tries < 400; tries++) {
      const a = hash(k, tries, 61) * Math.PI * 2, rr = hash(k, tries, 62) * isl.r * 0.55;
      const x = Math.round((isl.cx + Math.cos(a) * rr * isl.squash) * TL), y = Math.round((isl.cy + Math.sin(a) * rr) * TL);
      if (landD[y * W + x]! > 0.5) continue;
      if (spots.some(([sx, sy]) => Math.abs(sx - x) < 10 && Math.abs(sy - y) < 9)) continue;
      spots.push([x, y]);
    }
    spots.forEach(([x, y], h) => {
      const roof = ROOFS[(k + h) % ROOFS.length]!;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const i = (y + dy) * W + x + dx;
          out[i] = dy === 3 || dx === -4 || dx === 4 || dy === -3 ? PAL.ink : dy === 0 ? (roof === PAL.wood ? PAL.bark2 : PAL.red1) : dy < 0 ? roof : roof === PAL.sea1 ? PAL.deep2 : PAL.red1;
        }
      out[(y + 4) * W + x] = PAL.green1; // shadow
    });
    if (isl.lighthouse) {
      // on the grass edge facing the open sea (east)
      const x = Math.round((isl.cx + isl.r * isl.squash * 0.62) * TL), y = Math.round(isl.cy * TL);
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > 4.3) continue;
          out[(y + dy) * W + x + dx] = d > 3.3 ? PAL.ink : d > 2 ? PAL.white : d > 1 ? PAL.red2 : PAL.yellow;
        }
    }
  });
}

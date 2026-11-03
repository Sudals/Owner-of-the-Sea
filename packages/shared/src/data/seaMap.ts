// Top-down sea map (design §3-3). Fully deterministic: the client draws it and the server can
// recompute any tile (e.g. "was this cast on a deep tile?") from the same functions.
// Layout: the start island on the west edge; the sea deepens eastward in four bands
// (옥빛 → 청빛 → 남빛 → 먹빛), three islands per band, and 버려진 골 at the far east.
// Island names/concepts are TBD (design §3-1) — ids and names below are placeholders.

import { hash32, stream } from "../rng";
import type { SeaColor } from "./points";

export const TILE = 16; // px per tile
export const MAP_W = 224; // tiles → 3584 px
export const MAP_H = 140; // tiles → 2240 px

export const SEA_ORDER: readonly SeaColor[] = ["jade", "azure", "indigo", "ink"];
export const SEA_NAME: Readonly<Record<SeaColor, string>> = { jade: "옥빛 바다", azure: "청빛 바다", indigo: "남빛 바다", ink: "먹빛 바다" };
/** Hull level needed to enter each sea (design §3-2; ink also needs the lantern later). */
export const SEA_HULL_LV: Readonly<Record<SeaColor, number>> = { jade: 1, azure: 2, indigo: 3, ink: 4 };

export type Island = {
  id: string;
  name: string;
  sea: SeaColor;
  /** Center (tiles), radius (tiles), vertical squash (>1 = wider than tall). */
  cx: number;
  cy: number;
  r: number;
  squash: number;
  /** Where the boat ties up: a water tile at the end of the pier. */
  dock: readonly [number, number];
  /** Dock fishing point (points.ts). */
  dockPoint: string;
  /** Houses drawn on the top-down map (0 = uninhabited). */
  houses: number;
  lighthouse?: boolean;
};

type IslandDef = Omit<Island, "dock" | "dockPoint">;

const START_DEF: IslandDef = { id: "start", name: "시작 섬", sea: "jade", cx: 20, cy: 70, r: 9, squash: 1.1, houses: 6, lighthouse: true };

const DEFS: readonly IslandDef[] = [
  START_DEF,
  { id: "jade_i1", name: "옥빛 섬 1", sea: "jade", cx: 50, cy: 30, r: 6, squash: 1.3, houses: 4 },
  { id: "jade_i2", name: "옥빛 섬 2", sea: "jade", cx: 60, cy: 82, r: 5, squash: 0.9, houses: 3 },
  { id: "jade_i3", name: "옥빛 섬 3", sea: "jade", cx: 44, cy: 114, r: 7, squash: 1.2, houses: 5, lighthouse: true },
  { id: "azure_i1", name: "청빛 섬 1", sea: "azure", cx: 94, cy: 20, r: 7, squash: 1.4, houses: 4 },
  { id: "azure_i2", name: "청빛 섬 2", sea: "azure", cx: 102, cy: 72, r: 6, squash: 1.0, houses: 3, lighthouse: true },
  { id: "azure_i3", name: "청빛 섬 3", sea: "azure", cx: 88, cy: 124, r: 5, squash: 1.3, houses: 2 },
  { id: "indigo_i1", name: "남빛 섬 1", sea: "indigo", cx: 142, cy: 34, r: 6, squash: 1.1, houses: 3 },
  { id: "indigo_i2", name: "남빛 섬 2", sea: "indigo", cx: 152, cy: 96, r: 7, squash: 1.5, houses: 4, lighthouse: true },
  { id: "indigo_i3", name: "남빛 섬 3", sea: "indigo", cx: 128, cy: 128, r: 5, squash: 1.0, houses: 2 },
  { id: "ink_i1", name: "먹빛 섬 1", sea: "ink", cx: 192, cy: 22, r: 5, squash: 1.2, houses: 1 },
  { id: "ink_i2", name: "먹빛 섬 2", sea: "ink", cx: 200, cy: 98, r: 6, squash: 1.0, houses: 2, lighthouse: true },
  { id: "ink_i3", name: "먹빛 섬 3", sea: "ink", cx: 182, cy: 130, r: 5, squash: 1.3, houses: 1 },
];

/** 버려진 골 — the old dumping ground at the far east (design §0-5, 3막). */
export const VALLEY = { cx: 214, cy: 58, r: 9 } as const;

/** Dock on the side facing the start island (the start island docks to the east). */
function dockFor(d: IslandDef): [number, number] {
  let dx = START_DEF.cx - d.cx, dy = START_DEF.cy - d.cy;
  if (d.id === START_DEF.id) { dx = 1; dy = 0; }
  const len = Math.hypot(dx, dy) || 1;
  const reach = d.r * Math.max(1, d.squash) + 3.5;
  return [Math.round(d.cx + (dx / len) * reach), Math.round(d.cy + (dy / len) * reach)];
}

export const ISLANDS: readonly Island[] = DEFS.map((d) => ({ ...d, dock: dockFor(d), dockPoint: `${d.id}_dock` }));
export const ISLAND_BY_ID: Readonly<Record<string, Island>> = Object.fromEntries(ISLANDS.map((i) => [i.id, i]));
export const START_ISLAND = ISLANDS[0]!;

export type MapPoint = {
  id: string;
  /** Species pool (points.ts). */
  pointId: string;
  tx: number;
  ty: number;
  look: "boil" | "birds" | "buoy" | "ruins";
};

/** Stop within this many tiles of a point to fish there. */
export const POINT_RADIUS = 3;
/** Within this many tiles of a dock you can tie up. */
export const DOCK_RADIUS = 2.5;

// ── fields (continuous, in tile units) ───────────────────────────────────────

function ihash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = ihash(x0, y0, seed), b = ihash(x0 + 1, y0, seed), c = ihash(x0, y0 + 1, seed), d = ihash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let v = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < octaves; i++) {
    v += vnoise(x * f, y * f, seed + i * 101) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / n;
}

/** Zone depth 0…~1.1: distance from the start island, warped so borders wander. */
export function depthAt(x: number, y: number): number {
  return Math.hypot(x - START_DEF.cx, y - START_DEF.cy) / 215 + (fbm(x / 16, y / 16, 11) - 0.5) * 0.2;
}
export const ZONE_CUTS = [0.28, 0.52, 0.76] as const;
export const zoneOf = (depth: number) => (depth < ZONE_CUTS[0] ? 0 : depth < ZONE_CUTS[1] ? 1 : depth < ZONE_CUTS[2] ? 2 : 3);

/** Nearest island in normalized distance: <0.78 grass, <1 beach, <1.4 shallows. */
export function islandField(x: number, y: number): { d: number; island: number } {
  let best = 99, idx = -1;
  for (let k = 0; k < ISLANDS.length; k++) {
    const isl = ISLANDS[k]!;
    const dx = (x - isl.cx) / isl.squash, dy = y - isl.cy;
    const raw = Math.hypot(dx, dy) / isl.r;
    if (raw > 1.9) continue; // far: skip the noise
    const d = raw + (fbm(x / 6, y / 6, 31 + k) - 0.5) * 0.5;
    if (d < best) { best = d; idx = k; }
  }
  return { d: best, island: idx };
}
export const LAND = { grass: 0.78, sand: 1.0, shallow: 1.4 } as const;

/** Deep-pocket field; a tile is deep where this exceeds DEEP_CUT (and it's past the first sea). */
export const deepField = (x: number, y: number) => fbm(x / 8, y / 8, 77);
export const DEEP_CUT = 0.62;
export const ruinsField = (x: number, y: number) => fbm(x / 9, y / 9, 55);
export const RUINS_CUT = 0.63;
const reefField = (x: number, y: number) => fbm(x / 3.5, y / 3.5, 91);

// ── tile grid ────────────────────────────────────────────────────────────────

export const enum Kind {
  Water = 0,
  Grass = 1,
  Sand = 2,
  Reef = 3,
  Pier = 4,
}
export const FLAG_SHALLOW = 1;
export const FLAG_DEEP = 2;
export const FLAG_RUINS = 4;
export const FLAG_VALLEY = 8;

export type SeaGrid = {
  w: number;
  h: number;
  kind: Uint8Array;
  /** Index into SEA_ORDER. */
  sea: Uint8Array;
  flags: Uint8Array;
  points: MapPoint[];
};

let cached: SeaGrid | null = null;

export function seaGrid(): SeaGrid {
  if (cached) return cached;
  const n = MAP_W * MAP_H;
  const g: SeaGrid = { w: MAP_W, h: MAP_H, kind: new Uint8Array(n), sea: new Uint8Array(n), flags: new Uint8Array(n), points: [] };
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      const i = ty * MAP_W + tx;
      const x = tx + 0.5, y = ty + 0.5;
      const depth = depthAt(x, y);
      g.sea[i] = zoneOf(depth);
      const land = islandField(x, y).d;
      if (land < LAND.grass) g.kind[i] = Kind.Grass;
      else if (land < LAND.sand) g.kind[i] = Kind.Sand;
      else if (land < LAND.shallow) g.flags[i] |= FLAG_SHALLOW;
      if (g.kind[i] !== Kind.Water) continue;

      const shallow = (g.flags[i]! & FLAG_SHALLOW) !== 0;
      if (g.sea[i]! >= 1 && !shallow && deepField(x, y) > DEEP_CUT) g.flags[i] |= FLAG_DEEP;
      if (Math.hypot(x - VALLEY.cx, y - VALLEY.cy) < VALLEY.r + (fbm(x / 4, y / 4, 13) - 0.5) * 4) g.flags[i] |= FLAG_VALLEY | FLAG_DEEP;
      if (g.sea[i] === 0 && !shallow && ruinsField(x, y) > RUINS_CUT) g.flags[i] |= FLAG_RUINS;
      const border = ZONE_CUTS.some((c) => Math.abs(depth - c) < 0.02);
      const reefN = reefField(x, y);
      if ((shallow && reefN > 0.7) || (border && reefN > 0.66) || reefN > 0.8) g.kind[i] = Kind.Reef;
    }

  const clear = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if (g.kind[y * MAP_W + x] === Kind.Reef) g.kind[y * MAP_W + x] = Kind.Water;
      }
  };

  // docks: keep the approach clear and lay a pier back to the shore
  for (const isl of ISLANDS) {
    clear(isl.dock[0], isl.dock[1], 4);
    const vx = isl.cx - isl.dock[0], vy = isl.cy - isl.dock[1], len = Math.hypot(vx, vy);
    for (let s = 1; s < 14; s++) {
      const x = Math.round(isl.dock[0] + (vx / len) * s), y = Math.round(isl.dock[1] + (vy / len) * s);
      const i = y * MAP_W + x;
      if (g.kind[i] === Kind.Grass || g.kind[i] === Kind.Sand) break;
      g.kind[i] = Kind.Pier;
    }
  }

  g.points = placePoints(g);
  for (const p of g.points) clear(p.tx, p.ty, POINT_RADIUS + 1);
  cached = g;
  return g;
}

/** Seeded scatter: 5 points per sea, 2 over the drowned town, 1 in 버려진 골. */
function placePoints(g: SeaGrid): MapPoint[] {
  const r = stream(hash32("sea-points-v1"));
  const out: MapPoint[] = [];
  const looks: MapPoint["look"][] = ["boil", "birds", "buoy", "boil", "birds"];
  const ok = (tx: number, ty: number, spacing: number) => {
    if (tx < 4 || ty < 4 || tx >= MAP_W - 4 || ty >= MAP_H - 4) return false;
    const i = ty * MAP_W + tx;
    if (g.kind[i] !== Kind.Water || g.flags[i]! & FLAG_SHALLOW) return false;
    for (const isl of ISLANDS) if (Math.hypot(tx - isl.cx, ty - isl.cy) < isl.r * Math.max(1, isl.squash) + 7) return false;
    for (const p of out) if (Math.hypot(tx - p.tx, ty - p.ty) < spacing) return false;
    return true;
  };
  const pick = (want: number, test: (i: number) => boolean, make: (tx: number, ty: number, k: number) => MapPoint, spacing = 20) => {
    for (let tries = 0, got = 0; got < want && tries < 20000; tries++) {
      const tx = Math.floor(r() * MAP_W), ty = Math.floor(r() * MAP_H);
      if (!test(ty * MAP_W + tx) || !ok(tx, ty, spacing)) continue;
      out.push(make(tx, ty, got++));
    }
  };
  SEA_ORDER.forEach((sea, z) =>
    pick(5, (i) => g.sea[i] === z && !(g.flags[i]! & FLAG_VALLEY), (tx, ty, k) => ({ id: `p_${sea}_${k + 1}`, pointId: `${sea}_1`, tx, ty, look: looks[k]! })),
  );
  pick(2, (i) => (g.flags[i]! & FLAG_RUINS) !== 0, (tx, ty, k) => ({ id: `p_ruins_${k + 1}`, pointId: "jade_1", tx, ty, look: "ruins" }), 16);
  pick(1, (i) => (g.flags[i]! & FLAG_VALLEY) !== 0, (tx, ty) => ({ id: "p_valley", pointId: "ink_1", tx, ty, look: "boil" }), 8);
  return out;
}

export function mapPoints(): readonly MapPoint[] {
  return seaGrid().points;
}

export type TileInfo = { kind: Kind; sea: SeaColor; shallow: boolean; deep: boolean; ruins: boolean; valley: boolean };

export function tileAt(tx: number, ty: number): TileInfo | null {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
  const g = seaGrid();
  const i = ty * MAP_W + tx;
  const f = g.flags[i]!;
  return {
    kind: g.kind[i] as Kind,
    sea: SEA_ORDER[g.sea[i]!]!,
    shallow: (f & FLAG_SHALLOW) !== 0,
    deep: (f & FLAG_DEEP) !== 0,
    ruins: (f & FLAG_RUINS) !== 0,
    valley: (f & FLAG_VALLEY) !== 0,
  };
}

/** Tile under a world-pixel position. */
export const tileOfPx = (px: number, py: number): [number, number] => [Math.floor(px / TILE), Math.floor(py / TILE)];

/** Solid for the boat: land, beach, reef, pier, or off the map. */
export function isSolid(tx: number, ty: number): boolean {
  const t = tileAt(tx, ty);
  return !t || t.kind !== Kind.Water;
}

export function pointNear(px: number, py: number): MapPoint | null {
  let best: MapPoint | null = null, bestD = POINT_RADIUS * TILE;
  for (const p of mapPoints()) {
    const d = Math.hypot(px - (p.tx + 0.5) * TILE, py - (p.ty + 0.5) * TILE);
    if (d <= bestD) { best = p; bestD = d; }
  }
  return best;
}

export function dockNear(px: number, py: number): Island | null {
  for (const isl of ISLANDS) if (Math.hypot(px - (isl.dock[0] + 0.5) * TILE, py - (isl.dock[1] + 0.5) * TILE) <= DOCK_RADIUS * TILE) return isl;
  return null;
}

export function nearestIsland(px: number, py: number): Island {
  return [...ISLANDS].sort((a, b) => Math.hypot(px - a.dock[0] * TILE, py - a.dock[1] * TILE) - Math.hypot(px - b.dock[0] * TILE, py - b.dock[1] * TILE))[0]!;
}

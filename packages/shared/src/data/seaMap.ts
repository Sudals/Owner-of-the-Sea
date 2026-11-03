// Top-down sea map (design §3-1, §3-3). Fully deterministic: the client draws it and the server
// can recompute any tile (e.g. "was this cast on a deep tile?") from the same functions.
// Layout (design v11): 빨간등대 on the west edge and 검은등대 on the east edge face each other;
// between them the sea deepens in four bands (옥빛 → 청빛 → 남빛 → 먹빛) with three islands each,
// nearest first in unlock order; 버려진 골 lies just beyond 검은등대.

import { hash32, stream } from "../rng";
import type { SeaColor } from "./points";

export const TILE = 16; // px per tile
export const MAP_W = 224; // tiles → 3584 px
export const MAP_H = 140; // tiles → 2240 px

export const SEA_ORDER: readonly SeaColor[] = ["jade", "azure", "indigo", "ink"];
export const SEA_NAME: Readonly<Record<SeaColor, string>> = { jade: "옥빛 바다", azure: "청빛 바다", indigo: "남빛 바다", ink: "먹빛 바다" };
/** Hull level needed to enter each sea (design §3-2; ink also needs the lantern). */
export const SEA_HULL_LV: Readonly<Record<SeaColor, number>> = { jade: 1, azure: 2, indigo: 3, ink: 4 };

/** What the island's natural ground looks like ("none" = a built structure on open water). */
export type Ground = "grass" | "rock" | "darkrock" | "salt" | "black" | "junk" | "port" | "none";
/** Built structures (tile units, relative to the island center; x/y = top-left). Solid for the boat. */
export type Part = { x: number; y: number; w: number; h: number; mat: "raft" | "boat_red" | "boat_blue" | "boat_white" | "tower" | "deck" | "glass" | "hull" | "concrete" };
/** Landmarks drawn on top (render only). */
export type Deco =
  | "lighthouse_red" | "lighthouse_black" | "stalls" | "saltpans" | "windmills" | "school_under"
  | "bridge_houses" | "junk" | "cranes" | "containers" | "whalebone" | "rooftop" | "shrine" | "smoke" | "wreck";

export type Island = {
  id: string;
  name: string;
  sea: SeaColor;
  /** Unlock order inside its sea (design §3-1: nearest first). */
  order: number;
  /** Center (tiles), radius (tiles), horizontal stretch (>1 = wider than tall). */
  cx: number;
  cy: number;
  r: number;
  squash: number;
  ground: Ground;
  parts: readonly Part[];
  deco: readonly Deco[];
  /** Houses drawn on the ground (0 = none). */
  houses: number;
  /** Where the boat ties up: a water tile facing 빨간등대. */
  dock: readonly [number, number];
  /** Dock fishing point (points.ts). */
  dockPoint: string;
};

type IslandDef = Omit<Island, "dock" | "dockPoint" | "parts" | "deco"> & { parts?: readonly Part[]; deco?: readonly Deco[] };

const DEFS: readonly IslandDef[] = [
  // 시작 — a small rock islet with the red lighthouse
  { id: "red_lighthouse", name: "빨간등대", sea: "jade", order: 0, cx: 14, cy: 70, r: 3.4, squash: 1, ground: "rock", houses: 1, deco: ["lighthouse_red"] },
  // 옥빛 — 1막 · 두려움
  {
    id: "water_market", name: "물장터", sea: "jade", order: 1, cx: 36, cy: 58, r: 4.5, squash: 1, ground: "none", houses: 0, deco: ["stalls"],
    parts: [
      { x: -2, y: -1.5, w: 4, h: 3, mat: "raft" },
      { x: -1, y: -3.4, w: 2.2, h: 1.2, mat: "raft" },
      { x: -0.9, y: 2.2, w: 2.2, h: 1.2, mat: "raft" },
      { x: -4.6, y: -2.6, w: 2.4, h: 1.1, mat: "boat_red" },
      { x: 2.3, y: -2.4, w: 2.6, h: 1.1, mat: "boat_blue" },
      { x: 2.4, y: 1.4, w: 2.4, h: 1.1, mat: "boat_white" },
      { x: -4.7, y: 1.5, w: 2.6, h: 1.1, mat: "boat_blue" },
    ],
  },
  { id: "salt_flower", name: "소금꽃섬", sea: "jade", order: 2, cx: 47, cy: 94, r: 6.5, squash: 1.4, ground: "salt", houses: 3, deco: ["saltpans", "windmills"] },
  {
    id: "bell_tower", name: "종탑섬", sea: "jade", order: 3, cx: 62, cy: 62, r: 3, squash: 1, ground: "none", houses: 0, deco: ["school_under"],
    parts: [
      { x: -1, y: -1, w: 2, h: 2, mat: "tower" },
      { x: -3.4, y: -0.5, w: 1.6, h: 1, mat: "raft" },
      { x: 1.8, y: -0.5, w: 1.6, h: 1, mat: "raft" },
      { x: -0.5, y: 1.8, w: 1, h: 1.4, mat: "raft" },
    ],
  },
  // 청빛 — 2막 · 진실의 시작
  {
    id: "bridge", name: "다리섬", sea: "azure", order: 1, cx: 76, cy: 30, r: 3, squash: 1, ground: "none", houses: 0, deco: ["bridge_houses"],
    parts: [
      { x: -12, y: -1.2, w: 9.4, h: 2.4, mat: "deck" },
      { x: -1.2, y: -1.2, w: 13, h: 2.4, mat: "deck" },
    ],
  },
  { id: "junk", name: "고물섬", sea: "azure", order: 2, cx: 90, cy: 112, r: 5.5, squash: 1.1, ground: "junk", houses: 2, deco: ["junk"] },
  {
    id: "rusty_port", name: "녹슨항", sea: "azure", order: 3, cx: 114, cy: 62, r: 6, squash: 1.3, ground: "port", houses: 2, deco: ["containers", "cranes"],
    parts: [
      { x: -12.5, y: -3.2, w: 6, h: 1.4, mat: "concrete" },
      { x: -12.5, y: 1.8, w: 6, h: 1.4, mat: "concrete" },
    ],
  },
  // 남빛 — 2막 · 진실
  { id: "whalebone", name: "고래뼈섬", sea: "indigo", order: 1, cx: 128, cy: 120, r: 6, squash: 1.35, ground: "grass", houses: 3, deco: ["whalebone"] },
  {
    id: "glass_tower", name: "유리탑섬", sea: "indigo", order: 2, cx: 145, cy: 24, r: 3.5, squash: 1, ground: "none", houses: 0, deco: ["rooftop"],
    parts: [{ x: -3.5, y: -3.5, w: 7, h: 7, mat: "glass" }],
  },
  { id: "water_sound", name: "물소리섬", sea: "indigo", order: 3, cx: 166, cy: 84, r: 3.2, squash: 1, ground: "rock", houses: 0, deco: ["shrine"] },
  // 먹빛 — 3막 · 상처
  { id: "black_sand", name: "검은모래섬", sea: "ink", order: 1, cx: 181, cy: 26, r: 5.5, squash: 1.2, ground: "black", houses: 3, deco: ["smoke"] },
  {
    id: "taepyeong_wreck", name: "태평호 무덤", sea: "ink", order: 2, cx: 188, cy: 120, r: 3, squash: 1, ground: "none", houses: 0, deco: ["wreck"],
    parts: [
      { x: -10, y: -2, w: 8.6, h: 4, mat: "hull" },
      { x: 0.4, y: -1.6, w: 8.4, h: 3.6, mat: "hull" },
    ],
  },
  { id: "black_lighthouse", name: "검은등대", sea: "ink", order: 3, cx: 201, cy: 70, r: 3.4, squash: 1, ground: "darkrock", houses: 1, deco: ["lighthouse_black"] },
];

/** 버려진 골 — the old dumping ground just past 검은등대 (design §0-5, 3막). */
export const VALLEY = { cx: 215, cy: 70, r: 8 } as const;

const START_DEF = DEFS[0]!;

/** Outer reach of an island from its center along a unit direction (tiles). */
function reach(d: IslandDef, ux: number, uy: number): number {
  let r = d.ground === "none" ? 0 : d.r * Math.max(1, d.squash) * 1.05;
  for (const p of d.parts ?? []) {
    // farthest corner of the part along the direction
    for (const [x, y] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]] as const) r = Math.max(r, x * ux + y * uy);
  }
  return r;
}

/** Dock on the side facing 빨간등대 (빨간등대 itself docks to the east, toward the sea). */
function dockFor(d: IslandDef): [number, number] {
  let dx = START_DEF.cx - d.cx, dy = START_DEF.cy - d.cy;
  if (d.id === START_DEF.id) { dx = 1; dy = 0; }
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const r = reach(d, ux, uy) + (d.ground === "none" ? 1.5 : 3.5);
  return [Math.round(d.cx + ux * r), Math.round(d.cy + uy * r)];
}

export const ISLANDS: readonly Island[] = DEFS.map((d) => ({ ...d, parts: d.parts ?? [], deco: d.deco ?? [], dock: dockFor(d), dockPoint: `${d.id}_dock` }));
export const ISLAND_BY_ID: Readonly<Record<string, Island>> = Object.fromEntries(ISLANDS.map((i) => [i.id, i]));
export const START_ISLAND = ISLANDS[0]!;

/** Unit vector from the island out through its dock — the way a boat leaving it points. */
export function dockFacing(isl: Island): [number, number] {
  const dx = isl.dock[0] - isl.cx, dy = isl.dock[1] - isl.cy;
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

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

/** Zone depth 0…~1.1: distance from 빨간등대, warped so borders wander. */
export function depthAt(x: number, y: number): number {
  return Math.hypot(x - START_DEF.cx, y - START_DEF.cy) / 215 + (fbm(x / 16, y / 16, 11) - 0.5) * 0.2;
}
export const ZONE_CUTS = [0.28, 0.52, 0.76] as const;
export const zoneOf = (depth: number) => (depth < ZONE_CUTS[0] ? 0 : depth < ZONE_CUTS[1] ? 1 : depth < ZONE_CUTS[2] ? 2 : 3);

/** Nearest natural island in normalized distance: <0.78 ground, <1 beach, <1.4 shallows. */
export function islandField(x: number, y: number): { d: number; island: number } {
  let best = 99, idx = -1;
  for (let k = 0; k < ISLANDS.length; k++) {
    const isl = ISLANDS[k]!;
    if (isl.ground === "none") continue;
    const dx = (x - isl.cx) / isl.squash, dy = y - isl.cy;
    const raw = Math.hypot(dx, dy) / isl.r;
    if (raw > 1.9) continue; // far: skip the noise
    const d = raw + (fbm(x / 6, y / 6, 31 + k) - 0.5) * 0.5;
    if (d < best) { best = d; idx = k; }
  }
  return { d: best, island: idx };
}
export const LAND = { grass: 0.78, sand: 1.0, shallow: 1.4 } as const;

/** The built part at a point (tile units), if any. */
export function partAt(x: number, y: number): { island: number; part: Part } | null {
  for (let k = 0; k < ISLANDS.length; k++) {
    const isl = ISLANDS[k]!;
    for (const p of isl.parts) {
      const lx = x - isl.cx, ly = y - isl.cy;
      if (lx >= p.x && lx < p.x + p.w && ly >= p.y && ly < p.y + p.h) return { island: k, part: p };
    }
  }
  return null;
}

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
  /** Piers and built structures (rafts, decks, towers, the wreck). */
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
  const wreck = ISLANDS.find((i) => i.deco.includes("wreck"));
  const school = ISLANDS.find((i) => i.deco.includes("school_under"));
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
      if (partAt(x, y)) g.kind[i] = Kind.Pier;
      if (g.kind[i] !== Kind.Water) continue;

      const shallow = (g.flags[i]! & FLAG_SHALLOW) !== 0;
      if (g.sea[i]! >= 1 && !shallow && deepField(x, y) > DEEP_CUT) g.flags[i] |= FLAG_DEEP;
      if (Math.hypot(x - VALLEY.cx, y - VALLEY.cy) < VALLEY.r + (fbm(x / 4, y / 4, 13) - 0.5) * 4) g.flags[i] |= FLAG_VALLEY | FLAG_DEEP;
      if (g.sea[i] === 0 && !shallow && ruinsField(x, y) > RUINS_CUT) g.flags[i] |= FLAG_RUINS;
      // the drowned school under 종탑섬
      if (school && Math.abs(x - school.cx) < 6 && Math.abs(y - school.cy) < 4) g.flags[i] |= FLAG_RUINS;
      const border = ZONE_CUTS.some((c) => Math.abs(depth - c) < 0.02);
      const reefN = reefField(x, y);
      if ((shallow && reefN > 0.7) || (border && reefN > 0.66) || reefN > 0.8) g.kind[i] = Kind.Reef;
      // the reef the 태평호 ran aground on
      if (wreck) {
        const d = Math.hypot((x - wreck.cx) / 1.6, y - wreck.cy);
        if (d > 4 && d < 9 && reefN > 0.48) g.kind[i] = Kind.Reef;
      }
    }

  const clear = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if (g.kind[y * MAP_W + x] === Kind.Reef) g.kind[y * MAP_W + x] = Kind.Water;
      }
  };

  // docks: keep the approach clear and lay a pier back to the island
  for (const isl of ISLANDS) {
    clear(isl.dock[0], isl.dock[1], 3);
    const vx = isl.cx - isl.dock[0], vy = isl.cy - isl.dock[1], len = Math.hypot(vx, vy);
    for (let s = 1; s < 16; s++) {
      const x = Math.round(isl.dock[0] + (vx / len) * s), y = Math.round(isl.dock[1] + (vy / len) * s);
      const i = y * MAP_W + x;
      if (g.kind[i] !== Kind.Water && g.kind[i] !== Kind.Reef) break;
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
  const r = stream(hash32("sea-points-v2"));
  const out: MapPoint[] = [];
  const looks: MapPoint["look"][] = ["boil", "birds", "buoy", "boil", "birds"];
  const ok = (tx: number, ty: number, spacing: number) => {
    if (tx < 4 || ty < 4 || tx >= MAP_W - 4 || ty >= MAP_H - 4) return false;
    const i = ty * MAP_W + tx;
    if (g.kind[i] !== Kind.Water || g.flags[i]! & FLAG_SHALLOW) return false;
    for (const isl of ISLANDS) if (Math.hypot(tx - isl.cx, ty - isl.cy) < Math.max(isl.r * Math.max(1, isl.squash), reach(isl, 1, 0), reach(isl, -1, 0)) + 6) return false;
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
  pick(2, (i) => (g.flags[i]! & FLAG_RUINS) !== 0 && g.sea[i] === 0, (tx, ty, k) => ({ id: `p_ruins_${k + 1}`, pointId: "jade_1", tx, ty, look: "ruins" }), 16);
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

/** Solid for the boat: land, beach, reef, pier/structure, or off the map. */
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

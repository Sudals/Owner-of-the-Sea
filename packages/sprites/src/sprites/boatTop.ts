import { C } from "../palette";
import { Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";

// Top-down boat for the sea map (design §3-3, §6-2): hull Lv1–4 × 16 headings, 32×32.
// The boat is defined once as shapes in its own frame (bow → +x) and re-rasterized for every
// heading, so each direction is drawn clean instead of rotating pixels.
// Frame names: `top_lv{L}_{d}` with d = 0 (east), 4 (south), 8 (west), 12 (north) — y points down.

const S = 32;
export const TOP_DIRS = 16;

type Look = {
  len: number;
  beam: number;
  rail: number;
  hullSide: number;
  deck: number;
  plank: number;
  cabin: [number, number]; // along-length span (0 = stern, 1 = bow)
  cabinW: number; // fraction of the beam
  roof: number;
  roofLight: number;
  band?: number;
  lantern?: boolean;
  icebox?: boolean;
};

const LOOKS: Record<1 | 2 | 3 | 4, Look> = {
  1: { len: 19, beam: 8.5, rail: C.sand2, hullSide: C.bark2, deck: C.wood, plank: C.bark2, cabin: [0.16, 0.44], cabinW: 0.62, roof: C.sand1, roofLight: C.sand2 },
  2: { len: 21, beam: 9.5, rail: C.white, hullSide: C.gray2, deck: C.sand2, plank: C.sand1, cabin: [0.14, 0.46], cabinW: 0.64, roof: C.sea1, roofLight: C.sea2, band: C.red2 },
  3: { len: 24, beam: 10.5, rail: C.white, hullSide: C.deep2, deck: C.gray2, plank: C.gray1, cabin: [0.12, 0.5], cabinW: 0.66, roof: C.deep2, roofLight: C.sea1, band: C.red2 },
  4: { len: 27, beam: 11.5, rail: C.white, hullSide: C.deep1, deck: C.wood, plank: C.bark2, cabin: [0.1, 0.5], cabinW: 0.68, roof: C.navy, roofLight: C.deep2, band: C.yellow, lantern: true, icebox: true },
};

/** Half-width of the hull at u (0 = stern, 1 = bow), as a fraction of half the beam. */
function halfWidth(u: number): number {
  if (u < 0 || u > 1) return 0;
  if (u < 0.06) return 0.78 + (u / 0.06) * 0.22; // squared-off stern
  if (u < 0.6) return 1;
  const t = (u - 0.6) / 0.4;
  return Math.sqrt(Math.max(0, 1 - t * t * t)) * (1 - t * 0.15); // rounded, pointed bow
}

/** Palette index at a point in the boat's frame (lx along, ly across, px from center), or 0. */
function sample(L: Look, lx: number, ly: number): number {
  const u = (lx + L.len / 2) / L.len;
  const hw = (halfWidth(u) * L.beam) / 2;
  if (hw <= 0 || Math.abs(ly) > hw) return 0;
  const edge = hw - Math.abs(ly);
  if (edge < 1) return L.rail; // gunwale rim
  if (edge < 1.8) return ly > 0 ? L.hullSide : L.rail; // starboard side reads darker
  // cabin
  const [c0, c1] = L.cabin;
  if (u >= c0 && u <= c1 && Math.abs(ly) <= (L.beam / 2) * L.cabinW - 0.5) {
    if (u < c0 + 0.06 && Math.abs(ly) < 1) return C.gray1; // chimney at the back
    return ly < 0 ? L.roofLight : L.roof;
  }
  if (L.lantern && u > 0.82 && u < 0.9 && Math.abs(ly) < 1) return C.yellow;
  if (L.icebox && u > 0.56 && u < 0.7 && Math.abs(ly) < L.beam * 0.22) return C.white;
  if (L.band && u > 0.06 && u < 0.1) return L.band;
  // deck planks run along the boat
  return Math.floor(ly + 20) % 3 === 0 ? L.plank : L.deck;
}

export function renderTopBoat(level: 1 | 2 | 3 | 4, dir: number): Img {
  const L = LOOKS[level];
  const a = (dir / TOP_DIRS) * Math.PI * 2;
  const ca = Math.cos(a), sa = Math.sin(a);
  const img = new Img(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // 2×2 supersampling: the hull edge is kept where most of the pixel is hull
      let inside = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
        const dx = x + ox - S / 2, dy = y + oy - S / 2;
        if (sample(L, dx * ca + dy * sa, -dx * sa + dy * ca)) inside++;
      }
      if (inside < 2) continue;
      const dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2;
      const c = sample(L, dx * ca + dy * sa, -dx * sa + dy * ca);
      img.set(x, y, c || L.rail);
    }
  return img.outline(C.ink);
}

export function buildBoatTop(): SheetItem[] {
  const out: SheetItem[] = [];
  for (const lv of [1, 2, 3, 4] as const) for (let d = 0; d < TOP_DIRS; d++) out.push({ name: `top_lv${lv}_${d}`, img: renderTopBoat(lv, d) });
  return out;
}

import { C, darker, lighter } from "../palette";
import { disc, ellipse, hline, line, polygon, rect, vline } from "../lib/draw";
import { Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";

// 통통배 — grandfather's old boat (design §0-3, §3-4). 64×32, bow to the right.
// Hull level 1–4 changes the look; the bob/roll is applied at runtime.
// Anchors: `stand` = where the angler's feet go, `line` = rod tip side reference.

const W = 64, H = 32;

type Look = {
  hull: number; hullDark: number; plank: number; rail: number; bottom: number;
  cabin: number; cabinDark: number; roof: number; windows: number;
  band?: number; patch?: boolean; lantern?: boolean; icebox?: boolean; bigCabin?: boolean;
};

const LOOKS: Record<1 | 2 | 3 | 4, Look> = {
  1: { hull: C.wood, hullDark: C.bark2, plank: C.bark2, rail: C.sand1, bottom: C.bark1, cabin: C.sand1, cabinDark: C.wood, roof: C.bark2, windows: 1, patch: true },
  2: { hull: C.white, hullDark: C.gray2, plank: C.gray2, rail: C.white, bottom: C.red2, cabin: C.white, cabinDark: C.gray2, roof: C.sea1, windows: 1, band: C.red2 },
  3: { hull: C.sea1, hullDark: C.deep2, plank: C.deep2, rail: C.gray2, bottom: C.red1, cabin: C.white, cabinDark: C.gray2, roof: C.deep2, windows: 2, band: C.gray2, bigCabin: true },
  4: { hull: C.deep2, hullDark: C.deep1, plank: C.deep1, rail: C.yellow, bottom: C.red1, cabin: C.foam2, cabinDark: C.foam1, roof: C.navy, windows: 2, band: C.yellow, bigCabin: true, lantern: true, icebox: true },
};

// gunwale (top edge of the hull) — stern low on the left, bow raised on the right
const railY = (x: number) => (x < 50 ? 18 - Math.max(0, (8 - x) * 0.25) : 18 - ((x - 50) / 12) ** 1.6 * 6);

export function renderBoat(level: 1 | 2 | 3 | 4): { img: Img; stand: [number, number] } {
  const L = LOOKS[level];
  const img = new Img(W, H);

  // ── cabin (behind the rail) ──
  const cx0 = 7, cx1 = L.bigCabin ? 27 : 23, cTop = L.bigCabin ? 5 : 7;
  rect(img, cx0, cTop, cx1 - cx0 + 1, 18 - cTop, L.cabin);
  vline(img, cx0, cTop, 17, L.cabinDark);
  vline(img, cx1, cTop, 17, L.cabinDark);
  hline(img, cx0, cx1, 17, L.cabinDark);
  // roof with overhang
  rect(img, cx0 - 2, cTop - 2, cx1 - cx0 + 5, 2, L.roof);
  hline(img, cx0 - 2, cx1 + 2, cTop - 2, lighter(L.roof));
  // windows
  const wins = L.windows === 2 ? [cx0 + 3, cx0 + 11] : [cx0 + 6];
  for (const wx of wins) {
    rect(img, wx, cTop + 2, 6, 4, C.foam1);
    hline(img, wx, wx + 5, cTop + 2, C.foam2);
    img.set(wx + 1, cTop + 3, C.white);
    rect(img, wx - 1, cTop + 6, 8, 1, L.cabinDark); // sill
  }
  // door at the back of the cabin
  rect(img, cx0 + 1, cTop + 7, 3, 17 - cTop - 7, L.cabinDark);
  img.set(cx0 + 3, cTop + 10, C.sand2);
  // exhaust chimney (the "통통" engine)
  rect(img, cx0 + 3, cTop - 6, 3, 4, C.gray1);
  hline(img, cx0 + 2, cx0 + 6, cTop - 7, C.ink);
  vline(img, cx0 + 3, cTop - 6, cTop - 3, C.gray2);
  if (L.lantern) {
    vline(img, cx1 + 4, 0, 16, C.gray1);
    rect(img, cx1 + 3, 1, 3, 3, C.yellow);
    img.set(cx1 + 4, 2, C.white);
    hline(img, cx1 + 3, cx1 + 5, 0, C.ink);
  }
  if (L.icebox) {
    rect(img, 29, 13, 7, 5, C.white);
    hline(img, 29, 35, 13, C.sea3);
    hline(img, 29, 35, 14, C.sea2);
    img.set(32, 15, C.gray2);
  }

  // ── hull ──
  const pts: [number, number][] = [];
  for (let x = 3; x <= 62; x++) pts.push([x, railY(x)]);
  pts.push([62, 13.5], [58, 23], [52, 28.5], [44, 30.5], [14, 30.5], [7, 28], [3, 22]);
  polygon(img, pts, (x, y) => {
    const ry = railY(x);
    if (y < ry + 1) return L.rail;
    if (y >= 27) return L.bottom;
    if (L.band && y >= 21 && y <= 22) return L.band;
    if ((Math.round(y - ry) % 3 === 0)) return L.plank;
    return x > 54 ? L.hull : x < 8 ? L.hullDark : L.hull;
  });
  // bow stem highlight + shading toward the keel
  for (let x = 3; x <= 62; x++) {
    const ry = Math.round(railY(x));
    img.paint(x, ry + 1, darker(L.rail) === L.rail ? L.hullDark : L.hullDark);
  }
  line(img, 61, 14, 57, 23, lighter(L.hull));

  // patched planks on the old boat
  if (L.patch) {
    rect(img, 30, 21, 5, 3, C.sand1);
    img.set(30, 21, C.bark1); img.set(34, 21, C.bark1); img.set(30, 23, C.bark1); img.set(34, 23, C.bark1);
    rect(img, 46, 24, 3, 2, C.bark2);
    img.set(18, 25, C.coral); // a rust/paint fleck
  }
  // tire fender hanging on the side
  ellipse(img, 39, 22, 2.6, 2.6, C.navy);
  disc(img, 39, 22, 1, L.hull);
  img.set(38, 20, C.gray1);
  // bow line ring
  img.set(59, 16, C.gray2);

  const out = img.outline(C.ink);
  return { img: out, stand: [44, Math.round(railY(44))] };
}

export function buildBoats(): SheetItem[] {
  return ([1, 2, 3, 4] as const).map((lv) => {
    const { img, stand } = renderBoat(lv);
    return { name: `boat_lv${lv}`, img, anchor: { stand } };
  });
}

void W; void H;

import { C, darker } from "../palette";
import { bayer, disc, dither, ellipse, hline, line, polygon, rect, rng, vline } from "../lib/draw";
import { Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";
import { renderFish, type FishSpec, type Silhouette } from "./fish";

// 오염체 (design §4-5, §6-2): base silhouette + pollution layer, plus the purified
// version revealed in the dex after capture. And 바다의 주인 (shadow + truth cutscene).

const SHARK: Partial<Silhouette> = {
  body: 80, halfH: 11,
  top: [[0, 0.22], [0.08, 0.6], [0.3, 1], [0.7, 0.58], [1, 0.16]],
  bottom: [[0, 0.18], [0.15, 0.65], [0.4, 0.9], [0.7, 0.42], [1, 0.16]],
  tail: { kind: "crescent", len: 18, spread: 15 },
  dorsal: [{ from: 0.3, to: 0.48, h: 13, peak: 0.3 }, { from: 0.78, to: 0.83, h: 3 }],
  anal: [{ from: 0.76, to: 0.82, h: 3 }],
  pectoral: { t: 0.3, len: 15 },
  eye: { t: 0.09, v: 0.34, r: 1 },
  mouth: 7,
};

const WHALE: Partial<Silhouette> = {
  body: 104, halfH: 16,
  top: [[0, 0.5], [0.1, 0.88], [0.3, 1], [0.7, 0.66], [1, 0.14]],
  bottom: [[0, 0.72], [0.12, 1], [0.4, 0.95], [0.75, 0.48], [1, 0.14]],
  tail: { kind: "fork", len: 15, spread: 9 },
  dorsal: [{ from: 0.68, to: 0.75, h: 4, peak: 0.6 }],
  anal: [],
  pectoral: { t: 0.24, len: 15 },
  eye: { t: 0.16, v: 0.62, r: 2 },
  mouth: 22,
};

const OWNER: Partial<Silhouette> = {
  body: 250, halfH: 46,
  top: [[0, 0.5], [0.08, 0.85], [0.28, 1], [0.65, 0.72], [1, 0.2]],
  bottom: [[0, 0.6], [0.12, 0.95], [0.38, 1], [0.7, 0.55], [1, 0.2]],
  tail: { kind: "round", len: 48, spread: 40 },
  dorsal: [{ from: 0.2, to: 0.7, h: 26, peak: 0.25, spiny: true }],
  anal: [{ from: 0.55, to: 0.78, h: 18 }],
  pectoral: { t: 0.26, len: 40 },
  eye: { t: 0.1, v: 0.35, r: 2 },
  gill: 0.2,
  mouth: 18,
};

type Boss = { id: string; name: string; tier: "C" | "B" | "A" | "S"; sick: FishSpec; clean: FishSpec; layer: (img: Img, mouth: [number, number]) => Img };

/** Draw on a transparent layer, outline it, and composite over `base` (grown to fit). */
function overlay(base: Img, pad: { l?: number; t?: number; r?: number; b?: number }, draw: (layer: Img, ox: number, oy: number) => void, outline = true): Img {
  const l = pad.l ?? 0, t = pad.t ?? 0;
  const out = new Img(base.w + l + (pad.r ?? 0), base.h + t + (pad.b ?? 0));
  out.blit(base, l, t);
  const layer = new Img(out.w, out.h);
  draw(layer, l, t);
  out.blit(outline ? layer.outline(C.ink) : layer, 0, 0);
  return out;
}

/** Sickly tint: dark veins dithered over the body (not over the outline). */
function veins(img: Img, seed: number): Img {
  const r = rng(seed);
  const out = img.clone();
  for (let i = 0; i < 6; i++) {
    let x = Math.floor(img.w * (0.3 + r() * 0.5)), y = Math.floor(img.h * (0.3 + r() * 0.3));
    for (let s = 0; s < 14; s++) {
      if (img.get(x, y) && img.get(x, y) !== C.ink) out.set(x, y, C.violet1);
      x -= 1;
      y += Math.round(r() * 2 - 1);
    }
  }
  return out;
}

const BOSSES: Boss[] = [
  {
    id: "plastic_mullet", name: "비닐감긴 숭어", tier: "C",
    sick: { id: "plastic_mullet", name: "", sil: "torpedo", back: "gray1", side: "gray2", belly: "gray2", fin: "gray1", pattern: "mottled", pc: "violet1", ring: "coral", override: { body: 40, halfH: 8, tail: { kind: "fork", len: 9, spread: 8 } } },
    clean: { id: "mullet_purified", name: "", sil: "torpedo", back: "sea1", side: "foam1", belly: "white", fin: "sea2", pattern: "lines", shine: true, override: { body: 40, halfH: 8, tail: { kind: "fork", len: 9, spread: 8 } } },
    layer: (img, [mx]) =>
      overlay(img, { l: 8, t: 6 }, (L, ox, oy) => {
        const cx = ox + mx - 22;
        // a plastic bag wrapped around the body, trailing a loose flap
        polygon(L, [[cx, oy + 2], [cx + 7, oy + 2], [cx + 3, oy + img.h - 2], [cx - 4, oy + img.h - 2]], (x, y) => (bayer(x, y) < 0.7 ? (y % 3 === 0 ? C.foam1 : C.foam2) : 0));
        polygon(L, [[cx - 2, oy + 3], [cx - 14, oy - 4], [cx - 20, oy + 1], [cx - 10, oy + 6]], (x, y) => ((x + y) % 4 === 0 ? C.foam1 : C.foam2));
        line(L, cx - 20, oy + 1, cx - 26, oy - 2, C.foam1);
      }),
  },
  {
    id: "oil_mackerel_king", name: "기름먹은 고등어떼왕", tier: "B",
    sick: { id: "oil_mackerel_king", name: "", sil: "torpedo", back: "navy", side: "gray1", belly: "gray2", fin: "navy", override: { body: 58, halfH: 11, tail: { kind: "fork", len: 13, spread: 11 } } },
    clean: { id: "mackerel_king_purified", name: "", sil: "torpedo", back: "jade1", side: "sea3", belly: "white", fin: "sea1", pattern: "wavy", pc: "navy", shine: true, override: { body: 58, halfH: 11, tail: { kind: "fork", len: 13, spread: 11 } } },
    layer: (img, [mx, my]) => {
      // iridescent oil film over the back; pitch-black eyes; oil dripping off the belly
      const sheen = [C.violet2, C.jade3, C.yellow, C.coral];
      const out = img.clone();
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++) {
          const c = img.get(x, y);
          if (!c || c === C.ink || y > img.h * 0.55) continue;
          if (bayer(x, y) < 0.45) out.set(x, y, sheen[Math.floor((x + y * 2) / 5) % 4]!);
        }
      const ex = mx - Math.round(58 * 0.1), ey = my - 6;
      rect(out, ex - 1, ey - 1, 3, 3, C.ink);
      return overlay(out, { b: 6 }, (L) => {
        for (const fx of [0.35, 0.5, 0.62]) {
          const x = Math.round(mx - 58 * fx);
          vline(L, x, img.h - 3, img.h + 2 + (x % 3), C.ink);
        }
      }, false);
    },
  },
  {
    id: "net_shark", name: "그물을 끄는 상어", tier: "A",
    sick: { id: "net_shark", name: "", sil: "torpedo", back: "gray1", side: "gray2", belly: "gray2", fin: "gray1", pattern: "mottled", pc: "navy", override: SHARK },
    clean: { id: "shark_purified", name: "", sil: "torpedo", back: "sea1", side: "gray2", belly: "white", fin: "sea1", shine: true, override: SHARK },
    layer: (img, [mx, my]) =>
      overlay(veins(img, 7), { l: 34, t: 4, b: 4 }, (L, ox, oy) => {
        // torn net dragged from the tail
        const tx = ox + 6, ty = oy + Math.round(img.h / 2);
        polygon(L, [[tx, ty - 4], [tx - 18, ty - 14], [tx - 34, ty - 6], [tx - 30, ty + 10], [tx - 12, ty + 12], [tx, ty + 4]], (x, y) =>
          (x + y) % 4 === 0 || (x - y + 100) % 4 === 0 ? C.jade2 : 0,
        );
        line(L, tx, ty, tx + 10, ty - 2, C.sand1);
        disc(L, tx - 22, ty - 9, 2, C.coral);
        disc(L, tx - 14, ty + 9, 2, C.coral);
        // gill slits + scars
        for (let i = 0; i < 3; i++) vline(L, ox + mx - 14 - i * 3, oy + my - 9, oy + my - 4, C.navy);
      }),
  },
  {
    id: "drum_whale", name: "드럼통 고래", tier: "S",
    sick: { id: "drum_whale", name: "", sil: "torpedo", back: "navy", side: "gray1", belly: "gray2", fin: "navy", pattern: "bellyLines", override: WHALE },
    clean: { id: "whale_purified", name: "", sil: "torpedo", back: "deep2", side: "sea1", belly: "foam2", fin: "deep2", pattern: "bellyLines", override: WHALE },
    layer: (img, [mx]) =>
      overlay(veins(img, 11), { t: 22, l: 6 }, (L, ox, oy) => {
        // rusted waste drum rammed into the back, leaking black water upward and down the flank
        const dx = ox + mx - 58, dy = oy + 1;
        polygon(L, [[dx, dy + 2], [dx + 12, dy - 2], [dx + 15, dy + 11], [dx + 3, dy + 15]], C.red2);
        line(L, dx + 1, dy + 6, dx + 13, dy + 2, C.red1);
        line(L, dx + 2, dy + 11, dx + 14, dy + 7, C.red1);
        line(L, dx, dy + 2, dx + 12, dy - 2, C.gray2);
        L.set(dx + 9, dy + 5, C.wood); L.set(dx + 5, dy + 9, C.bark2);
        for (let y = dy - 2; y > dy - 22; y--) {
          const cx = dx + 6 - (dy - y) * 0.5 + Math.sin(y * 0.4) * 2, w = 1 + (dy - y) * 0.18;
          for (let x = Math.round(cx - w); x <= cx + w; x++) if (bayer(x, y) < 0.6) L.set(x, y, C.ink);
        }
        for (const k of [2, 6, 10]) vline(L, dx + k, dy + 15, dy + 15 + 6 + k, C.ink);
        // barnacles near the head
        for (const [bx, by] of [[mx - 10, 6], [mx - 14, 4], [mx - 18, 7]] as const) L.set(ox + bx, oy + by, C.gray2);
      }, false),
  },
];

function ownerShadow(): Img {
  const spec: FishSpec = { id: "owner", name: "", sil: "deep", back: "ink", side: "navy", belly: "navy", fin: "ink", override: OWNER };
  const { img, mouth } = renderFish(spec);
  // silhouette: everything collapses to ink/navy except a single pale eye
  const out = img.map((c) => (c ? (c === C.navy ? C.navy : C.ink) : 0));
  const ex = mouth[0] - Math.round(250 * 0.1), ey = Math.round(img.h * 0.38);
  disc(out, ex, ey, 3, C.foam2);
  disc(out, ex, ey, 1.2, C.yellow);
  return out;
}

function ownerTruth(): Img {
  // the cutscene reveal: the same giant, wrapped in nets with drums seeping black water
  const spec: FishSpec = { id: "owner_truth", name: "", sil: "deep", back: "deep1", side: "deep2", belly: "gray1", fin: "navy", pattern: "mottled", pc: "violet1", override: OWNER };
  const { img, mouth } = renderFish(spec);
  const r = rng(99);
  return overlay(img, { b: 24 }, (L) => {
    for (let i = 0; i < 7; i++) {
      const x0 = mouth[0] - 40 - r() * 200, x1 = x0 - 30 - r() * 40;
      line(L, x0, 6 + r() * 20, x1, img.h - 10 - r() * 20, C.jade1);
      line(L, x0 + 3, 6 + r() * 20, x1 - 6, img.h - 10 - r() * 20, C.jade2);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.round(mouth[0] - 70 - i * 45), y = img.h - 18 + Math.round(r() * 10);
      rect(L, x, y, 9, 12, C.red1);
      hline(L, x, x + 8, y + 4, C.ink);
      for (let k = 0; k < 18; k++) if (bayer(x, y + 12 + k) < 0.5) L.set(x + 4 + Math.round(Math.sin(k * 0.5) * 2), y + 12 + k, C.ink);
    }
    const ex = mouth[0] - 25, ey = Math.round(img.h * 0.38);
    disc(L, ex, ey, 3, C.foam2);
    L.set(ex, ey, C.ink);
  }, false);
}

export const BOSS_META = Object.fromEntries(BOSSES.map((b) => [b.id, { name: b.name, tier: b.tier }]));

export function buildPollutants(): SheetItem[] {
  const items: SheetItem[] = [];
  for (const b of BOSSES) {
    const sick = renderFish(b.sick);
    items.push({ name: b.id, img: b.layer(sick.img, sick.mouth) });
    const clean = renderFish(b.clean);
    items.push({ name: `${b.id}_purified`, img: clean.img, anchor: { mouth: clean.mouth } });
  }
  return items;
}

export function buildOwner(): SheetItem[] {
  return [
    { name: "owner_shadow", img: ownerShadow() },
    { name: "owner_truth", img: ownerTruth() },
  ];
}

// ── sky bodies (separate so the game can move them with the time of day) ──
export function buildSky(): SheetItem[] {
  const sun = new Img(32, 32);
  disc(sun, 15.5, 15.5, 15, C.sand2);
  disc(sun, 15.5, 15.5, 12, C.yellow);
  disc(sun, 12.5, 12.5, 6, C.white);
  const moon = new Img(24, 24);
  ellipse(moon, 11.5, 11.5, 11, 11, (x, y, nx, ny) => (Math.hypot(nx - 0.45, ny + 0.2) < 0.85 ? 0 : nx < -0.5 ? C.foam2 : C.white));
  moon.set(6, 9, C.gray2); moon.set(5, 14, C.gray2);
  return [
    { name: "sun", img: sun },
    { name: "moon", img: moon.outline(C.navy) },
  ];
}

// ── app icon: the grandfather's blackened scale with a hook, on deep water ──
export function appIcon(size: 16 | 32 | 48 | 64): Img {
  const s = 32;
  const img = new Img(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const corner = Math.hypot(Math.max(0, Math.abs(x - 15.5) - 11), Math.max(0, Math.abs(y - 15.5) - 11)) > 4.5;
    if (!corner) img.set(x, y, dither(x, y, y / s, C.sea1, C.deep1));
  }
  polygon(img, [[16, 4], [26, 10], [24, 21], [16, 28], [8, 21], [6, 10]], (x, y) => dither(x, y, (y - 6) / 22, C.gray1, C.ink));
  line(img, 10, 12, 15, 22, C.sea3);
  line(img, 11, 11, 16, 21, C.foam1);
  // hook
  vline(img, 22, 2, 9, C.gray2);
  line(img, 22, 9, 20, 11, C.gray2);
  img.set(19, 10, C.gray2);
  const out = img.outline(C.ink);
  if (size === 32) return out;
  // nearest-neighbour resample for other sizes
  const r = new Img(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) r.set(x, y, out.get(Math.floor((x * s) / size), Math.floor((y * s) / size)));
  return r;
}

void darker; void dither;

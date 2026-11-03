import { C, darker, lighter, type ColorName } from "../palette";
import { disc, dither, ellipse, line, polygon, rng, curve } from "../lib/draw";
import { Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";

// Fish are generated from 8 parametric silhouettes (design §6-2: "실루엣 6~8종 ×
// 팔레트 스왑 → 40종 이상"). Facing right; the game flips them when needed.

type Fin = { from: number; to: number; h: number; peak?: number; spiny?: boolean };
type TailKind = "fork" | "crescent" | "round" | "square" | "none";

export type Silhouette = {
  body: number; // nose → tail base, px
  halfH: number; // max half body height, px
  top: [number, number][]; // upper profile, t: 0 nose → 1 tail base, value × halfH
  bottom: [number, number][];
  tail: { kind: TailKind; len: number; spread: number };
  dorsal?: Fin[];
  anal?: Fin[];
  pectoral?: { t: number; len: number };
  eye: { t: number; v: number; r: 1 | 2 };
  gill?: number;
  mouth?: number; // mouth line length px
  snout?: number; // beak length px
  wave?: number; // sinuous body amplitude px (eels)
};

export const SILHOUETTES = {
  small: {
    body: 12, halfH: 2.6,
    top: [[0, 0.35], [0.15, 0.8], [0.4, 1], [0.75, 0.6], [1, 0.32]],
    bottom: [[0, 0.3], [0.2, 0.8], [0.45, 1], [0.8, 0.55], [1, 0.32]],
    tail: { kind: "fork", len: 4, spread: 2.6 },
    dorsal: [{ from: 0.38, to: 0.6, h: 1.6 }],
    eye: { t: 0.1, v: 0.32, r: 1 },
  },
  deep: {
    body: 19, halfH: 6.5,
    top: [[0, 0.3], [0.12, 0.72], [0.35, 1], [0.7, 0.72], [1, 0.25]],
    bottom: [[0, 0.35], [0.2, 0.8], [0.45, 1], [0.75, 0.6], [1, 0.25]],
    tail: { kind: "fork", len: 6, spread: 5 },
    dorsal: [{ from: 0.22, to: 0.82, h: 3, peak: 0.25, spiny: true }],
    anal: [{ from: 0.6, to: 0.84, h: 2.2 }],
    pectoral: { t: 0.3, len: 4 },
    eye: { t: 0.14, v: 0.3, r: 2 },
    gill: 0.24,
  },
  long: {
    body: 27, halfH: 2.9,
    top: [[0, 0.25], [0.1, 0.7], [0.3, 1], [0.85, 0.72], [1, 0.38]],
    bottom: [[0, 0.25], [0.12, 0.7], [0.35, 1], [0.85, 0.72], [1, 0.38]],
    tail: { kind: "fork", len: 4, spread: 3 },
    dorsal: [{ from: 0.76, to: 0.9, h: 1.6 }],
    anal: [{ from: 0.76, to: 0.9, h: 1.4 }],
    eye: { t: 0.07, v: 0.3, r: 1 },
    snout: 3,
  },
  torpedo: {
    body: 38, halfH: 8,
    top: [[0, 0.3], [0.12, 0.74], [0.4, 1], [0.8, 0.5], [1, 0.14]],
    bottom: [[0, 0.35], [0.15, 0.74], [0.45, 1], [0.8, 0.45], [1, 0.14]],
    tail: { kind: "crescent", len: 9, spread: 9 },
    dorsal: [
      { from: 0.28, to: 0.45, h: 3.5, peak: 0.2, spiny: true },
      { from: 0.55, to: 0.66, h: 3.2, peak: 0.15 },
    ],
    anal: [{ from: 0.58, to: 0.68, h: 2.6, peak: 0.15 }],
    pectoral: { t: 0.27, len: 6 },
    eye: { t: 0.1, v: 0.33, r: 2 },
    gill: 0.2,
  },
  eel: {
    body: 46, halfH: 3.4,
    top: [[0, 0.55], [0.08, 0.92], [0.2, 1], [0.7, 0.85], [1, 0.15]],
    bottom: [[0, 0.5], [0.1, 0.92], [0.3, 1], [0.75, 0.8], [1, 0.15]],
    tail: { kind: "none", len: 0, spread: 0 },
    dorsal: [{ from: 0.24, to: 1.04, h: 1.3, peak: 0.5 }],
    anal: [{ from: 0.45, to: 1.04, h: 1.2, peak: 0.5 }],
    pectoral: { t: 0.13, len: 3 },
    eye: { t: 0.06, v: 0.3, r: 1 },
    mouth: 2,
    wave: 1.8,
  },
  round: {
    body: 16, halfH: 6.5,
    top: [[0, 0.45], [0.1, 0.85], [0.35, 1], [0.7, 0.82], [0.9, 0.45], [1, 0.26]],
    bottom: [[0, 0.4], [0.15, 0.9], [0.45, 1], [0.8, 0.7], [1, 0.26]],
    tail: { kind: "round", len: 4, spread: 3.5 },
    dorsal: [{ from: 0.76, to: 0.88, h: 2.6, peak: 0.3 }],
    anal: [{ from: 0.76, to: 0.88, h: 2.6, peak: 0.3 }],
    pectoral: { t: 0.3, len: 3 },
    eye: { t: 0.18, v: 0.3, r: 2 },
  },
  bottom: {
    body: 28, halfH: 6,
    top: [[0, 0.5], [0.1, 0.9], [0.3, 1], [0.7, 0.65], [1, 0.36]],
    bottom: [[0, 0.6], [0.15, 0.85], [0.35, 0.9], [0.7, 0.6], [1, 0.36]],
    tail: { kind: "round", len: 6, spread: 5 },
    dorsal: [{ from: 0.2, to: 0.76, h: 3.4, peak: 0.2, spiny: true }],
    anal: [{ from: 0.62, to: 0.8, h: 2.4 }],
    pectoral: { t: 0.27, len: 5 },
    eye: { t: 0.13, v: 0.22, r: 2 },
    gill: 0.24,
    mouth: 3,
  },
  angler: {
    body: 25, halfH: 8,
    top: [[0, 0.62], [0.1, 0.95], [0.3, 1], [0.6, 0.6], [1, 0.26]],
    bottom: [[0, 0.88], [0.15, 1], [0.4, 0.85], [0.7, 0.45], [1, 0.26]],
    tail: { kind: "round", len: 5, spread: 4 },
    dorsal: [{ from: 0.55, to: 0.76, h: 2.6 }],
    pectoral: { t: 0.36, len: 4 },
    eye: { t: 0.22, v: 0.14, r: 1 },
    mouth: 6,
  },
} satisfies Record<string, Silhouette>;

export type SilhouetteId = keyof typeof SILHOUETTES;

type Pattern = "none" | "stripes" | "spots" | "dots" | "wavy" | "band" | "lateral" | "lines" | "bellyLines" | "mottled" | "patches";

export type FishSpec = {
  id: string;
  name: string;
  sil: SilhouetteId;
  back: ColorName;
  side: ColorName;
  belly: ColorName;
  fin: ColorName;
  pattern?: Pattern;
  pc?: ColorName; // pattern color
  period?: number;
  shine?: boolean;
  ring?: ColorName; // eye ring
  extras?: ("lure" | "teeth" | "barbels" | "spikes" | "finlets" | "glow")[];
  override?: Partial<Silhouette>;
};

// 40 species. Rarity / sizes / spawn tables live in packages/shared later; this is visuals only.
export const FISH: FishSpec[] = [
  // small
  { id: "anchovy", name: "멸치", sil: "small", back: "sea1", side: "gray2", belly: "white", fin: "foam1", pattern: "lateral", shine: true },
  { id: "sardine", name: "정어리", sil: "small", back: "deep2", side: "foam1", belly: "white", fin: "gray2", pattern: "dots", pc: "navy", shine: true },
  { id: "gizzard_shad", name: "전어", sil: "small", back: "sea1", side: "sand2", belly: "white", fin: "sand1", pattern: "spots", pc: "deep1", shine: true },
  { id: "herring", name: "청어", sil: "small", back: "deep1", side: "sea3", belly: "foam2", fin: "sea2", shine: true },
  { id: "goby", name: "망둥어", sil: "small", back: "bark2", side: "sand1", belly: "sand2", fin: "wood", pattern: "mottled", pc: "bark1" },
  // deep-bodied
  { id: "red_seabream", name: "참돔", sil: "deep", back: "coral", side: "peach", belly: "white", fin: "coral", pattern: "spots", pc: "sea3", shine: true },
  { id: "black_seabream", name: "감성돔", sil: "deep", back: "gray1", side: "gray2", belly: "white", fin: "navy", pattern: "lines", shine: true },
  { id: "striped_beakfish", name: "돌돔", sil: "deep", back: "gray1", side: "white", belly: "white", fin: "gray1", pattern: "stripes", pc: "ink", period: 3 },
  { id: "filefish", name: "쥐치", sil: "deep", back: "sand1", side: "sand2", belly: "sand2", fin: "wood", pattern: "spots", pc: "bark2" },
  { id: "opaleye", name: "벵에돔", sil: "deep", back: "navy", side: "deep2", belly: "gray2", fin: "navy", ring: "sea3" },
  { id: "koi", name: "비단잉어", sil: "deep", back: "white", side: "white", belly: "white", fin: "foam2", pattern: "patches", pc: "coral", override: { dorsal: [{ from: 0.25, to: 0.78, h: 2.4, peak: 0.2 }] } },
  { id: "golden_seabream", name: "황금 참돔", sil: "deep", back: "yellow", side: "sand2", belly: "white", fin: "sand1", shine: true, ring: "coral" },
  // long
  { id: "saury", name: "꽁치", sil: "long", back: "deep2", side: "sea3", belly: "white", fin: "sea1", pattern: "lateral", shine: true },
  { id: "halfbeak", name: "학공치", sil: "long", back: "jade2", side: "foam1", belly: "white", fin: "jade1", pattern: "lateral", override: { snout: 5 } },
  { id: "needlefish", name: "동갈치", sil: "long", back: "sea1", side: "foam1", belly: "white", fin: "sea2", shine: true, override: { snout: 6, body: 30 } },
  // torpedo
  { id: "mackerel", name: "고등어", sil: "torpedo", back: "jade1", side: "sea3", belly: "white", fin: "sea1", pattern: "wavy", pc: "navy", shine: true, override: { body: 30, halfH: 6, tail: { kind: "fork", len: 7, spread: 6 } } },
  { id: "horse_mackerel", name: "전갱이", sil: "torpedo", back: "sea1", side: "gray2", belly: "white", fin: "sand1", pattern: "band", pc: "sand2", shine: true, override: { body: 28, halfH: 6, tail: { kind: "fork", len: 7, spread: 6 } } },
  { id: "mullet", name: "숭어", sil: "torpedo", back: "gray1", side: "gray2", belly: "white", fin: "gray1", pattern: "lines", override: { body: 32, halfH: 6, tail: { kind: "fork", len: 7, spread: 6 } } },
  { id: "sea_bass", name: "농어", sil: "torpedo", back: "green1", side: "gray2", belly: "white", fin: "gray1", pattern: "spots", pc: "navy", shine: true, override: { body: 34, halfH: 7, tail: { kind: "square", len: 7, spread: 6 } } },
  { id: "salmon", name: "연어", sil: "torpedo", back: "sea1", side: "peach", belly: "white", fin: "coral", pattern: "spots", pc: "navy", override: { body: 34, halfH: 7, tail: { kind: "square", len: 7, spread: 6 } } },
  { id: "spanish_mackerel", name: "삼치", sil: "torpedo", back: "sea1", side: "gray2", belly: "white", fin: "gray1", pattern: "spots", pc: "deep2", shine: true, override: { body: 40, halfH: 6.5 } },
  { id: "yellowtail", name: "방어", sil: "torpedo", back: "deep2", side: "foam1", belly: "white", fin: "yellow", pattern: "band", pc: "yellow", shine: true },
  { id: "skipjack", name: "가다랑어", sil: "torpedo", back: "deep1", side: "gray2", belly: "white", fin: "navy", pattern: "bellyLines", extras: ["finlets"] },
  { id: "bluefin_tuna", name: "참다랑어", sil: "torpedo", back: "navy", side: "gray2", belly: "white", fin: "navy", shine: true, extras: ["finlets"], override: { body: 44, halfH: 9.5 } },
  // eels / ribbons
  { id: "conger", name: "붕장어", sil: "eel", back: "bark2", side: "wood", belly: "sand2", fin: "bark1", pattern: "dots", pc: "sand2" },
  { id: "moray", name: "곰치", sil: "eel", back: "sand1", side: "sand1", belly: "sand2", fin: "wood", pattern: "mottled", pc: "bark2", extras: ["teeth"], override: { halfH: 4.2 } },
  { id: "pike_conger", name: "갯장어", sil: "eel", back: "gray1", side: "gray2", belly: "white", fin: "gray1", extras: ["teeth"] },
  { id: "cutlassfish", name: "갈치", sil: "eel", back: "gray2", side: "white", belly: "white", fin: "foam1", shine: true, override: { top: [[0, 0.35], [0.1, 0.9], [0.25, 1], [0.75, 0.75], [1, 0.08]], bottom: [[0, 0.5], [0.1, 0.9], [0.3, 1], [0.75, 0.7], [1, 0.08]], anal: [] } },
  { id: "ghost_cutlass", name: "유령 갈치", sil: "eel", back: "foam1", side: "foam2", belly: "white", fin: "sea3", shine: true, extras: ["glow"], override: { top: [[0, 0.35], [0.1, 0.9], [0.25, 1], [0.75, 0.75], [1, 0.08]], bottom: [[0, 0.5], [0.1, 0.9], [0.3, 1], [0.75, 0.7], [1, 0.08]], anal: [] } },
  // round
  { id: "pufferfish", name: "복어", sil: "round", back: "green2", side: "sand2", belly: "white", fin: "sand1", pattern: "spots", pc: "green1" },
  { id: "grass_puffer", name: "졸복", sil: "round", back: "bark2", side: "sand1", belly: "white", fin: "wood", pattern: "spots", pc: "bark1", override: { body: 13, halfH: 5 } },
  { id: "porcupinefish", name: "가시복", sil: "round", back: "sand1", side: "sand2", belly: "white", fin: "sand1", pattern: "spots", pc: "bark2", extras: ["spikes"] },
  { id: "sunfish", name: "개복치", sil: "round", back: "gray1", side: "gray2", belly: "white", fin: "gray1", override: { body: 26, halfH: 9, tail: { kind: "square", len: 3, spread: 6 }, dorsal: [{ from: 0.62, to: 0.82, h: 9, peak: 0.6 }], anal: [{ from: 0.62, to: 0.82, h: 9, peak: 0.6 }], eye: { t: 0.14, v: 0.32, r: 2 } } },
  // bottom dwellers
  { id: "rockfish", name: "우럭", sil: "bottom", back: "gray1", side: "gray2", belly: "sand2", fin: "gray1", pattern: "mottled", pc: "navy" },
  { id: "scorpionfish", name: "쏨뱅이", sil: "bottom", back: "red2", side: "coral", belly: "peach", fin: "coral", pattern: "mottled", pc: "red1" },
  { id: "greenling", name: "쥐노래미", sil: "bottom", back: "green1", side: "green2", belly: "sand2", fin: "green2", pattern: "mottled", pc: "bark1" },
  { id: "dark_rockfish", name: "볼락", sil: "bottom", back: "navy", side: "gray1", belly: "gray2", fin: "gray1", pattern: "stripes", pc: "navy", period: 4, ring: "sand2" },
  { id: "catfish", name: "메기", sil: "bottom", back: "bark1", side: "bark2", belly: "sand1", fin: "bark2", pattern: "mottled", pc: "ink", extras: ["barbels"], override: { dorsal: [{ from: 0.32, to: 0.44, h: 2.4 }], anal: [{ from: 0.5, to: 0.92, h: 1.6 }], tail: { kind: "round", len: 5, spread: 4 }, eye: { t: 0.09, v: 0.3, r: 1 } } },
  // anglers (special)
  { id: "anglerfish", name: "아귀", sil: "angler", back: "bark2", side: "wood", belly: "sand1", fin: "bark2", pattern: "mottled", pc: "bark1", extras: ["lure", "teeth"] },
  { id: "lantern_angler", name: "초롱아귀", sil: "angler", back: "violet1", side: "violet2", belly: "gray1", fin: "violet1", extras: ["lure", "teeth", "glow"], override: { body: 20, halfH: 6.5 } },
];

/** Working canvas sized to the silhouette (big enough for the boss / cutscene creatures). */
function canvasFor(sil: Silhouette) {
  const finH = Math.max(0, ...(sil.dorsal ?? []).map((f) => f.h), ...(sil.anal ?? []).map((f) => f.h));
  const W = Math.ceil(sil.body + sil.tail.len + (sil.snout ?? 0) + 40);
  const H = Math.ceil(sil.halfH * 2 + 2 * Math.max(sil.tail.spread, finH) + 40);
  return { W, H, NOSE_X: W - 16 - (sil.snout ?? 0), CY: Math.round(H / 2) };
}

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function renderFish(sp: FishSpec): { img: Img; mouth: [number, number] } {
  const sil: Silhouette = { ...SILHOUETTES[sp.sil], ...sp.override };
  const { W, H, NOSE_X, CY } = canvasFor(sil);
  const img = new Img(W, H);
  const top = curve(sil.top), bot = curve(sil.bottom);
  const body = sil.body;
  const tbX = NOSE_X - body;
  const back = C[sp.back], side = C[sp.side], belly = C[sp.belly];
  const fin = C[sp.fin], finDark = darker(fin);
  const seed = seedOf(sp.id);
  // Centerline; eels get an S-curve that grows toward the tail.
  const cyAt = (x: number) => {
    if (!sil.wave) return CY;
    const t = (NOSE_X - x) / body;
    return CY + Math.sin(t * Math.PI * 2.2) * sil.wave * Math.min(1, t * 2);
  };
  const edge = (x: number) => {
    const t = Math.min(1, Math.max(0, (NOSE_X - x) / body));
    const cy = cyAt(x);
    return { t, up: cy - top(t) * sil.halfH, lo: cy + bot(t) * sil.halfH };
  };

  // ── tail ──
  const stemUp = top(1) * sil.halfH, stemLo = bot(1) * sil.halfH;
  const { kind, len, spread } = sil.tail;
  // Tail: fin color, dithering darker only toward the outer edge.
  const tailFill = (x: number, y: number) => {
    const out = (tbX - x) / Math.max(1, len);
    return out > 0.55 && dither(x, y, (out - 0.55) * 2.2, 0, 1) ? finDark : fin;
  };
  if (kind === "fork")
    polygon(img, [[tbX + 1, CY - stemUp], [tbX - len, CY - spread], [tbX - len * 0.45, CY], [tbX - len, CY + spread], [tbX + 1, CY + stemLo]], tailFill);
  else if (kind === "crescent")
    polygon(img, [
      [tbX + 1, CY - stemUp], [tbX - len * 0.5, CY - spread * 0.55], [tbX - len, CY - spread], [tbX - len * 0.55, CY - spread * 0.25],
      [tbX - len * 0.3, CY], [tbX - len * 0.55, CY + spread * 0.25], [tbX - len, CY + spread], [tbX - len * 0.5, CY + spread * 0.55], [tbX + 1, CY + stemLo],
    ], tailFill);
  else if (kind === "square")
    polygon(img, [[tbX + 1, CY - stemUp], [tbX - len, CY - spread], [tbX - len + 1, CY], [tbX - len, CY + spread], [tbX + 1, CY + stemLo]], tailFill);
  else if (kind === "round") {
    // Fan: narrow at the stem, rounded at the end.
    const arc: [number, number][] = [];
    for (let i = -6; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      arc.push([tbX - len * (0.7 + 0.3 * Math.cos(a)), CY + spread * Math.sin(a)]);
    }
    polygon(img, [[tbX + 1, CY - stemUp], ...arc, [tbX + 1, CY + stemLo]], tailFill);
  }

  // ── dorsal / anal fins (drawn under the body) ──
  const drawFin = (f: Fin, s: -1 | 1) => {
    const x0 = NOSE_X - f.from * body, x1 = NOSE_X - Math.min(f.to, 1.02) * body;
    const ey = (x: number) => (s < 0 ? edge(x).up : edge(x).lo);
    const px = x0 - (x0 - x1) * (f.peak ?? 0.3);
    polygon(
      img,
      [[x0, ey(x0) - s * 1.5], [px, ey(px) + s * f.h], [x1 + 0.5, ey(x1) + s * f.h * 0.4], [x1, ey(x1) - s * 1.5]],
      (x, y) => (f.spiny && x % 2 === 0 ? finDark : fin),
    );
  };
  for (const f of sil.dorsal ?? []) drawFin(f, -1);
  for (const f of sil.anal ?? []) drawFin(f, 1);

  // ── body: countershading back → side → belly, dithered bands, rim shading ──
  for (let x = tbX; x <= NOSE_X; x++) {
    const { up, lo } = edge(x);
    const y0 = Math.ceil(up - 0.5), y1 = Math.max(y0, Math.floor(lo - 0.5));
    for (let y = y0; y <= y1; y++) {
      const v = y1 === y0 ? 0.5 : (y - y0) / (y1 - y0);
      let c: number;
      if (v < 0.28) c = back;
      else if (v < 0.48) c = dither(x, y, (v - 0.28) / 0.2, back, side);
      else if (v < 0.62) c = side;
      else if (v < 0.8) c = dither(x, y, (v - 0.62) / 0.18, side, belly);
      else c = belly;
      if (y === y0 && y1 - y0 >= 3) c = darker(back);
      if (y === y1 && y1 - y0 >= 4) c = darker(belly);
      img.set(x, y, c);
    }
  }

  // ── pattern ──
  const pc = sp.pc ? C[sp.pc] : darker(side);
  const r = rng(seed);
  const colInfo = (x: number) => {
    const { t, up, lo } = edge(x);
    const y0 = Math.ceil(up - 0.5), y1 = Math.max(y0, Math.floor(lo - 0.5));
    return { t, y0, y1 };
  };
  const vAt = (x: number, y: number) => {
    const { y0, y1 } = colInfo(x);
    return y1 === y0 ? 0.5 : (y - y0) / (y1 - y0);
  };
  const onBody = (x: number, y: number) => x >= tbX && x <= NOSE_X && (() => { const { y0, y1 } = colInfo(x); return y >= y0 && y <= y1; })();

  for (let x = tbX + 1; x < NOSE_X; x++) {
    const { t, y0, y1 } = colInfo(x);
    for (let y = y0 + 1; y < y1; y++) {
      const v = vAt(x, y);
      switch (sp.pattern) {
        case "stripes": {
          const p = sp.period ?? 4;
          if (t > 0.12 && t < 0.95 && Math.floor((NOSE_X - x - body * 0.12) / p) % 2 === 1 && v < 0.88) img.set(x, y, pc);
          break;
        }
        case "wavy":
          if (v < 0.44 && t > 0.15 && t < 0.92 && (x + Math.round(Math.sin(y * 1.3) * 1.5)) % 3 === 0) img.set(x, y, pc);
          break;
        case "band":
          if (v > 0.44 && v < 0.56 && t > 0.08 && t < 0.97) img.set(x, y, pc);
          break;
        case "lateral":
          if (Math.abs(v - 0.45) < 0.5 / Math.max(1, y1 - y0) && t > 0.15) img.set(x, y, darker(side));
          break;
        case "lines":
          for (const lv of [0.36, 0.52, 0.68]) if (Math.abs(v - lv) < 0.5 / Math.max(1, y1 - y0) && t > 0.2 && x % 3 !== 0) img.set(x, y, darker(side));
          break;
        case "bellyLines":
          if (v > 0.55 && v < 0.92 && y % 2 === 0 && t > 0.2 && t < 0.85) img.set(x, y, darker(belly));
          break;
        case "mottled":
          if (v < 0.78 && hash(x >> 1, y >> 1, seed) > 0.62) img.set(x, y, pc);
          else if (v < 0.6 && hash(x, y, seed + 7) > 0.88) img.set(x, y, lighter(side));
          break;
      }
    }
  }
  if (sp.pattern === "spots" || sp.pattern === "patches") {
    const n = sp.pattern === "patches" ? 4 : Math.round(body * sil.halfH * 0.06) + 2;
    for (let i = 0; i < n; i++) {
      const t = 0.15 + r() * 0.72;
      const x = Math.round(NOSE_X - t * body);
      const { y0, y1 } = colInfo(x);
      const y = Math.round(y0 + (0.12 + r() * 0.45) * (y1 - y0));
      if (sp.pattern === "patches") ellipse(img, x, y, 2 + r() * 2.5, 1.5 + r() * 1.5, (px, py) => (onBody(px, py) ? pc : img.get(px, py)));
      else if (body >= 30 && r() > 0.5) disc(img, x, y, 0.8, pc);
      else img.paint(x, y, pc);
    }
  }
  if (sp.pattern === "dots") {
    for (let x = NOSE_X - Math.round(body * 0.22); x > tbX + 2; x -= 3) {
      const { y0, y1 } = colInfo(x);
      img.paint(x, Math.round(y0 + 0.48 * (y1 - y0)), pc);
    }
  }

  // ── shine: a dashed highlight along the upper flank ──
  if (sp.shine) {
    for (let x = Math.round(NOSE_X - body * 0.58); x <= NOSE_X - body * 0.22; x++) {
      const { y0, y1 } = colInfo(x);
      if (x % 2 === 0) img.paint(x, Math.round(y0 + 0.2 * (y1 - y0)) + 0, lighter(back));
    }
  }

  // ── gill line ──
  if (sil.gill && body >= 14) {
    const gx = NOSE_X - sil.gill * body;
    const { y0, y1 } = colInfo(Math.round(gx));
    for (let y = y0 + 1; y < y1; y++) {
      const v = (y - y0) / (y1 - y0);
      if (v < 0.2 || v > 0.85) continue;
      const x = Math.round(gx + ((v - 0.55) / 0.3) ** 2 * 1.2);
      img.paint(x, y, darker(img.get(x, y)));
    }
  }

  // ── pectoral fin ──
  if (sil.pectoral) {
    const px = NOSE_X - sil.pectoral.t * body;
    const { y0, y1 } = colInfo(Math.round(px));
    const py = y0 + 0.58 * (y1 - y0);
    const L = sil.pectoral.len;
    polygon(img, [[px, py - 1], [px - L, py + L * 0.3], [px - L * 0.55, py + 1.6]], (x, y) => ((x + y) % 3 === 0 ? finDark : fin));
  }

  // ── spikes / finlets (outlined together with the body) ──
  if (sp.extras?.includes("spikes")) {
    for (let x = tbX + 2; x < NOSE_X - 1; x += 3) {
      const { y0, y1 } = colInfo(x);
      img.set(x, y0 - 1, fin);
      img.set(x, y1 + 1, fin);
    }
  }
  if (sp.extras?.includes("finlets")) {
    for (let x = Math.round(NOSE_X - body * 0.72); x > tbX + 1; x -= 2) {
      const { y0, y1 } = colInfo(x);
      img.set(x, y0 - 1, C.yellow);
      img.set(x, y1 + 1, C.yellow);
    }
  }
  if (sil.snout) {
    const { y0, y1 } = colInfo(NOSE_X);
    line(img, NOSE_X, Math.round((y0 + y1) / 2) + 0, NOSE_X + sil.snout, Math.round((y0 + y1) / 2) + 0, darker(back));
  }

  // ── outline ──
  const out = img.outline(C.ink);

  // ── face details on top of the outline ──
  const ex = Math.round(NOSE_X - sil.eye.t * body);
  const ec = colInfo(ex);
  const ey = Math.round(ec.y0 + sil.eye.v * (ec.y1 - ec.y0));
  if (sil.eye.r === 2) {
    if (sp.ring) for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, -1], [0, 2], [1, 2]] as const) out.set(ex + dx, ey + dy, C[sp.ring]);
    out.set(ex, ey, C.white);
    out.set(ex + 1, ey, C.ink);
    out.set(ex, ey + 1, C.ink);
    out.set(ex + 1, ey + 1, C.ink);
  } else {
    out.set(ex, ey, C.ink);
    if (sp.ring) out.set(ex - 1, ey, C[sp.ring]);
  }

  const mc = colInfo(NOSE_X);
  const my = Math.round(mc.y0 + 0.62 * (mc.y1 - mc.y0));
  const ml = sil.mouth ?? (body >= 18 ? 2 : 1);
  for (let i = 0; i < ml; i++) out.set(NOSE_X - i, my - (i > ml / 2 ? 1 : 0), C.ink);
  if (sp.extras?.includes("teeth")) for (let i = 1; i < ml + 1; i += 2) out.set(NOSE_X - i, my + 1, C.white);

  if (sp.extras?.includes("barbels")) {
    line(out, NOSE_X - 1, my + 1, NOSE_X - 5, my + 4, C.bark1);
    line(out, NOSE_X, my, NOSE_X + 3, my + 3, C.bark1);
  }
  if (sp.extras?.includes("lure")) {
    const hx = Math.round(NOSE_X - body * 0.12);
    const hy = colInfo(hx).y0 - 1;
    const glow = sp.extras.includes("glow") ? C.foam2 : C.yellow;
    line(out, hx, hy, hx + 2, hy - 4, C.bark1);
    line(out, hx + 2, hy - 4, hx + 5, hy - 5, C.bark1);
    out.set(hx + 6, hy - 5, glow);
    out.set(hx + 6, hy - 4, glow);
    out.set(hx + 7, hy - 4, C.white);
    out.set(hx + 7, hy - 5, glow);
  }
  if (sp.extras?.includes("glow")) {
    // faint glowing specks along the body for deep / ghostly species
    for (let i = 0; i < 6; i++) {
      const x = Math.round(NOSE_X - (0.2 + r() * 0.7) * body);
      const { y0, y1 } = colInfo(x);
      out.paint(x, Math.round(y0 + (0.3 + r() * 0.4) * (y1 - y0)), C.foam2);
    }
  }

  // ── crop ──
  const b = out.bounds();
  const cropped = new Img(b.w, b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) cropped.set(x, y, out.get(b.x + x, b.y + y));
  return { img: cropped, mouth: [NOSE_X - b.x, my - b.y] };
}

export function buildFish(): SheetItem[] {
  return FISH.map((sp) => {
    const { img, mouth } = renderFish(sp);
    return { name: sp.id, img, anchor: { mouth } };
  });
}

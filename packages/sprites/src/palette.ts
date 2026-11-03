// 바다의 주인 — shared 32-color palette (design §6-1).
// Every sprite is stored as palette indices; index 0 is transparent.
// Ramps are ordered light → dark so shading / outlines can step along them.

export const COLORS = {
  ink: "#0d0f1c",
  navy: "#1b1e36",
  deep1: "#13314b",
  deep2: "#1b4b6c",
  sea1: "#246c8f",
  sea2: "#3191b0",
  sea3: "#52b5ca",
  foam1: "#93dadc",
  foam2: "#d6f2ee",
  jade1: "#1e6b62",
  jade2: "#2f9b86",
  jade3: "#66c7a0",
  green1: "#30492f",
  green2: "#4f7b3d",
  green3: "#90b556",
  bark1: "#3e2723",
  bark2: "#6f4331",
  wood: "#a3683d",
  sand1: "#d69c5f",
  sand2: "#f1d08b",
  red1: "#5f2034",
  red2: "#a93b3f",
  coral: "#e66850",
  peach: "#ffa27f",
  skin1: "#c88b65",
  skin2: "#f3c69c",
  yellow: "#ffd85f",
  violet1: "#2c1e40",
  violet2: "#563a70",
  gray1: "#4b5265",
  gray2: "#8b94a7",
  white: "#eff4f8",
} as const;

export type ColorName = keyof typeof COLORS;

export const NAMES = Object.keys(COLORS) as ColorName[];
if (NAMES.length !== 32) throw new Error(`palette must have 32 colors, has ${NAMES.length}`);

/** Palette index of a color name (1-based; 0 = transparent). */
export const C = Object.fromEntries(NAMES.map((n, i) => [n, i + 1])) as Record<ColorName, number>;
export const T = 0;

/** RGBA for each index (0 = transparent). */
export const RGBA: [number, number, number, number][] = [
  [0, 0, 0, 0],
  ...NAMES.map((n) => {
    const h = COLORS[n];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255] as [
      number,
      number,
      number,
      number,
    ];
  }),
];

// One-step-darker map, used for shading and selective outlines.
const DARKER_PAIRS: [ColorName, ColorName][] = [
  ["white", "gray2"], ["gray2", "gray1"], ["gray1", "navy"], ["navy", "ink"], ["ink", "ink"],
  ["foam2", "foam1"], ["foam1", "sea3"], ["sea3", "sea2"], ["sea2", "sea1"], ["sea1", "deep2"],
  ["deep2", "deep1"], ["deep1", "navy"],
  ["jade3", "jade2"], ["jade2", "jade1"], ["jade1", "deep1"],
  ["green3", "green2"], ["green2", "green1"], ["green1", "ink"],
  ["sand2", "sand1"], ["sand1", "wood"], ["wood", "bark2"], ["bark2", "bark1"], ["bark1", "ink"],
  ["yellow", "sand1"],
  ["peach", "coral"], ["coral", "red2"], ["red2", "red1"], ["red1", "violet1"],
  ["skin2", "skin1"], ["skin1", "bark2"],
  ["violet2", "violet1"], ["violet1", "ink"],
];
export const DARKER: number[] = new Array(33).fill(0);
for (const [a, b] of DARKER_PAIRS) DARKER[C[a]] = C[b];

export const LIGHTER: number[] = new Array(33).fill(0);
for (const [a, b] of DARKER_PAIRS) if (a !== b && !LIGHTER[C[b]]) LIGHTER[C[b]] = C[a];
for (let i = 1; i <= 32; i++) if (!LIGHTER[i]) LIGHTER[i] = i;

export const darker = (i: number, steps = 1) => {
  let c = i;
  for (let s = 0; s < steps; s++) c = DARKER[c] || c;
  return c;
};
export const lighter = (i: number, steps = 1) => {
  let c = i;
  for (let s = 0; s < steps; s++) c = LIGHTER[c] || c;
  return c;
};

// ── Palette LUTs (design §4-7): index → index remaps for time of day and pollution ──

type Lut = number[];
const identity = (): Lut => Array.from({ length: 33 }, (_, i) => i);
function lut(pairs: [ColorName, ColorName][]): Lut {
  const m = identity();
  for (const [a, b] of pairs) m[C[a]] = C[b];
  return m;
}

export const LUTS = {
  day: identity(),
  morning: lut([
    ["foam2", "white"], ["sea3", "foam1"], ["sand2", "yellow"], ["deep1", "deep2"],
  ]),
  sunset: lut([
    ["foam2", "peach"], ["foam1", "sand2"], ["sea3", "coral"], ["sea2", "red2"], ["sea1", "violet2"],
    ["deep2", "violet1"], ["jade3", "sand1"], ["jade2", "wood"], ["white", "sand2"], ["gray2", "skin1"],
  ]),
  night: lut([
    // foam/white step down further so clouds read as dim shapes under the moon, not glowing
    ["white", "gray2"], ["foam2", "sea1"], ["foam1", "deep2"], ["sea3", "sea1"], ["sea2", "deep2"],
    ["sea1", "deep1"], ["deep2", "navy"], ["deep1", "navy"], ["jade3", "jade1"], ["jade2", "deep1"],
    ["sand2", "gray2"], ["sand1", "gray1"], ["wood", "bark2"], ["green3", "green1"], ["green2", "green1"],
    ["skin2", "skin1"], ["peach", "violet2"], ["coral", "red2"], ["yellow", "sand1"],
  ]),
  polluted: lut([
    ["foam2", "gray2"], ["foam1", "violet2"], ["sea3", "violet2"], ["sea2", "violet1"], ["sea1", "violet1"],
    ["deep2", "navy"], ["deep1", "ink"], ["jade3", "gray1"], ["jade2", "violet1"], ["jade1", "navy"],
    ["green3", "green1"], ["white", "gray2"], ["sand2", "gray2"],
  ]),
} as const;

export type LutName = keyof typeof LUTS;

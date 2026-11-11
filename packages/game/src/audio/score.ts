import type { AmbId, InstId } from "./synth";

// How the music is written down. Time is counted in 16th notes ("steps"), 4/4, 16 steps a bar.
//
// A line of notes is written bar by bar ("|" between bars), one token per 8th note by default:
//   A4  C#5  Bb3     a note        A3+C4+E4   several at once
//   -               hold the note before it one more step
//   .               rest
//   x  X  o         a drum hit: normal, accented, ghost
// Accompaniment comes from a chord list, one chord a bar ("Am F" = two halves):
//   bass   R 3 5 8  root, third, fifth, octave (low)        arp   0 1 2 3  chord tones upward, c = all

export type Ev = { at: number; dur: number; notes: number[]; vel: number };
export type Track = {
  inst: InstId;
  gain: number;
  pan?: number;
  /** Semitones added to every note. */
  transpose?: number;
  events: Ev[];
  /** Steps before the line repeats. */
  len: number;
  /** Only in these bars of the song's cycle: [from, to). */
  bars?: [number, number];
  /** Heard only when the scene turns this layer up (fishing: "tension" while reeling). */
  layer?: "tension";
};
export type SongId = "title" | "island" | "sea" | "village" | "storm";
export type Song = {
  id: SongId;
  bpm: number;
  /** Bars before everything lines up again. */
  bars: number;
  tracks: Track[];
  amb: { id: AmbId; gain: number }[];
};

export const STEPS_PER_BAR = 16;

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" → MIDI 61. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`score: bad note "${name}"`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
export const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
  dim: [0, 3, 6],
};

type Chord = { root: number; tones: number[]; bass: number };

/** "F#m7" · "A/C#" (C# in the bass) → pitch classes. */
export function chord(name: string): Chord {
  const [body, over] = name.split("/");
  const m = /^([A-G][#b]?)(.*)$/.exec(body!);
  const q = m ? QUALITY[m[2]!] : undefined;
  if (!m || !q) throw new Error(`score: bad chord "${name}"`);
  const root = (midi(`${m[1]}4`) % 12 + 12) % 12;
  const bass = over ? (midi(`${over}4`) % 12 + 12) % 12 : root;
  return { root, tones: q.map((i) => root + i), bass };
}

/** The chord's tones placed around `center` (MIDI), lowest first: smooth from one chord to the next. */
function voice(c: Chord, center: number): number[] {
  return c.tones
    .map((pc) => {
      let n = pc % 12;
      while (n < center - 6) n += 12;
      while (n >= center + 6) n -= 12;
      return n;
    })
    .sort((a, b) => a - b);
}

/** Each bar's chords: "Am" fills the bar, "Am F" splits it in halves. */
function chordAt(bars: string[], step: number): Chord {
  const bar = Math.floor(step / STEPS_PER_BAR) % bars.length;
  const parts = bars[bar]!.trim().split(/\s+/);
  const half = parts.length > 1 && step % STEPS_PER_BAR >= STEPS_PER_BAR / 2 ? 1 : 0;
  return chord(parts[half]!);
}

/** Read a line of tokens into events. `each` = steps per token (2 = 8ths, 1 = 16ths). */
function read(line: string, each: number, perBar: number, token: (tok: string, at: number) => { notes: number[]; vel: number } | null): { events: Ev[]; len: number } {
  const bars = line.split("|").map((b) => b.trim()).filter(Boolean);
  const toks: string[] = [];
  bars.forEach((b, i) => {
    const t = b.split(/\s+/);
    if (t.length !== perBar) throw new Error(`score: bar ${i + 1} has ${t.length} steps, wants ${perBar}: "${b}"`);
    toks.push(...t);
  });
  const events: Ev[] = [];
  let last: Ev | null = null;
  toks.forEach((tok, i) => {
    const at = i * each;
    if (tok === "-") {
      if (last) last.dur += each;
      return;
    }
    last = null;
    if (tok === ".") return;
    const n = token(tok, at);
    if (!n) return;
    last = { at, dur: each, ...n };
    events.push(last);
  });
  return { events, len: toks.length * each };
}

/** A melody (or any written line) in 8ths. */
export function line(inst: InstId, gain: number, text: string, more: Partial<Track> = {}): Track {
  const { events, len } = read(text, 2, 8, (tok) => ({ notes: tok.split("+").map(midi), vel: 1 }));
  return { inst, gain, events, len, ...more };
}

const HIT: Record<string, number> = { x: 0.7, X: 1, o: 0.4 };
/** A drum line; `each` = 1 for 16ths (16 tokens a bar), 2 for 8ths. */
export function drums(inst: InstId, gain: number, text: string, each: 1 | 2 = 2, more: Partial<Track> = {}): Track {
  const { events, len } = read(text, each, STEPS_PER_BAR / each, (tok) => (HIT[tok] ? { notes: [-1], vel: HIT[tok]! } : null));
  return { inst, gain, events, len, ...more };
}

/** A bass line over the chords: one rhythm (8ths) repeated every bar. */
export function bassline(chords: string[], rhythm: string, gain: number, more: Partial<Track> = {}): Track {
  const rbar = rhythm.trim().split(/\s+/);
  const text = chords.map(() => rbar.join(" ")).join(" | ");
  const { events, len } = read(text, 2, 8, (tok, at) => {
    const c = chordAt(chords, at);
    let low = c.bass;
    while (low < 36) low += 12; // C2..B2
    if (tok === "R") return { notes: [low], vel: 1 };
    if (tok === "8") return { notes: [low + 12], vel: 0.8 };
    if (tok === "5") return { notes: [low + ((c.root + 7 - c.bass + 12) % 12)], vel: 0.85 };
    if (tok === "3") return { notes: [low + ((c.tones[1]! - c.bass + 24) % 12)], vel: 0.85 };
    throw new Error(`score: bass token "${tok}"`);
  });
  return { inst: "bass", gain, events, len, ...more };
}

/** Broken chords: one pattern (8ths, or 16ths with each = 1) repeated every bar. */
export function arp(inst: InstId, chords: string[], pattern: string, center: number, gain: number, each: 1 | 2 = 2, more: Partial<Track> = {}): Track {
  const pbar = pattern.trim().split(/\s+/);
  const text = chords.map(() => pbar.join(" ")).join(" | ");
  const { events, len } = read(text, each, STEPS_PER_BAR / each, (tok, at) => {
    const v = voice(chordAt(chords, at), center);
    if (tok === "c") return { notes: v, vel: 0.8 };
    const i = Number(tok);
    if (!Number.isInteger(i)) throw new Error(`score: arp token "${tok}"`);
    return { notes: [v[i % v.length]! + 12 * Math.floor(i / v.length)], vel: 1 };
  });
  return { inst, gain, events, len, ...more };
}

/** Held chords, a bar (or half) each. */
export function pads(chords: string[], center: number, gain: number, more: Partial<Track> = {}): Track {
  const events: Ev[] = [];
  chords.forEach((bar, i) => {
    const parts = bar.trim().split(/\s+/);
    const each = STEPS_PER_BAR / parts.length;
    parts.forEach((p, k) => events.push({ at: i * STEPS_PER_BAR + k * each, dur: each, notes: voice(chord(p), center), vel: 1 }));
  });
  return { inst: "pad", gain, events, len: chords.length * STEPS_PER_BAR, ...more };
}

/** What plays under a fish on the line: a pulse on the roots and a heartbeat drum. */
export function tension(chords: string[]): Track[] {
  return [
    bassline(chords, "R R R R R R R R", 0.13, { layer: "tension" }),
    drums("kick", 0.24, "X . . . x . . . X . . . x . o .", 1, { layer: "tension" }),
    drums("shaker", 0.045, "x o x o x o x o x o x o x o x o", 1, { layer: "tension", pan: 0.3 }),
  ];
}

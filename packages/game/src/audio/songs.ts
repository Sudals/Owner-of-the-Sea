import { arp, bassline, drums, line, pads, tension, type Song, type SongId } from "./score";

// The music of 바다의 주인 — five songs, written for the game (CREDITS.md). Each has a chord
// list the accompaniment is built from, and a melody that one instrument sings in the first half
// of the cycle and another in the second, so a loop runs a minute and a half before it repeats.
// Korean folk melodies lean on the five-note scales (평조 · 계면조): most tunes here stay in them.

// ── 로비: "바다는 누구의 것인가" — a slow, wistful D minor over the waves ──
const TITLE_CHORDS = ["Dm", "Bbmaj7", "F", "C", "Dm", "Bbmaj7", "Gm7", "Asus4 A", "Bbmaj7", "C", "Am7", "Dm", "Gm7", "Bbmaj7", "C", "Dm"];
const TITLE_TUNE = `
  A4 - - - - - D5 C5 | D5 - - - F5 - D5 - | C5 - - - A4 - - - | G4 - - - - - . .  |
  A4 - - - - - D5 E5 | F5 - - - E5 - D5 - | D5 - - - C5 - Bb4 - | A4 - - - - - . . |
  F5 - - - A5 - - -  | G5 - - - E5 - - -  | E5 - - - C5 - D5 - | A4 - - - - - . .  |
  Bb4 - - - D5 - F5 - | A5 - - - F5 - - - | G5 - - - F5 - E5 - | D5 - - - - - . .  |`;

// ── 섬 · 선착장: a warm G major, a guitar picking and a wooden flute ──
const ISLAND_CHORDS = ["G", "Em7", "Cmaj7", "D", "G", "Em7", "Am7", "D", "Cmaj7", "D", "Bm7", "Em7", "Am7", "D", "G", "G"];
const ISLAND_TUNE = `
  D5 - - B4 D5 - E5 - | D5 - B4 - G4 - - - | E4 - G4 - B4 - D5 - | A4 - - - - - . . |
  D5 - - B4 D5 - G5 - | E5 - D5 - B4 - - - | C5 - B4 - A4 - G4 - | A4 - - - - - . . |
  G5 - - E5 - - D5 -  | F#5 - - E5 - - D5 - | D5 - - B4 - - A4 - | B4 - - - G4 - - - |
  E5 - - D5 - - C5 -  | D5 - - - A4 - F#4 - | G4 - B4 - D5 - G5 - | G5 - - - - - . . |`;

// ── 바다: under sail, D major, a steady swell ──
const SEA_CHORDS = ["D", "A/C#", "Bm", "G", "D", "A", "G", "A", "Bm", "G", "D", "A", "Em", "G", "Asus4", "A"];
const SEA_TUNE = `
  F#5 - - - E5 - D5 - | E5 - - - C#5 - A4 - | B4 - - D5 - - F#5 - | G5 - - - F#5 - D5 - |
  A5 - - - F#5 - D5 - | E5 - - - - - C#5 -  | D5 - B4 - G4 - B4 -  | A4 - - - - - . .    |
  F#5 - - - - - D5 -  | B4 - - - D5 - G5 -   | F#5 - - - A5 - F#5 - | E5 - - - - - . .    |
  G5 - - - E5 - B4 -  | D5 - - - B4 - G4 -   | D5 - - - E5 - - -    | C#5 - - - - - . .   |`;

// ── 마을: a market tune in C, oom-pah bass, a small accordion and a woodblock ──
const VILLAGE_CHORDS = ["C", "Am", "F", "G", "C", "Am", "Dm7", "G", "F", "G", "Em", "Am", "Dm7", "G", "C", "C"];
const VILLAGE_TUNE = `
  E5 - G5 - A5 - G5 - | E5 - - - C5 - D5 - | C5 - A4 - C5 - D5 - | D5 - - - - - . . |
  E5 - G5 - A5 - C6 - | A5 - G5 - E5 - - - | D5 - E5 - F5 - A5 - | G5 - - - - - . . |
  A5 - - G5 - - F5 -  | G5 - - E5 - - D5 - | E5 - - - G5 - E5 -  | C5 - - - A4 - - - |
  D5 - F5 - A5 - C6 - | B5 - - - G5 - D5 - | E5 - D5 - C5 - - -  | C5 - - - . . . .  |`;

// ── 폭풍: A minor, drums like a janggu, rain and wind ──
const STORM_CHORDS = ["Am", "F", "Dm", "E", "Am", "F", "G", "E"];
const STORM_TUNE = `
  A4 - - - C5 - B4 - | A4 - - - F4 - - - | D5 - - - F5 - E5 - | E5 - - - G#4 - - - |
  C5 - - - E5 - D5 - | C5 - - - A4 - - - | B4 - - - D5 - G5 - | E5 - - - - - . .   |`;

export const SONGS: Record<SongId, Song> = {
  title: {
    id: "title",
    bpm: 68,
    bars: 32,
    amb: [{ id: "waves", gain: 1 }],
    tracks: [
      pads(TITLE_CHORDS, 57, 0.06),
      bassline(TITLE_CHORDS, "R - - - 5 - - -", 0.17),
      arp("pluck", TITLE_CHORDS, "0 1 2 3 2 1 2 1", 62, 0.07, 2, { pan: -0.25 }),
      line("bell", 0.15, TITLE_TUNE, { bars: [0, 16], pan: 0.2 }),
      line("flute", 0.11, TITLE_TUNE, { bars: [16, 32] }),
    ],
  },
  island: {
    id: "island",
    bpm: 82,
    bars: 32,
    amb: [{ id: "waves", gain: 0.9 }],
    tracks: [
      bassline(ISLAND_CHORDS, "R - - - 5 - - -", 0.19),
      arp("pluck", ISLAND_CHORDS, "0 1 2 1 3 1 2 1", 62, 0.08, 2, { pan: -0.2 }),
      pads(ISLAND_CHORDS, 60, 0.04),
      line("flute", 0.12, ISLAND_TUNE, { bars: [0, 16] }),
      line("bell", 0.14, ISLAND_TUNE, { bars: [16, 32], pan: 0.2 }),
      drums("shaker", 0.04, "o x o x o x o x", 2, { bars: [16, 32], pan: 0.3 }),
      ...tension(ISLAND_CHORDS),
    ],
  },
  sea: {
    id: "sea",
    bpm: 96,
    bars: 32,
    amb: [{ id: "waves", gain: 0.8 }],
    tracks: [
      bassline(SEA_CHORDS, "R - - R - - 5 -", 0.19),
      arp("pluck", SEA_CHORDS, "0 2 1 2 0 2 3 2", 60, 0.075, 2, { pan: -0.25 }),
      pads(SEA_CHORDS, 62, 0.04),
      drums("shaker", 0.04, "o x o x o x o x", 2, { pan: 0.3 }),
      drums("kick", 0.2, "X . . . X . . .", 2, { bars: [8, 32] }),
      line("flute", 0.12, SEA_TUNE, { bars: [0, 16] }),
      line("bell", 0.14, SEA_TUNE, { bars: [16, 32], pan: 0.2 }),
      ...tension(SEA_CHORDS),
    ],
  },
  village: {
    id: "village",
    bpm: 104,
    bars: 32,
    amb: [{ id: "waves", gain: 0.45 }],
    tracks: [
      bassline(VILLAGE_CHORDS, "R - 5 - R - 5 -", 0.2),
      arp("pluck", VILLAGE_CHORDS, ". c . c . c . c", 64, 0.05, 2, { pan: -0.2 }),
      pads(VILLAGE_CHORDS, 60, 0.03),
      drums("wood", 0.11, ". . x . . . x .", 2, { pan: 0.3 }),
      drums("shaker", 0.035, "x o x o x o x o", 2, { pan: -0.3 }),
      line("reed", 0.07, VILLAGE_TUNE, { bars: [0, 16], transpose: -12, pan: 0.1 }),
      line("bell", 0.14, VILLAGE_TUNE, { bars: [16, 32], pan: 0.15 }),
    ],
  },
  storm: {
    id: "storm",
    bpm: 100,
    bars: 16,
    amb: [{ id: "rain", gain: 1 }, { id: "wind", gain: 1 }],
    tracks: [
      pads(STORM_CHORDS, 57, 0.055),
      bassline(STORM_CHORDS, "R R R R R R R R", 0.15),
      arp("pluck", STORM_CHORDS, "0 1 2 1 0 1 2 1", 57, 0.05, 2, { pan: -0.3 }),
      drums("tom", 0.28, "X . . x . . x . X . x . x . . .", 1, { pan: -0.1 }),
      drums("kick", 0.2, "X . . . . . . . X . . . . . . .", 1),
      line("flute", 0.12, STORM_TUNE, { bars: [8, 16] }),
      ...tension(STORM_CHORDS),
    ],
  },
};

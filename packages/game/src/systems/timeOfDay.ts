import type { LutName } from "@sea/sprites/palette";

// Day cycle (design §4-7): morning → day → sunset → night; 3 real minutes ≈ 1 game hour.
// The scene draws LUT `a`, then LUT `b` on top at alpha `t` while crossing between phases.

export const GAME_HOUR_SECONDS = 180;

const KEYS: [number, LutName][] = [
  [0, "night"],
  [4.5, "night"],
  [5.5, "morning"],
  [7.5, "day"],
  [16.5, "day"],
  [18, "sunset"],
  [19.5, "night"],
  [24, "night"],
];

export class Clock {
  constructor(public hours = 9) {}

  update(dt: number): void {
    this.hours = (this.hours + dt / GAME_HOUR_SECONDS) % 24;
  }

  advance(h: number): void {
    this.hours = (this.hours + h + 24) % 24;
  }

  blend(): { a: LutName; b: LutName; t: number } {
    const h = this.hours;
    for (let i = 0; i + 1 < KEYS.length; i++) {
      const [h0, a] = KEYS[i]!, [h1, b] = KEYS[i + 1]!;
      if (h >= h0 && h < h1) return { a, b, t: a === b ? 0 : (h - h0) / (h1 - h0) };
    }
    return { a: "night", b: "night", t: 0 };
  }

  /** Dominant LUT (for things that don't crossfade, e.g. sprites). */
  lut(): LutName {
    const { a, b, t } = this.blend();
    return t < 0.5 ? a : b;
  }

  /** Sun center in view px, or null below the horizon. Rises 6:00, sets 18:00. */
  sun(): { x: number; y: number } | null {
    return arc(this.hours, 6, 12);
  }

  /** Moon center, rises 18:30 and sets 5:30. */
  moon(): { x: number; y: number } | null {
    return arc((this.hours + 24 - 18.5) % 24, 0, 11);
  }

  label(): string {
    const h = Math.floor(this.hours), m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
}

function arc(h: number, start: number, span: number): { x: number; y: number } | null {
  const p = (h - start) / span;
  if (p < 0 || p > 1) return null;
  return { x: 40 + p * 560, y: 128 - Math.sin(p * Math.PI) * 96 };
}

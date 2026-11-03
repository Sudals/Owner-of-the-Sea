import { darker, RGBA } from "../palette";

/** Palette-indexed image. 0 = transparent. */
export class Img {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h);
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x]!;
  }

  set(x: number, y: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }

  /** Only paints where the image is already opaque. */
  paint(x: number, y: number, c: number): void {
    if (this.get(Math.round(x), Math.round(y))) this.set(x, y, c);
  }

  clone(): Img {
    const o = new Img(this.w, this.h);
    o.data.set(this.data);
    return o;
  }

  /** Draw `src` onto this image at (dx, dy); transparent pixels are skipped. */
  blit(src: Img, dx: number, dy: number, opts: { flipX?: boolean } = {}): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(opts.flipX ? src.w - 1 - x : x, y);
        if (c) this.set(dx + x, dy + y, c);
      }
  }

  map(fn: (c: number, x: number, y: number) => number): Img {
    const o = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.data[y * this.w + x] = fn(this.get(x, y), x, y);
    return o;
  }

  remap(lut: readonly number[]): Img {
    return this.map((c) => lut[c] ?? c);
  }

  flipX(): Img {
    return this.map((_, x, y) => this.get(this.w - 1 - x, y));
  }

  /**
   * Adds a 1px outline around opaque pixels.
   * `color` = fixed color, or 'selout' = darker shade of the neighbouring pixel.
   */
  outline(color: number | "selout", opts: { diagonal?: boolean } = {}): Img {
    const o = this.clone();
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const n8 = [...n4, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    const ns = opts.diagonal ? n8 : n4;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        for (const [dx, dy] of ns) {
          const nb = this.get(x + dx, y + dy);
          if (nb) {
            o.set(x, y, color === "selout" ? darker(nb, 2) : color);
            break;
          }
        }
      }
    return o;
  }

  /** Bounding box of opaque pixels. */
  bounds(): { x: number; y: number; w: number; h: number } {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.get(x, y)) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  toRGBA(): Uint8Array {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.data.length; i++) {
      const [r, g, b, a] = RGBA[this.data[i]!]!;
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = a;
    }
    return out;
  }
}

/** Parse an ASCII grid. `legend` maps characters to palette indices; '.' and ' ' are transparent. */
export function grid(rows: string, legend: Record<string, number>): Img {
  const lines = rows
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
  const indent = Math.min(...lines.map((l) => l.match(/^ */)![0].length));
  const trimmed = lines.map((l) => l.slice(indent));
  const w = Math.max(...trimmed.map((l) => l.length));
  const img = new Img(w, trimmed.length);
  trimmed.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const ch = line[x]!;
      if (ch === "." || ch === " ") continue;
      const c = legend[ch];
      if (c === undefined) throw new Error(`grid: unknown char '${ch}' at ${x},${y}`);
      img.set(x, y, c);
    }
  });
  return img;
}

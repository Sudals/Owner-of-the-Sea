import type { Img } from "./image";

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/** Ordered-dither threshold in [0,1) for pixel (x, y). */
export const bayer = (x: number, y: number) => (BAYER4[y & 3]![x & 3]! + 0.5) / 16;

/** Pick `a` or `b` for a blend amount t∈[0,1] using ordered dithering. */
export const dither = (x: number, y: number, t: number, a: number, b: number) => (t > bayer(x, y) ? b : a);

export function rect(img: Img, x: number, y: number, w: number, h: number, c: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x + i, y + j, c);
}

export function hline(img: Img, x0: number, x1: number, y: number, c: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) img.set(x, y, c);
}

export function vline(img: Img, x: number, y0: number, y1: number, c: number): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) img.set(x, y, c);
}

/** Bresenham line. */
export function line(img: Img, x0: number, y0: number, x1: number, y1: number, c: number): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    img.set(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Thick line drawn as a run of discs. */
export function thickLine(img: Img, x0: number, y0: number, x1: number, y1: number, r: number, c: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) disc(img, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r, c);
}

export function disc(img: Img, cx: number, cy: number, r: number, c: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.25) img.set(x, y, c);
}

export function ellipse(img: Img, cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number, nx: number, ny: number) => number)): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      if (typeof c === "number") img.set(x, y, c);
      else {
        const v = c(x, y, nx, ny);
        if (v) img.set(x, y, v); // a callback returning 0 means "leave this pixel alone"
      }
    }
}

/** Scanline polygon fill (even-odd), sampling pixel centers. */
export function polygon(img: Img, pts: [number, number][], c: number | ((x: number, y: number) => number)): void {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!;
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++)
        img.set(x, y, typeof c === "number" ? c : c(x, y));
  }
}

/** Deterministic PRNG (mulberry32) so builds are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth interpolation through keypoints [[t, v], …] (t ascending in [0,1]). */
export function curve(points: [number, number][]): (t: number) => number {
  return (t) => {
    if (t <= points[0]![0]) return points[0]![1];
    for (let i = 0; i + 1 < points.length; i++) {
      const [t0, v0] = points[i]!, [t1, v1] = points[i + 1]!;
      if (t <= t1) {
        const u = (t - t0) / (t1 - t0);
        const s = u * u * (3 - 2 * u);
        return v0 + (v1 - v0) * s;
      }
    }
    return points[points.length - 1]![1];
  };
}

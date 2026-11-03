import { C, LUTS, RGBA, type LutName } from "@sea/sprites/palette";
import { bakeSea, WORLD_H, WORLD_W } from "./seaBake";

// The baked sea map (palette indices, 3584×2240) turned into pixels on demand: 256 px chunks,
// recolored per time-of-day LUT and kept in a small LRU, so only what the camera sees is ever
// converted (a full RGBA copy per LUT would be 32 MB each).

const CHUNK = 256;
const KEEP = 72; // ≈ 18 MB of chunks at most

let baked: Uint8Array | null = null;

/** Bake once per page load (~0.5 s). */
export function bakedSea(): Uint8Array {
  return (baked ??= bakeSea());
}

export const isBaked = () => baked !== null;

/** Packed RGBA (little-endian ABGR) per palette index after a LUT. */
function paletteFor(lut: LutName): Uint32Array {
  const out = new Uint32Array(RGBA.length);
  const map = LUTS[lut] as readonly number[];
  for (let i = 1; i < RGBA.length; i++) {
    const [r, g, b] = RGBA[map[i] ?? i]!;
    out[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  out[0] = (255 << 24) | (RGBA[C.ink]![2] << 16) | (RGBA[C.ink]![1] << 8) | RGBA[C.ink]![0];
  return out;
}

export class SeaView {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly palettes = new Map<LutName, Uint32Array>();

  constructor(private readonly buf: Uint8Array = bakedSea()) {}

  /** Draw the part of the world under the camera (camera = world px of the view's top-left). */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, lut: LutName): void {
    const x0 = Math.max(0, Math.floor(camX / CHUNK)), x1 = Math.min(Math.ceil(WORLD_W / CHUNK) - 1, Math.floor((camX + w - 1) / CHUNK));
    const y0 = Math.max(0, Math.floor(camY / CHUNK)), y1 = Math.min(Math.ceil(WORLD_H / CHUNK) - 1, Math.floor((camY + h - 1) / CHUNK));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) ctx.drawImage(this.chunk(lut, cx, cy), cx * CHUNK - camX, cy * CHUNK - camY);
  }

  private chunk(lut: LutName, cx: number, cy: number): HTMLCanvasElement {
    const key = `${lut}:${cx},${cy}`;
    const hit = this.cache.get(key);
    if (hit) {
      // refresh LRU position
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const w = Math.min(CHUNK, WORLD_W - cx * CHUNK), h = Math.min(CHUNK, WORLD_H - cy * CHUNK);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d")!;
    const img = c.createImageData(w, h);
    const px = new Uint32Array(img.data.buffer);
    let pal = this.palettes.get(lut);
    if (!pal) this.palettes.set(lut, (pal = paletteFor(lut)));
    for (let y = 0; y < h; y++) {
      const row = (cy * CHUNK + y) * WORLD_W + cx * CHUNK;
      for (let x = 0; x < w; x++) px[y * w + x] = pal[this.buf[row + x]!]!;
    }
    c.putImageData(img, 0, 0);
    this.cache.set(key, canvas);
    if (this.cache.size > KEEP) this.cache.delete(this.cache.keys().next().value!);
    return canvas;
  }
}

export { WORLD_H, WORLD_W };

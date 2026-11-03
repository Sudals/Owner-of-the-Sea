import { COLORS, LUTS, NAMES, type LutName } from "@sea/sprites/palette";

// Sprite sheets + backgrounds built by packages/sprites (design §6-1), and runtime
// palette-LUT recoloring for time of day / pollution (design §4-7).

export type Frame = { x: number; y: number; w: number; h: number; anchor?: Record<string, [number, number]> };
type AtlasJson = { image: string; frames: Record<string, Frame>; meta?: Record<string, unknown> };

export type BgMeta = {
  size: [number, number];
  horizon: number;
  waterline: number;
  dock: { stand: [number, number]; pierTop: number; pierFrom: number; pierTo: number; shoreX: number; bedFrom: number; bedTo: number; bedY: number };
  seas: string[];
};

export const ATLASES = ["fish", "angler", "boat", "boat_top", "props", "ui", "pollutants", "sky"] as const;
export type AtlasName = (typeof ATLASES)[number];
export const BACKGROUNDS = ["bg_dock", "bg_dock_market", "bg_dock_salt", "bg_dock_village", "bg_sea_jade", "bg_sea_azure", "bg_sea_indigo", "bg_sea_ink"] as const;
export type BgName = (typeof BACKGROUNDS)[number];

/** Side-view island backgrounds share the dock's geometry (pier, waterline, seabed — bg_meta.dock),
 *  so the hub and dock fishing use the same picture. Islands without their own art yet (M7) get a
 *  plain village. */
export function islandBg(islandId: string): BgName {
  switch (islandId) {
    case "red_lighthouse":
      return "bg_dock";
    case "water_market":
      return "bg_dock_market";
    case "salt_flower":
      return "bg_dock_salt";
    default:
      return "bg_dock_village";
  }
}

const HEX = NAMES.map((n) => COLORS[n]);
/** 0xRRGGBB → palette index (1-based). */
const RGB_TO_INDEX = new Map<number, number>(HEX.map((h, i) => [parseInt(h.slice(1), 16), i + 1]));

/** Hex color of a palette color after a LUT is applied. */
export function lutHex(name: keyof typeof COLORS, lut: LutName = "day"): string {
  const idx = NAMES.indexOf(name) + 1;
  return HEX[(LUTS[lut][idx] ?? idx) - 1]!;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export class Assets {
  private readonly atlases = new Map<AtlasName, { img: HTMLImageElement; json: AtlasJson }>();
  private readonly images = new Map<BgName, HTMLImageElement>();
  private readonly recolorCache = new Map<string, HTMLCanvasElement>();
  meta!: BgMeta;

  private constructor(readonly base: string) {}

  static async load(base: string, onProgress?: (done: number, total: number) => void): Promise<Assets> {
    const a = new Assets(base.endsWith("/") ? base : `${base}/`);
    const total = ATLASES.length + BACKGROUNDS.length + 1;
    let done = 0;
    const tick = () => onProgress?.(++done, total);
    await Promise.all([
      ...ATLASES.map(async (name) => {
        const json = (await (await fetch(`${a.base}${name}.json`)).json()) as AtlasJson;
        const img = await loadImage(`${a.base}${json.image}`);
        a.atlases.set(name, { img, json });
        tick();
      }),
      ...BACKGROUNDS.map(async (name) => {
        a.images.set(name, await loadImage(`${a.base}${name}.png`));
        tick();
      }),
      (async () => {
        a.meta = (await (await fetch(`${a.base}bg_meta.json`)).json()) as BgMeta;
        tick();
      })(),
    ]);
    return a;
  }

  frame(atlas: AtlasName, name: string): Frame {
    const f = this.atlases.get(atlas)?.json.frames[name];
    if (!f) throw new Error(`no frame ${atlas}/${name}`);
    return f;
  }

  has(atlas: AtlasName, name: string): boolean {
    return !!this.atlases.get(atlas)?.json.frames[name];
  }

  atlasMeta<T = Record<string, unknown>>(atlas: AtlasName): T {
    return (this.atlases.get(atlas)?.json.meta ?? {}) as T;
  }

  frameNames(atlas: AtlasName): string[] {
    return Object.keys(this.atlases.get(atlas)?.json.frames ?? {});
  }

  /** Draw a frame with its top-left at (x, y). Positions are rounded to whole pixels. */
  draw(ctx: CanvasRenderingContext2D, atlas: AtlasName, name: string, x: number, y: number, opts: { flipX?: boolean; lut?: LutName } = {}): void {
    const entry = this.atlases.get(atlas);
    if (!entry) return;
    const f = this.frame(atlas, name);
    const src = this.source(`atlas:${atlas}`, entry.img, opts.lut ?? "day");
    x = Math.round(x);
    y = Math.round(y);
    if (opts.flipX) {
      ctx.save();
      ctx.translate(x + f.w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      ctx.restore();
    } else ctx.drawImage(src, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
  }

  /** Draw a sub-rectangle of a frame, scaled (nearest-neighbour) into a destination rect — for 9-slices and bars. */
  drawPart(
    ctx: CanvasRenderingContext2D,
    atlas: AtlasName,
    name: string,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    lut: LutName = "day",
  ): void {
    const entry = this.atlases.get(atlas);
    if (!entry || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const f = this.frame(atlas, name);
    ctx.drawImage(this.source(`atlas:${atlas}`, entry.img, lut), f.x + sx, f.y + sy, sw, sh, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
  }

  /** A frame as a flat silhouette in one color (도감: species not caught yet). Cached. */
  drawSilhouette(ctx: CanvasRenderingContext2D, atlas: AtlasName, name: string, x: number, y: number, color: string): void {
    const entry = this.atlases.get(atlas);
    if (!entry) return;
    const f = this.frame(atlas, name);
    const key = `sil:${atlas}:${name}:${color}`;
    let c = this.recolorCache.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = f.w;
      c.height = f.h;
      const g = c.getContext("2d")!;
      g.drawImage(entry.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, f.w, f.h);
      this.recolorCache.set(key, c);
    }
    ctx.drawImage(c, Math.round(x), Math.round(y));
  }

  /** A full-screen background, recolored for the LUT. */
  background(name: BgName, lut: LutName = "day"): CanvasImageSource {
    const img = this.images.get(name);
    if (!img) throw new Error(`no background ${name}`);
    return this.source(`bg:${name}`, img, lut);
  }

  /** Original image for "day", otherwise a cached recolored copy (index → LUT → index). */
  private source(key: string, img: HTMLImageElement, lut: LutName): CanvasImageSource {
    if (lut === "day") return img;
    const cacheKey = `${key}|${lut}`;
    const hit = this.recolorCache.get(cacheKey);
    if (hit) return hit;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const c = canvas.getContext("2d", { willReadFrequently: true })!;
    c.drawImage(img, 0, 0);
    const data = c.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    const map = LUTS[lut];
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const idx = RGB_TO_INDEX.get((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
      if (!idx) continue;
      const out = HEX[(map[idx] ?? idx) - 1]!;
      px[i] = parseInt(out.slice(1, 3), 16);
      px[i + 1] = parseInt(out.slice(3, 5), 16);
      px[i + 2] = parseInt(out.slice(5, 7), 16);
    }
    c.putImageData(data, 0, 0);
    this.recolorCache.set(cacheKey, canvas);
    return canvas;
  }
}

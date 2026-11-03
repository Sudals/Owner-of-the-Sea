import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import { C } from "../palette";
import { Img } from "./image";

export function writePng(path: string, img: Img, scale = 1): void {
  const w = img.w * scale, h = img.h * scale;
  const png = new PNG({ width: w, height: h });
  const rgba = img.toRGBA();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = (Math.floor(y / scale) * img.w + Math.floor(x / scale)) * 4;
      const di = (y * w + x) * 4;
      png.data[di] = rgba[si]!;
      png.data[di + 1] = rgba[si + 1]!;
      png.data[di + 2] = rgba[si + 2]!;
      png.data[di + 3] = rgba[si + 3]!;
    }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

export type Frame = { x: number; y: number; w: number; h: number; anchor?: Record<string, [number, number]> };
export type Atlas = { image: string; frames: Record<string, Frame>; meta?: Record<string, unknown> };

export type SheetItem = { name: string; img: Img; anchor?: Record<string, [number, number]> };

/** Shelf-pack items into one sheet with `pad` px gaps. */
export function pack(items: SheetItem[], opts: { maxWidth?: number; pad?: number } = {}): { img: Img; frames: Record<string, Frame> } {
  const pad = opts.pad ?? 1;
  const maxW = opts.maxWidth ?? 512;
  const sorted = [...items].sort((a, b) => b.img.h - a.img.h);
  const placed: { item: SheetItem; x: number; y: number }[] = [];
  let x = pad, y = pad, rowH = 0, sheetW = 0;
  for (const item of sorted) {
    if (x + item.img.w + pad > maxW && x > pad) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.push({ item, x, y });
    x += item.img.w + pad;
    rowH = Math.max(rowH, item.img.h);
    sheetW = Math.max(sheetW, x);
  }
  const sheet = new Img(sheetW, y + rowH + pad);
  const frames: Record<string, Frame> = {};
  for (const p of placed) {
    sheet.blit(p.item.img, p.x, p.y);
    frames[p.item.name] = { x: p.x, y: p.y, w: p.item.img.w, h: p.item.img.h, ...(p.item.anchor ? { anchor: p.item.anchor } : {}) };
  }
  return { img: sheet, frames };
}

export function writeAtlas(dir: string, name: string, items: SheetItem[], meta?: Record<string, unknown>, opts?: { maxWidth?: number }): { img: Img; atlas: Atlas } {
  const { img, frames } = pack(items, opts);
  writePng(`${dir}/${name}.png`, img);
  const atlas: Atlas = { image: `${name}.png`, frames, ...(meta ? { meta } : {}) };
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(atlas, null, 1));
  return { img, atlas };
}

/** Review sheet: items laid out on a checker background, scaled up. */
export function contactSheet(items: SheetItem[], opts: { cols?: number; cell?: [number, number]; bg?: [number, number] } = {}): Img {
  const cw = opts.cell?.[0] ?? Math.max(...items.map((i) => i.img.w)) + 4;
  const ch = opts.cell?.[1] ?? Math.max(...items.map((i) => i.img.h)) + 4;
  const cols = opts.cols ?? Math.max(1, Math.floor(480 / cw));
  const rows = Math.ceil(items.length / cols);
  const out = new Img(cols * cw, rows * ch);
  const [b1, b2] = opts.bg ?? [C.sea1, C.deep2]; // water-like checker, like in-game
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, ((x >> 3) + (y >> 3)) & 1 ? b1 : b2);
  items.forEach((it, i) => {
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
    out.blit(it.img, cx + Math.floor((cw - it.img.w) / 2), cy + Math.floor((ch - it.img.h) / 2));
  });
  return out;
}

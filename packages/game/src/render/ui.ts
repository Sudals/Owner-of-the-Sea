import type { Assets } from "../assets";
import { lutHex } from "../assets";

// Canvas UI bits drawn inside the 640×360 view: Galmuri text, 9-slice panels, gauges.

export const FONT = "12px Galmuri11, monospace";
export const LINE_H = 13;

type TextOpts = {
  color?: string;
  shadow?: string | null;
  align?: CanvasTextAlign;
  font?: string;
  /** Never wider than this (px): cut with "…" so it stays inside its box. */
  maxW?: number;
};

/** `s` cut to `w` px with an ellipsis (as drawn in `font`). */
export function fitText(ctx: CanvasRenderingContext2D, s: string, w: number, font = FONT): string {
  ctx.font = font;
  if (ctx.measureText(s).width <= w) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > w) t = t.slice(0, -1);
  return `${t}…`;
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): number {
  if (o.maxW !== undefined) s = fitText(ctx, s, o.maxW, o.font ?? FONT);
  ctx.font = o.font ?? FONT;
  ctx.textBaseline = "top";
  ctx.textAlign = o.align ?? "left";
  x = Math.round(x);
  y = Math.round(y);
  const shadow = o.shadow === undefined ? lutHex("ink") : o.shadow;
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(s, x + 1, y + 1);
  }
  ctx.fillStyle = o.color ?? lutHex("white");
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

export function textWidth(ctx: CanvasRenderingContext2D, s: string, font = FONT): number {
  ctx.font = font;
  return ctx.measureText(s).width;
}

/** 9-slice a 24×24 (8px corner) panel from ui.png to any size. Edges and center are TILED, not
 *  stretched, so textured panels (paper speckle) keep their pixel size. */
export function panel(ctx: CanvasRenderingContext2D, assets: Assets, name: "panel_wood" | "panel_sea" | "panel_paper", x: number, y: number, w: number, h: number): void {
  const f = assets.frame("ui", name);
  const c = 8;
  const mw = f.w - 2 * c, mh = f.h - 2 * c;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) =>
    assets.drawPart(ctx, "ui", name, sx, sy, sw, sh, dx, dy, sw, sh);
  /** Repeat source tile (sx,sy,sw,sh) over the destination box, clipping the last tile. */
  const tile = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
    for (let ty = 0; ty < dh; ty += sh)
      for (let tx = 0; tx < dw; tx += sw) part(sx, sy, Math.min(sw, dw - tx), Math.min(sh, dh - ty), dx + tx, dy + ty);
  };
  const iw = w - 2 * c, ih = h - 2 * c;
  tile(c, c, mw, mh, x + c, y + c, iw, ih);
  tile(c, 0, mw, c, x + c, y, iw, c);
  tile(c, f.h - c, mw, c, x + c, y + h - c, iw, c);
  tile(0, c, c, mh, x, y + c, c, ih);
  tile(f.w - c, c, c, mh, x + w - c, y + c, c, ih);
  part(0, 0, c, c, x, y);
  part(f.w - c, 0, c, c, x + w - c, y);
  part(0, f.h - c, c, c, x, y + h - c);
  part(f.w - c, f.h - c, c, c, x + w - c, y + h - c);
}

/** Horizontal gauge: frame from ui.png stretched to `w`, filled 0..1 with `color`. */
export function gaugeH(ctx: CanvasRenderingContext2D, assets: Assets, x: number, y: number, w: number, value: number, color: string, marks: number[] = []): void {
  const f = assets.frame("ui", "gauge_h");
  const c = 3;
  x = Math.round(x); y = Math.round(y);
  assets.drawPart(ctx, "ui", "gauge_h", 0, 0, c, f.h, x, y, c, f.h);
  assets.drawPart(ctx, "ui", "gauge_h", c, 0, 1, f.h, x + c, y, w - 2 * c, f.h);
  assets.drawPart(ctx, "ui", "gauge_h", f.w - c, 0, c, f.h, x + w - c, y, c, f.h);
  const inner = w - 4;
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 2, Math.round(inner * Math.max(0, Math.min(1, value))), f.h - 4);
  ctx.fillStyle = lutHex("gray1");
  for (const m of marks) ctx.fillRect(x + 2 + Math.round(inner * m), y + 1, 1, f.h - 2);
}

/** Vertical gauge filling bottom → top. */
export function gaugeV(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, value: number, color: string): void {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = lutHex("ink");
  ctx.fillRect(x, y, 8, h);
  ctx.fillStyle = lutHex("navy");
  ctx.fillRect(x + 1, y + 1, 6, h - 2);
  const fill = Math.round((h - 4) * Math.max(0, Math.min(1, value)));
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + h - 2 - fill, 4, fill);
}

export type ButtonState = "normal" | "hover" | "pressed" | "disabled";

/** Button from ui.png (40×14, 4px corners) 9-sliced to any size, with a centered label. */
export function button(ctx: CanvasRenderingContext2D, assets: Assets, state: ButtonState, label: string, x: number, y: number, w: number, h = 20): void {
  const name = `button_${state}`;
  const f = assets.frame("ui", name);
  const c = 4;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) =>
    assets.drawPart(ctx, "ui", name, sx, sy, sw, sh, dx, dy, dw, dh);
  const mw = f.w - 2 * c, mh = f.h - 2 * c, iw = w - 2 * c, ih = h - 2 * c;
  part(c, c, mw, mh, x + c, y + c, iw, ih); // flat fill: stretching is fine
  part(c, 0, mw, c, x + c, y, iw, c);
  part(c, f.h - c, mw, c, x + c, y + h - c, iw, c);
  part(0, c, c, mh, x, y + c, c, ih);
  part(f.w - c, c, c, mh, x + w - c, y + c, c, ih);
  part(0, 0, c, c, x, y, c, c);
  part(f.w - c, 0, c, c, x + w - c, y, c, c);
  part(0, f.h - c, c, c, x, y + h - c, c, c);
  part(f.w - c, f.h - c, c, c, x + w - c, y + h - c, c, c);
  const color = state === "disabled" ? lutHex("gray1") : lutHex("ink");
  // a label never spills out of its button
  text(ctx, label, x + w / 2, y + Math.round((h - 12) / 2) + (state === "pressed" ? 1 : 0), { align: "center", color, shadow: null, maxW: w - 8 });
}

/** Darken the whole view (behind dialogs). */
export function dim(ctx: CanvasRenderingContext2D, alpha = 0.55): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = lutHex("ink");
  ctx.fillRect(0, 0, 640, 360);
  ctx.globalAlpha = 1;
}

/** Is view point p inside rect r? */
export const inRect = (p: { x: number; y: number } | null, r: { x: number; y: number; w: number; h: number }): boolean =>
  !!p && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

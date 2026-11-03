// Small pixel-exact drawing helpers for runtime effects (rod, line, waves).

export function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** Bresenham line, 1px, no anti-aliasing. `colorAt(i, n)` picks a color per step. */
export function pixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string | ((i: number, n: number) => string),
): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  const n = Math.max(dx, -dy);
  let err = dx + dy, i = 0;
  for (;;) {
    ctx.fillStyle = typeof color === "string" ? color : color(i, n);
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    i++;
  }
}

/** Quadratic curve sampled into 1px segments (fishing line sag). */
export function pixelCurve(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, cx: number, cy: number, x1: number, y1: number,
  color: string,
): void {
  const steps = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
  let px0 = x0, py0 = y0;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    pixelLine(ctx, px0, py0, x, y, color);
    px0 = x; py0 = y;
  }
}

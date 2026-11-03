import type { LutName } from "@sea/sprites/palette";
import { lutHex } from "../assets";

// Runtime water (design §6-2 물): an animated surface line and drifting glints over the
// static background. Two sine waves keep it from looking mechanical.

export function drawSurface(ctx: CanvasRenderingContext2D, t: number, waterline: number, x0: number, lut: LutName): void {
  const foam = lutHex("foam2", lut), crest = lutHex("white", lut), body = lutHex("sea3", lut);
  for (let x = x0; x < 640; x++) {
    const o = Math.round(Math.sin(x * 0.07 + t * 1.6) * 0.9 + Math.sin(x * 0.19 - t * 2.3) * 0.6);
    // a raised crest shows one water pixel above the line; a trough shows the line lower
    if (o < 0) {
      ctx.fillStyle = body;
      ctx.fillRect(x, waterline + o + 1, 1, -o);
    }
    ctx.fillStyle = o < 0 && Math.sin(x * 0.5 + t * 3) > 0.7 ? crest : foam;
    ctx.fillRect(x, waterline + o, 1, 1);
  }
  // glints drifting just under the surface
  ctx.fillStyle = crest;
  for (let i = 0; i < 28; i++) {
    if (Math.sin(t * 2.2 + i * 1.7) < 0.55) continue;
    const span = 640 - x0;
    const x = x0 + ((i * 97 + t * (6 + (i % 4) * 5)) % span);
    const y = waterline + 4 + ((i * 13) % 12);
    ctx.fillRect(Math.round(x), y, i % 3 === 0 ? 2 : 1, 1);
  }
}

import type { LutName } from "@sea/sprites/palette";
import type { Clock } from "../systems/timeOfDay";

// Top-down views (the sea, the villages) keep their day colors — a full LUT swap turns a sunset
// sea into sand — and lay time of day over the world as a light tint instead (not over the HUD).

const TINT: Partial<Record<LutName, { color: string; alpha: number; mode: GlobalCompositeOperation }[]>> = {
  morning: [{ color: "#ffc59a", alpha: 0.5, mode: "soft-light" }],
  sunset: [
    { color: "#c97a8c", alpha: 0.55, mode: "multiply" },
    { color: "#ff9a50", alpha: 0.3, mode: "overlay" },
  ],
  night: [{ color: "#28366e", alpha: 0.8, mode: "multiply" }],
};

/** Morning / sunset / night over the whole view, blended between the clock's two phases. */
export function drawDayTint(ctx: CanvasRenderingContext2D, clock: Clock, w = 640, h = 360): void {
  const { a, b, t } = clock.blend();
  ctx.save();
  for (const [name, weight] of [[a, 1 - t], [b, t]] as const) {
    if (weight <= 0) continue;
    for (const layer of TINT[name] ?? []) {
      ctx.globalCompositeOperation = layer.mode;
      ctx.globalAlpha = layer.alpha * weight;
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}

/** True at night (lamps glow, windows light up). */
export const isNight = (clock: Clock): boolean => {
  const { a, b, t } = clock.blend();
  return (t < 0.5 ? a : b) === "night";
};

import type { LutName } from "@sea/sprites/palette";
import { lutHex } from "../assets";

// Game feel (juice): particles, floating numbers, ripples, screen shake and a colored screen
// flash. One Fx per scene; positions are in the scene's own space (world px on the sea map,
// view px on the side views) — draw() takes the camera, drawScreen() overlays the whole view.

type Col = Parameters<typeof lutHex>[0];

type Particle = {
  x: number; y: number; vx: number; vy: number;
  /** px/s² downward (side views); 0 on the top-down map */
  g: number;
  /** velocity kept per second (0.1 = slows fast) */
  drag: number;
  t: number; life: number;
  /** colors over its life, first to last */
  colors: Col[];
  size: number;
};
type Floater = { x: number; y: number; text: string; color: Col; t: number; life: number; vy: number; big: boolean };
type Ring = { x: number; y: number; r0: number; r1: number; t: number; life: number; color: Col; squash: number };

export type BurstOpts = {
  colors: Col[];
  /** px/s, picked between the two */
  speed?: [number, number];
  /** spray direction (radians) and half-width of the cone; default all around */
  dir?: number;
  spread?: number;
  life?: [number, number];
  g?: number;
  drag?: number;
  size?: number;
  /** start scattered within this radius */
  jitter?: number;
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Fx {
  private parts: Particle[] = [];
  private floats: Floater[] = [];
  private rings: Ring[] = [];
  private shakeAmp = 0;
  private flashA = 0;
  private flashColor: Col = "red2";
  private flashFall = 2.5;
  /** Pulsing edge glow while something is dangerous (0..1; set each frame by the scene). */
  danger = 0;
  private t = 0;

  update(dt: number): void {
    this.t += dt;
    for (const p of this.parts) {
      p.t += dt;
      const k = Math.pow(p.drag, dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const f of this.floats) {
      f.t += dt;
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.15, dt);
    }
    this.floats = this.floats.filter((f) => f.t < f.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 14);
    this.flashA = Math.max(0, this.flashA - dt * this.flashFall);
  }

  /** Spray `n` particles from (x, y). */
  burst(x: number, y: number, n: number, o: BurstOpts): void {
    const [s0, s1] = o.speed ?? [20, 60];
    const [l0, l1] = o.life ?? [0.4, 0.8];
    for (let i = 0; i < n; i++) {
      const a = o.dir === undefined ? Math.random() * Math.PI * 2 : o.dir + rnd(-(o.spread ?? 0.6), o.spread ?? 0.6);
      const v = rnd(s0, s1), j = o.jitter ?? 0;
      this.parts.push({
        x: x + rnd(-j, j), y: y + rnd(-j, j),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        g: o.g ?? 0, drag: o.drag ?? 0.15,
        t: 0, life: rnd(l0, l1),
        colors: o.colors, size: o.size ?? 1,
      });
    }
  }

  /** A number or word rising from (x, y): "-12", "+34G", "툭!". */
  text(x: number, y: number, s: string, color: Col, opts: { life?: number; big?: boolean } = {}): void {
    this.floats.push({ x, y, text: s, color, t: 0, life: opts.life ?? 1.1, vy: -38, big: !!opts.big });
  }

  /** An expanding ring (a splash on the water seen from above, or squashed for a side view). */
  ring(x: number, y: number, color: Col, r1 = 14, life = 0.6, squash = 1): void {
    this.rings.push({ x, y, r0: 2, r1, t: 0, life, color, squash });
  }

  /** Shake the view by up to `amp` px (stronger calls win; decays on its own). */
  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, Math.min(8, amp));
  }

  /** Wash the view with a color that fades out (damage = red2, a rare catch = yellow). */
  flash(color: Col, alpha: number, fadePerSec = 2.5): void {
    if (alpha < this.flashA && color !== this.flashColor) return;
    this.flashColor = color;
    this.flashA = Math.min(0.85, Math.max(this.flashA, alpha));
    this.flashFall = fadePerSec;
  }

  /** This frame's shake offset (call once per frame). */
  offset(): { x: number; y: number } {
    const a = this.shakeAmp;
    if (a < 0.5) return { x: 0, y: 0 };
    return { x: Math.round(rnd(-a, a)), y: Math.round(rnd(-a, a)) };
  }

  get busy(): boolean {
    return this.parts.length + this.floats.length + this.rings.length > 0 || this.flashA > 0 || this.shakeAmp > 0;
  }

  /** Particles, rings and floating text, in scene space shifted by the camera. */
  draw(ctx: CanvasRenderingContext2D, camX = 0, camY = 0, lut: LutName = "day"): void {
    for (const r of this.rings) {
      const k = r.t / r.life, rr = r.r0 + (r.r1 - r.r0) * Math.sqrt(k);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = lutHex(r.color, lut);
      const n = Math.max(12, Math.round(rr * 2.2));
      for (let q = 0; q < n; q++) {
        const a = (q / n) * Math.PI * 2;
        ctx.fillRect(Math.round(r.x - camX + Math.cos(a) * rr), Math.round(r.y - camY + Math.sin(a) * rr * r.squash), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.parts) {
      const k = p.t / p.life;
      ctx.fillStyle = lutHex(p.colors[Math.min(p.colors.length - 1, Math.floor(k * p.colors.length))]!, lut);
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    for (const f of this.floats) {
      const k = f.t / f.life;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = f.big ? "bold 12px Galmuri11, monospace" : "12px Galmuri11, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const x = Math.round(f.x - camX), y = Math.round(f.y - camY);
      ctx.fillStyle = lutHex("ink");
      ctx.fillText(f.text, x + 1, y + 1);
      ctx.fillText(f.text, x - 1, y);
      ctx.fillStyle = lutHex(f.color);
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** The screen flash and the danger glow, over the whole 640×360 view. */
  drawScreen(ctx: CanvasRenderingContext2D): void {
    const glow = this.danger > 0 ? this.danger * (0.5 + 0.5 * Math.sin(this.t * 9)) * 0.35 : 0;
    const a = Math.max(this.flashA, glow);
    if (a <= 0.01) return;
    const color = this.flashA >= glow ? this.flashColor : "red2";
    ctx.fillStyle = lutHex(color);
    // light over the middle, strongest at the edges (a vignette, so the action stays visible)
    ctx.globalAlpha = a * 0.35;
    ctx.fillRect(0, 0, 640, 360);
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = Math.min(1, a * (0.9 - i * 0.16));
      const e = 4 + i * 7;
      ctx.fillRect(0, 0, 640, e);
      ctx.fillRect(0, 360 - e, 640, e);
      ctx.fillRect(0, e, e, 360 - 2 * e);
      ctx.fillRect(640 - e, e, e, 360 - 2 * e);
    }
    ctx.globalAlpha = 1;
  }
}

// A sprite drawn in one flat color (damage blink): draw it to a scratch canvas, then paint over
// its own pixels only.
let scratch: HTMLCanvasElement | null = null;
export function drawTinted(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, color: string, alpha: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (typeof document === "undefined") return;
  scratch ??= document.createElement("canvas");
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  const c = scratch.getContext("2d")!;
  c.clearRect(0, 0, scratch.width, scratch.height);
  c.globalCompositeOperation = "source-over";
  draw(c);
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";
  ctx.globalAlpha = alpha;
  ctx.drawImage(scratch, 0, 0, w, h, Math.round(x), Math.round(y), w, h);
  ctx.globalAlpha = 1;
}

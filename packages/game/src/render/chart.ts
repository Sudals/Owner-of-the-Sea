import { ISLANDS, Kind, MAP_H, MAP_W, mapPoints, seaGrid, SEA_NAME, SEA_ORDER, stormsAt, TILE } from "@sea/shared";
import { COLORS } from "@sea/sprites/palette";
import type { Assets } from "../assets";
import { lutHex } from "../assets";
import { panel, text } from "./ui";

// 해도 (design §3-3): a parchment chart of the whole sea. Only explored tiles are drawn
// (fog of war); islands, fishing points and storms show once their spot has been seen.

/** Fog of war: one bit per tile. */
export class Explored {
  readonly bits: Uint8Array;

  constructor(saved = "") {
    this.bits = new Uint8Array(Math.ceil((MAP_W * MAP_H) / 8));
    if (saved) {
      try {
        const raw = atob(saved);
        for (let i = 0; i < Math.min(raw.length, this.bits.length); i++) this.bits[i] = raw.charCodeAt(i);
      } catch {
        // a corrupt chart just starts blank
      }
    }
  }

  has(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    const i = ty * MAP_W + tx;
    return (this.bits[i >> 3]! & (1 << (i & 7))) !== 0;
  }

  /** Reveal a disc of tiles; returns true if anything new was seen. */
  reveal(cx: number, cy: number, r: number): boolean {
    let changed = false;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || Math.hypot(x - cx, y - cy) > r) continue;
        const i = y * MAP_W + x;
        if (!(this.bits[i >> 3]! & (1 << (i & 7)))) {
          this.bits[i >> 3]! |= 1 << (i & 7);
          changed = true;
        }
      }
    return changed;
  }

  count(): number {
    let n = 0;
    for (const b of this.bits) for (let v = b; v; v &= v - 1) n++;
    return n;
  }

  toString(): string {
    let s = "";
    for (let i = 0; i < this.bits.length; i += 4096) s += String.fromCharCode(...this.bits.subarray(i, i + 4096));
    return btoa(s);
  }
}

const K = 2; // chart px per tile → 448×280
export const CHART_W = MAP_W * K, CHART_H = MAP_H * K;

const hex = (n: keyof typeof COLORS) => COLORS[n];
// parchment inks: water gets darker with depth, land is drawn in brown ink
const WATER = [hex("foam1"), hex("sea3"), hex("sea2"), hex("sea1")];
const PAPER = hex("sand2");

/** Paint the chart (explored part only) into a canvas the size of the map at K px per tile. */
export function renderChart(explored: Explored): HTMLCanvasElement {
  const g = seaGrid();
  const canvas = document.createElement("canvas");
  canvas.width = CHART_W;
  canvas.height = CHART_H;
  const c = canvas.getContext("2d")!;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, CHART_W, CHART_H);
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!explored.has(tx, ty)) continue;
      const i = ty * MAP_W + tx;
      const k = g.kind[i]!;
      c.fillStyle = k === Kind.Water ? WATER[g.sea[i]!]! : k === Kind.Reef ? hex("bark2") : k === Kind.Pier ? hex("bark1") : k === Kind.Sand ? hex("sand1") : hex("wood");
      c.fillRect(tx * K, ty * K, K, K);
    }
  // coastline ink: land next to explored water gets a dark edge
  c.fillStyle = hex("bark1");
  for (let ty = 1; ty < MAP_H - 1; ty++)
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      const i = ty * MAP_W + tx;
      if (g.kind[i] === Kind.Water || !explored.has(tx, ty)) continue;
      if (g.kind[i - 1] === Kind.Water || g.kind[i + 1] === Kind.Water || g.kind[i - MAP_W] === Kind.Water || g.kind[i + MAP_W] === Kind.Water) c.fillRect(tx * K, ty * K, K, K);
    }
  return canvas;
}

export type ChartMarks = { boat: { x: number; y: number }; clockH: number; t: number };

/** Draw the 해도 overlay over the whole view. */
export function drawChart(ctx: CanvasRenderingContext2D, assets: Assets, chart: HTMLCanvasElement, explored: Explored, m: ChartMarks): void {
  const ox = Math.round((640 - CHART_W) / 2), oy = 50;
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = lutHex("ink");
  ctx.fillRect(0, 0, 640, 360);
  ctx.globalAlpha = 1;
  panel(ctx, assets, "panel_paper", ox - 12, oy - 34, CHART_W + 24, CHART_H + 58);
  text(ctx, "해도", 320, oy - 26, { align: "center", color: lutHex("red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });
  const pct = Math.round((explored.count() / (MAP_W * MAP_H)) * 100);
  text(ctx, `탐험 ${pct}%`, ox + CHART_W, oy - 26, { align: "right", color: lutHex("bark2"), shadow: null });
  ctx.drawImage(chart, ox, oy);

  // sea names where they've been seen
  const labelAt: Record<string, [number, number]> = { jade: [34, 108], azure: [92, 132], indigo: [150, 132], ink: [198, 100] };
  for (const sea of SEA_ORDER) {
    const [tx, ty] = labelAt[sea]!;
    if (explored.has(tx, ty)) text(ctx, SEA_NAME[sea], ox + tx * K, oy + ty * K, { align: "center", color: lutHex("deep2"), shadow: null });
  }
  // storms (only over seen water)
  for (const s of stormsAt(m.clockH)) {
    if (!explored.has(Math.round(s.x), Math.round(s.y))) continue;
    ctx.strokeStyle = lutHex("gray1");
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(ox + s.x * K, oy + s.y * K, s.r * K, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "폭풍", ox + s.x * K, oy + s.y * K - 6, { align: "center", color: lutHex("gray1"), shadow: null });
  }
  // fishing points
  for (const p of mapPoints()) {
    if (!explored.has(p.tx, p.ty)) continue;
    const x = ox + p.tx * K, y = oy + p.ty * K;
    ctx.fillStyle = lutHex(p.look === "ruins" ? "violet2" : "red2");
    ctx.fillRect(x - 2, y, 5, 1);
    ctx.fillRect(x, y - 2, 1, 5);
  }
  // islands
  for (const isl of ISLANDS) {
    if (!explored.has(Math.round(isl.cx), Math.round(isl.cy))) continue;
    const x = ox + isl.cx * K, y = oy + (isl.cy - Math.max(isl.r, 3)) * K - 12;
    text(ctx, isl.name, x, y, { align: "center", color: lutHex("bark1"), shadow: null });
    ctx.fillStyle = lutHex("bark1");
    ctx.fillRect(ox + isl.dock[0] * K, oy + isl.dock[1] * K, K, K);
  }
  // the boat, blinking
  if (Math.floor(m.t * 3) % 2 === 0) {
    const bx = ox + (m.boat.x / TILE) * K, by = oy + (m.boat.y / TILE) * K;
    ctx.fillStyle = lutHex("coral");
    ctx.fillRect(Math.round(bx) - 2, Math.round(by) - 2, 5, 5);
    ctx.fillStyle = lutHex("ink");
    ctx.fillRect(Math.round(bx), Math.round(by), 1, 1);
  }
  text(ctx, "M · ESC 닫기", 320, oy + CHART_H + 6, { align: "center", color: lutHex("bark2"), shadow: null });
}

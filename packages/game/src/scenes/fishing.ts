import type { LutName } from "@sea/sprites/palette";
import { lutHex, type BgName } from "../assets";
import type { Engine, Scene } from "../engine";
import { pixelCurve, pixelLine } from "../render/pixels";
import { drawSurface } from "../render/water";
import { Clock } from "../systems/timeOfDay";

// Fishing spot scene — M2 scope (design §13): background + time of day, the angler idling on
// the dock or on the boat, rod and line, live water, ambient fish. The cast → bite → reel
// state machine (M3) plugs into this scene next.

export type SeaId = "jade" | "azure" | "indigo" | "ink";
export type Spot = { kind: "dock" } | { kind: "boat"; sea: SeaId; hullLv: 1 | 2 | 3 | 4 };

const SEA_ORDER: SeaId[] = ["jade", "azure", "indigo", "ink"];
const ROD_LEN = 34;
/** Angler sprites are 32×48; the sole's outline row (47) is where the feet touch the ground. */
const FEET_ROW = 47;
const BOAT_X = 236;
/** Boat sprite row that sits on the waterline (lower hull is under water). */
const BOAT_DRAFT = 24;

// ambient fish per area (by sprite id), roughly matching the sea's depth
const AMBIENT: Record<"dock" | SeaId, string[]> = {
  dock: ["anchovy", "sardine", "gizzard_shad", "goby", "black_seabream", "halfbeak", "rockfish", "pufferfish", "red_seabream"],
  jade: ["anchovy", "sardine", "halfbeak", "mackerel", "horse_mackerel", "black_seabream", "pufferfish", "koi"],
  azure: ["mackerel", "yellowtail", "spanish_mackerel", "conger", "red_seabream", "saury", "sea_bass", "filefish"],
  indigo: ["bluefin_tuna", "skipjack", "cutlassfish", "salmon", "sunfish", "moray", "yellowtail"],
  ink: ["anglerfish", "lantern_angler", "ghost_cutlass", "pike_conger", "dark_rockfish", "cutlassfish"],
};

type Ambient = { id: string; x: number; y: number; vx: number; phase: number; w: number };

export class FishingScene implements Scene {
  readonly clock = new Clock(9);
  private fish: Ambient[] = [];
  private t = 0;
  private engine!: Engine;

  constructor(public spot: Spot = { kind: "dock" }) {}

  enter(engine: Engine): void {
    this.engine = engine;
    this.spawnFish();
  }

  private get waterline(): number {
    return this.engine.assets.meta.waterline;
  }

  private get bgName(): BgName {
    return this.spot.kind === "dock" ? "bg_dock" : (`bg_sea_${this.spot.sea}` as BgName);
  }

  /** Lowest y a fish may swim at, at column x. */
  private floor(x: number): number {
    const m = this.engine.assets.meta;
    if (this.spot.kind !== "dock") return 344;
    const d = m.dock;
    if (x < d.bedFrom) return m.waterline;
    return Math.min(d.bedY, m.waterline + ((x - d.bedFrom) / (d.bedTo - d.bedFrom)) * (d.bedY - m.waterline)) - 6;
  }

  private spawnFish(): void {
    const ids = AMBIENT[this.spot.kind === "dock" ? "dock" : this.spot.sea].filter((id) => this.engine.assets.has("fish", id));
    this.fish = [];
    for (let i = 0; i < 8; i++) {
      const id = ids[i % ids.length]!;
      const w = this.engine.assets.frame("fish", id).w;
      const x = (this.spot.kind === "dock" ? 300 : 0) + Math.random() * (this.spot.kind === "dock" ? 330 : 640);
      const top = this.waterline + 18, bottom = this.floor(x) - 10;
      this.fish.push({ id, x, y: top + Math.random() * Math.max(10, bottom - top), vx: (6 + Math.random() * 14) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6, w });
    }
  }

  update(dt: number, engine: Engine): void {
    this.t += dt;
    this.clock.update(dt);
    const input = engine.input;
    if (engine.dev) {
      if (input.hit("KeyT")) this.clock.advance(input.hit("KeyT"));
      if (input.hit("KeyB") % 2 === 1) {
        this.spot = this.spot.kind === "dock" ? { kind: "boat", sea: "jade", hullLv: 1 } : { kind: "dock" };
        this.spawnFish();
      }
      if (input.hit("KeyN") && this.spot.kind === "boat") {
        const next = SEA_ORDER[(SEA_ORDER.indexOf(this.spot.sea) + input.hit("KeyN")) % SEA_ORDER.length]!;
        this.spot = { ...this.spot, sea: next, hullLv: (SEA_ORDER.indexOf(next) + 1) as 1 | 2 | 3 | 4 };
        this.spawnFish();
      }
    }
    const minX = this.spot.kind === "dock" ? this.engine.assets.meta.dock.bedFrom + 40 : -40;
    for (const f of this.fish) {
      f.x += f.vx * dt;
      // turn around at the edges and at the sloping seabed
      if ((f.vx < 0 && f.x < minX) || (f.vx > 0 && f.x > 640) || f.y > this.floor(f.x + (f.vx > 0 ? f.w : 0))) {
        f.vx = -f.vx;
        f.x += f.vx * dt * 2;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const { a, b, t } = this.clock.blend();
    const lut = this.clock.lut();
    const wl = this.waterline;

    // background, crossfading between time-of-day palettes
    ctx.globalAlpha = 1;
    ctx.drawImage(assets.background(this.bgName, a), 0, 0);
    if (t > 0) {
      ctx.globalAlpha = t;
      ctx.drawImage(assets.background(this.bgName, b), 0, 0);
      ctx.globalAlpha = 1;
    }

    // sun / moon, hidden below the horizon
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 640, assets.meta.horizon);
    ctx.clip();
    const sun = this.clock.sun(), moon = this.clock.moon();
    if (sun) assets.draw(ctx, "sky", "sun", sun.x - 16, sun.y - 16, { lut: lut === "night" ? "day" : lut });
    if (moon) assets.draw(ctx, "sky", "moon", moon.x - 12, moon.y - 12);
    ctx.restore();

    // ambient fish under the surface
    for (const f of this.fish) {
      const y = f.y + Math.round(Math.sin(this.t * 1.5 + f.phase) * 2);
      assets.draw(ctx, "fish", f.id, f.x, y, { flipX: f.vx < 0, lut });
    }

    // boat + angler
    let feet: [number, number];
    if (this.spot.kind === "boat") {
      const bob = Math.round(Math.sin(this.t * 1.3) * 1.2);
      const boatName = `boat_lv${this.spot.hullLv}`;
      const fr = assets.frame("boat", boatName);
      const by = wl - BOAT_DRAFT + bob;
      assets.draw(ctx, "boat", boatName, BOAT_X, by, { lut });
      const stand = fr.anchor?.stand ?? [44, 18];
      feet = [BOAT_X + stand[0], by + stand[1]];
    } else {
      feet = assets.meta.dock.stand;
    }
    this.drawAngler(ctx, feet, lut);

    // live water surface on top (from the shoreline outward on the dock)
    drawSurface(ctx, this.t, wl, this.spot.kind === "dock" ? assets.meta.dock.shoreX - 30 : 0, lut);

    if (engine.dev) this.drawDevOverlay(ctx, engine, lut);
  }

  private drawAngler(ctx: CanvasRenderingContext2D, feet: [number, number], lut: LutName): void {
    const assets = this.engine.assets;
    const frameName = `idle_${Math.floor(this.t * 1.6) % 2}`;
    const fr = assets.frame("angler", frameName);
    const x = feet[0] - 16, y = feet[1] - FEET_ROW;
    assets.draw(ctx, "angler", frameName, x, y, { lut });

    // rod from the hand anchor at the frame's rod angle; dark butt, lighter blank, red tip
    const hand = fr.anchor?.hand ?? [24, 30];
    const angle = ((fr.anchor?.rod?.[0] ?? -50) * Math.PI) / 180;
    const hx = x + hand[0], hy = y + hand[1];
    const tipX = hx + Math.cos(angle) * ROD_LEN, tipY = hy + Math.sin(angle) * ROD_LEN;
    const butt = lutHex("bark1", lut), blank = lutHex("wood", lut), tip = lutHex("coral", lut);
    pixelLine(ctx, hx - Math.cos(angle) * 3, hy - Math.sin(angle) * 3, tipX, tipY, (i, n) => (i < 7 ? butt : i >= n - 1 ? tip : blank));

    // idle: a short line with the hook swinging gently under the rod tip
    const sway = Math.sin(this.t * 1.8) * 1.5;
    const hookX = tipX + sway, hookY = tipY + 16;
    pixelCurve(ctx, tipX, tipY, tipX + sway * 0.5, tipY + 8, hookX, hookY, lutHex("foam1", lut));
    assets.draw(ctx, "props", "hook", hookX - 3, hookY, { lut });
  }

  private drawDevOverlay(ctx: CanvasRenderingContext2D, engine: Engine, lut: LutName): void {
    const text = `${this.clock.label()} ${lut} · ${this.spot.kind === "dock" ? "선착장" : `배 위 (${this.spot.sea})`} · ${engine.fps}fps  [T]+1h [B]장소 [N]바다`;
    ctx.font = "12px Galmuri11, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#0d0f1c";
    ctx.fillText(text, 5, 5);
    ctx.fillStyle = "#eff4f8";
    ctx.fillText(text, 4, 4);
  }
}


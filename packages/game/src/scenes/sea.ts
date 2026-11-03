import {
  DOCK_RADIUS, dockNear, FUEL, freshnessPct, fuelMax, holdCap, HULLS, IMPACT, impactDamage, isOpen, ISLANDS, Kind, stormDamagePerSec, towLossRate, MAP_H, MAP_W, mapPoints, nearestIsland, pointNear, POINT_BY_ID, POINT_RADIUS,
  seaBlock, seaGrid, SEA_NAME, stormIntensity, stormsAt, TILE, tileAt, type Island, type MapPoint,
} from "@sea/shared";
import type { LutName } from "@sea/sprites/palette";
import { lutHex } from "../assets";
import type { Engine, Scene } from "../engine";
import type { Game } from "../game";
import { drawChart, Explored, renderChart } from "../render/chart";
import { pixelLine } from "../render/pixels";
import { isBaked, SeaView, WORLD_H, WORLD_W } from "../render/seaView";
import { button, dim, gaugeH, inRect, panel, text, textWidth } from "../render/ui";

// 탑다운 바다 (design §3-3): steer the boat across one continuous sea.
//   · arrows/WASD/stick steer with a little inertia; click/touch sails straight to a spot
//     and stops at anything in the way
//   · Space/Enter/A near a dock ties up (→ island), near a fishing point stops and fishes
//   · seas the hull can't take push the boat back; reefs and shores cost hull HP
//   · fuel burns with distance — empty, you row at 30%; storms drift and shove the boat
//   · M opens the 해도 (fog of war), ESC the menu

const VIEW_W = 640, VIEW_H = 360;
const TURN_RATE = 2.8; // rad/s
const STOP_SPEED = 9; // px/s: "stopped" for fishing / docking
const BRAKE = 70; // px/s² when stopping on purpose
const REVEAL_R = 10; // tiles of chart revealed around the boat
const SAVE_EVERY = 5; // s (local journal; the server sees it on the next save)

type Prompt = { kind: "fish"; point: MapPoint } | { kind: "dock"; island: Island };
type Wake = { x: number; y: number; vx: number; vy: number; t: number; life: number };

const HUD_CHART = { x: 498, y: 8, w: 64, h: 18 };
const HUD_MENU = { x: 568, y: 8, w: 64, h: 18 };
const PROMPT_BTN = { x: 320 - 120, y: 318, w: 240, h: 20 };

export class SeaScene implements Scene {
  state: { k: "loading"; frames: number } | { k: "sail" } | { k: "towed"; t: number; island: Island; lost: number } = { k: "loading", frames: 0 };
  /** Boat in world px; heading in radians (0 = east, y down). */
  boat = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0 };
  /** Click-to-sail destination, world px. */
  target: { x: number; y: number } | null = null;
  /** Action waiting for the boat to stop (fish / dock). */
  pending: Prompt | null = null;
  /** Hard stop after the autopilot saw something in the way. */
  braking = false;
  prompt: Prompt | null = null;
  chartOpen = false;
  pause: { sel: number } | null = null;
  storm = 0;

  private view: SeaView | null = null;
  private explored: Explored;
  private chart: HTMLCanvasElement | null = null;
  private chartDirty = true;
  private t = 0;
  private saveT = 0;
  private revealT = 0;
  private hitCooldown = 0;
  /** Storm damage below one whole HP, carried over. */
  private stormWear = 0;
  private wake: Wake[] = [];
  private wakeT = 0;
  private toast: { text: string; until: number; color?: string } | null = null;
  private blockToastAt = -99;
  private engine!: Engine;

  constructor(private readonly game: Game) {
    const at = game.world.at;
    if (at.kind === "sea") this.boat = { x: at.x, y: at.y, vx: 0, vy: 0, heading: at.heading, speed: 0 };
    this.explored = new Explored(game.world.chart);
  }

  enter(engine: Engine): void {
    this.engine = engine;
  }

  exit(): void {
    this.persist();
  }

  private get gear() {
    const w = this.game.world;
    return { hullLv: w.hullLv, lantern: w.lantern, tankLv: w.tankLv };
  }

  private persist(): void {
    const w = this.game.world;
    w.at = { kind: "sea", x: Math.round(this.boat.x * 10) / 10, y: Math.round(this.boat.y * 10) / 10, heading: Math.round(this.boat.heading * 1000) / 1000 };
    w.chart = this.explored.toString();
    this.game.save();
  }

  private say(s: string, seconds = 2.4, color?: string): void {
    this.toast = { text: s, until: this.t + seconds, color };
  }

  // ── update ─────────────────────────────────────────────────────────────────

  update(dt: number, engine: Engine): void {
    this.t += dt;
    const s = this.state;
    if (s.k === "loading") {
      // let one frame show the loading text, then bake (~0.5 s, once per page load)
      if (++s.frames >= 2 || isBaked()) {
        this.view = new SeaView();
        this.explored.reveal(this.boat.x / TILE, this.boat.y / TILE, REVEAL_R);
        this.state = { k: "sail" };
      }
      return;
    }
    if (s.k === "towed") {
      s.t += dt;
      if (s.t > 2.6) {
        // Economy.md §4-6: full repair + 50% towing fee at that island, down to 0G (no debt)
        const r = this.game.backend.trade({ kind: "tow", island: s.island.id, t: Date.now() });
        this.game.toIsland(s.island.id, { towed: true, lost: s.lost, fee: r.ok ? -r.gold : 0, arrived: true });
      }
      return;
    }

    const input = engine.input;
    if (engine.dev) this.devKeys(engine);

    // overlays first: they swallow input and stop the world
    if (this.chartOpen) {
      if (input.hit("KeyM") || input.hit("Escape") || input.clicked || input.pressed) this.chartOpen = false;
      return;
    }
    if (this.pause) return this.updatePause(engine);
    if (input.hit("Escape")) return void (this.pause = { sel: 0 });
    if (input.hit("KeyM")) return this.openChart();

    this.game.tick(dt, true);
    if (this.toast && this.t > this.toast.until) this.toast = null;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    // ── where are we, what's near ──
    const tile = tileAt(Math.floor(this.boat.x / TILE), Math.floor(this.boat.y / TILE));
    this.storm = stormIntensity(this.boat.x / TILE, this.boat.y / TILE, this.game.clockH);
    const dock = dockNear(this.boat.x, this.boat.y);
    const point = dock ? null : pointNear(this.boat.x, this.boat.y);
    this.prompt = dock ? { kind: "dock", island: dock } : point ? { kind: "fish", point } : null;

    // ── clicks: HUD buttons, the prompt, else sail there ──
    if (input.clicked) {
      const c = input.clicked;
      if (inRect(c, HUD_CHART)) return this.openChart();
      if (inRect(c, HUD_MENU)) return void (this.pause = { sel: 0 });
      if (this.prompt && inRect(c, PROMPT_BTN)) this.pending = this.prompt;
      else {
        const cam = this.camera();
        this.target = { x: cam.x + c.x, y: cam.y + c.y };
        this.pending = null;
        this.braking = false;
      }
    } else if (input.pressed && this.prompt) this.pending = this.prompt;
    if (this.pending && (!this.prompt || this.prompt.kind !== this.pending.kind)) this.pending = null;

    // ── steering ──
    const w = this.game.world;
    const spec = HULLS[w.hullLv];
    let want = input.axis();
    if (Math.hypot(want.x, want.y) > 0.1) {
      this.target = null;
      this.pending = null;
      this.braking = false;
    }
    // autopilot: head for the spot, and ease off so the boat can stop right on it
    let speedCap = Infinity;
    if (this.target && !(Math.hypot(want.x, want.y) > 0.1)) {
      const dx = this.target.x - this.boat.x, dy = this.target.y - this.boat.y, d = Math.hypot(dx, dy);
      if (d < 6) {
        this.target = null;
        this.braking = true;
      } else {
        want = { x: dx / d, y: dy / d };
        speedCap = Math.max(10, Math.sqrt(2 * BRAKE * 0.8 * d));
      }
    }
    // Sailing to a clicked spot stops *before* anything in the way (design §3-3): look ahead
    // one stopping distance along the course and brake if the way is shut.
    if (this.target) {
      const b = this.boat, v = Math.hypot(b.vx, b.vy);
      if (v > 12) {
        const look = (v * v) / (2 * BRAKE) + 10;
        // along the drift and along the bow (a turning boat swings toward where it points)
        const rays = [[b.vx / v, b.vy / v], [Math.cos(b.heading), Math.sin(b.heading)]] as const;
        scan: for (let d = 6; d <= look; d += 5) for (const [ux, uy] of rays) {
          const hit = this.blocked(b.x + ux * d, b.y + uy * d, spec.radius);
          if (!hit) continue;
          this.target = null;
          this.braking = true;
          want = { x: 0, y: 0 };
          const t = tileAt(Math.floor((b.x + ux * d) / TILE), Math.floor((b.y + uy * d) / TILE));
          if (hit === "sea" && t) this.say(`이 배로는 버티지 못할 것 같다 — ${seaBlock(t.sea, this.gear)}`, 3, lutHex("yellow"));
          else this.say("앞이 막혀 멈췄다", 1.4);
          break scan;
        }
      }
    }
    if (this.pending || this.braking) want = { x: 0, y: 0 };
    const rowing = w.fuel <= 0;
    const top = spec.speed * (rowing ? FUEL.rowFactor : 1) * (1 - this.storm * 0.2);
    const b = this.boat;
    const mag = Math.hypot(want.x, want.y);
    if (mag > 0.05) {
      const desired = Math.atan2(want.y, want.x);
      const diff = wrapAngle(desired - b.heading);
      b.heading = wrapAngle(b.heading + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff)));
      const throttle = mag * Math.max(0.3, Math.cos(Math.min(Math.abs(diff), Math.PI / 2)));
      const goal = Math.min(top * throttle, speedCap);
      if (b.speed > goal && speedCap < Infinity) b.speed = Math.max(goal, b.speed - BRAKE * dt);
      else b.speed += (goal - b.speed) * Math.min(1, 1.5 * dt);
      this.braking = false;
    } else {
      b.speed = Math.max(0, b.speed - (this.pending || this.braking ? BRAKE : 24) * dt);
      if (this.braking && Math.hypot(b.vx, b.vy) < 2) this.braking = false;
    }
    // the hull lags behind the heading a little (drift), storms shove it
    const k = 1 - Math.exp(-3 * dt);
    b.vx += (Math.cos(b.heading) * b.speed - b.vx) * k;
    b.vy += (Math.sin(b.heading) * b.speed - b.vy) * k;
    if (this.storm > 0) {
      const wind = this.game.clockH * 1.7 + Math.sin(this.t * 0.6) * 0.8;
      b.vx += Math.cos(wind) * this.storm * 34 * dt;
      b.vy += Math.sin(wind) * this.storm * 34 * dt;
    }

    // ── move with collisions ──
    const moved = this.move(dt, spec.radius);
    if (!rowing && moved > 0) w.fuel = Math.max(0, w.fuel - (moved / TILE) * FUEL.perTile);
    if (!rowing && w.fuel <= 0) this.say("연료가 떨어졌다. 노를 젓는다…", 3);

    // ── wake ──
    this.wakeT += dt;
    const v = Math.hypot(b.vx, b.vy);
    if (v > 14 && this.wakeT > 0.05) {
      this.wakeT = 0;
      const back = HULLS[w.hullLv].radius + 4;
      const sx = b.x - Math.cos(b.heading) * back, sy = b.y - Math.sin(b.heading) * back;
      for (const side of [-1, 1]) {
        const nx = -Math.sin(b.heading) * side, ny = Math.cos(b.heading) * side;
        this.wake.push({ x: sx + nx * 2, y: sy + ny * 2, vx: nx * 9 - b.vx * 0.1, vy: ny * 9 - b.vy * 0.1, t: 0, life: 1.1 + Math.random() * 0.4 });
      }
    }
    for (const p of this.wake) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.wake = this.wake.filter((p) => p.t < p.life);

    // ── stopped with an action waiting ──
    if (this.pending && Math.hypot(b.vx, b.vy) < STOP_SPEED) {
      const p = this.pending;
      this.pending = null;
      b.vx = b.vy = b.speed = 0;
      if (p.kind === "dock") return this.game.toIsland(p.island.id, { arrived: true });
      const pool = POINT_BY_ID[p.point.pointId]!;
      return this.game.toFishing({
        kind: "boat",
        sea: pool.sea,
        hullLv: w.hullLv,
        pointId: pool.id,
        mapPointId: p.point.id,
        deep: tile?.deep ?? false,
        storm: this.storm > 0.2,
      });
    }

    // ── storms wear the hull down (Economy.md §4-6: ~3% of max HP a minute at the eye) ──
    if (this.storm > 0.2) {
      this.stormWear += stormDamagePerSec(w.hullLv, this.storm) * dt;
      if (this.stormWear >= 1) {
        const n = Math.floor(this.stormWear);
        this.stormWear -= n;
        w.hullHp = Math.max(0, w.hullHp - n);
      }
    }

    // ── chart, hull, autosave ──
    this.revealT += dt;
    if (this.revealT > 0.25) {
      this.revealT = 0;
      if (this.explored.reveal(b.x / TILE, b.y / TILE, REVEAL_R)) this.chartDirty = true;
    }
    if (w.hullHp <= 0) return this.towed();
    this.saveT += dt;
    if (this.saveT > SAVE_EVERY) {
      this.saveT = 0;
      this.persist();
    }
  }

  /** Move by velocity, sliding along walls. Returns the distance actually moved (px). */
  private move(dt: number, r: number): number {
    const b = this.boat;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    const hit = this.blocked(nx, ny, r);
    if (!hit) {
      const d = Math.hypot(nx - b.x, ny - b.y);
      b.x = nx;
      b.y = ny;
      return d;
    }
    const impact = Math.hypot(b.vx, b.vy);
    if (hit === "sea") {
      // high waves at a sea the hull can't take: shoved back, no damage
      b.vx *= -0.6;
      b.vy *= -0.6;
      b.speed *= 0.3;
      this.target = null;
      const t = tileAt(Math.floor(nx / TILE), Math.floor(ny / TILE));
      if (t && this.t - this.blockToastAt > 2.5) {
        this.blockToastAt = this.t;
        this.say(`이 배로는 버티지 못할 것 같다 — ${seaBlock(t.sea, this.gear)}`, 3, lutHex("yellow"));
      }
      return 0;
    }
    // shore / reef: slide along it if we can; a hard hit costs a share of max HP (Economy.md §4-6)
    if (impact > IMPACT.minSpeed && this.hitCooldown <= 0) {
      const dmg = impactDamage(this.game.world.hullLv, impact, hit === "reef");
      if (dmg > 0) {
        this.game.world.hullHp = Math.max(0, this.game.world.hullHp - dmg);
        this.hitCooldown = 0.6;
        this.say(hit === "reef" ? `암초에 긁혔다! 선체 -${dmg}` : `부딪혔다! 선체 -${dmg}`, 1.8, lutHex("coral"));
      }
    }
    if (this.target) {
      this.target = null;
      if (impact < IMPACT.minSpeed + 10) this.say("앞이 막혀 멈췄다", 1.4);
    }
    let d = 0;
    if (!this.blocked(nx, b.y, r)) {
      d = Math.abs(nx - b.x);
      b.x = nx;
      b.vy *= -0.2;
    } else if (!this.blocked(b.x, ny, r)) {
      d = Math.abs(ny - b.y);
      b.y = ny;
      b.vx *= -0.2;
    } else {
      b.vx *= -0.25;
      b.vy *= -0.25;
    }
    b.speed *= 0.35;
    return d;
  }

  /** What stops a boat of radius r centred at (x, y): "reef" / "shore" / "sea" (forbidden sea) / null.
   *  Exact circle-vs-tile test, so a tile corner can never slip in between sample points and
   *  wedge the boat. */
  private blocked(x: number, y: number, r: number): "reef" | "shore" | "sea" | null {
    if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return "shore";
    let reef = false, shore = false;
    const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE);
    const ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = tileAt(tx, ty);
        if (t && t.kind === Kind.Water) continue;
        const nx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE)), ny = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        if ((x - nx) ** 2 + (y - ny) ** 2 >= r * r) continue;
        if (t?.kind === Kind.Reef) reef = true;
        else shore = true;
      }
    if (reef) return "reef";
    if (shore) return "shore";
    const c = tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
    if (c && seaBlock(c.sea, this.gear)) return "sea";
    return null;
  }

  /** Hull at 0: towed to the nearest open village, losing part of the hold (Economy.md §4-6).
   *  The fee is paid there on arrival (the tow trade). */
  private towed(): void {
    const hold = this.game.backend.hold();
    const lose = Math.floor(hold.length * towLossRate());
    const idx = hold.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, lose);
    if (lose) this.game.backend.dropHold(idx);
    const island = nearestIsland(this.boat.x, this.boat.y, isOpen);
    this.boat.vx = this.boat.vy = this.boat.speed = 0;
    this.state = { k: "towed", t: 0, island, lost: lose };
  }

  private openChart(): void {
    this.chartOpen = true;
    if (this.chartDirty || !this.chart) {
      this.chart = renderChart(this.explored);
      this.chartDirty = false;
    }
  }

  private pauseItems() {
    const x = 320 - 70, w = 140;
    return [
      { id: "resume", label: "계속하기", rect: { x, y: 150, w, h: 20 } },
      { id: "chart", label: "해도 보기", rect: { x, y: 176, w, h: 20 } },
      { id: "save", label: "저장", rect: { x, y: 202, w, h: 20 } },
      { id: "title", label: "로비로 나가기", rect: { x, y: 228, w, h: 20 } },
    ];
  }

  private updatePause(engine: Engine): void {
    const input = engine.input;
    const items = this.pauseItems();
    if (input.hit("Escape")) return void (this.pause = null);
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d && this.pause) this.pause.sel = (this.pause.sel + d + items.length * 4) % items.length;
    const hover = items.findIndex((it) => inRect(input.clicked, it.rect));
    const go = input.clicked ? hover : input.pressed ? this.pause!.sel : -1;
    const id = items[go]?.id;
    if (id === "resume") this.pause = null;
    else if (id === "chart") {
      this.pause = null;
      this.openChart();
    } else if (id === "save") {
      this.pause = null;
      this.persist();
      void this.game.manualSave();
    } else if (id === "title") {
      this.pause = null;
      this.persist();
      this.game.leave("lobby");
    }
  }

  private devKeys(engine: Engine): void {
    const input = engine.input;
    const w = this.game.world;
    for (let i = 0; i < input.hit("KeyH"); i++) {
      w.hullLv = ((w.hullLv % 4) + 1) as 1 | 2 | 3 | 4;
      w.tankLv = w.hullLv >= 3 ? 2 : 1;
      w.lantern = w.hullLv >= 4;
      w.hullHp = HULLS[w.hullLv].hp;
      w.fuel = fuelMax(w);
      this.say(`[dev] 선체 Lv${w.hullLv}${w.tankLv >= 2 ? " · 연료통 Lv2" : ""}${w.lantern ? " · 등불" : ""}`);
    }
    if (input.hit("KeyF")) w.fuel = fuelMax(w);
    if (input.hit("KeyT")) this.game.clock.advance(input.hit("KeyT"));
  }

  /** World px of the view's top-left, following the boat. */
  private camera(): { x: number; y: number } {
    return {
      x: Math.round(Math.max(0, Math.min(WORLD_W - VIEW_W, this.boat.x - VIEW_W / 2))),
      y: Math.round(Math.max(0, Math.min(WORLD_H - VIEW_H, this.boat.y - VIEW_H / 2))),
    };
  }

  // ── render ─────────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    if (this.state.k === "loading" || !this.view) {
      ctx.fillStyle = lutHex("navy");
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      text(ctx, "바다 지도를 펼치는 중…", 320, 172, { align: "center", color: lutHex("foam2") });
      return;
    }
    // Seen from above, the sea keeps its day colors (a full LUT swap turns the sunset sea into
    // sand); time of day is a light multiply tint laid over the world instead.
    const lut: LutName = "day";
    const cam = this.camera();
    this.view.draw(ctx, cam.x, cam.y, VIEW_W, VIEW_H, lut);
    this.drawSparkles(ctx, cam, lut);
    this.drawPoints(ctx, cam, lut);
    // wake under the boat
    for (const p of this.wake) {
      const k = p.t / p.life;
      ctx.fillStyle = lutHex(k < 0.4 ? "white" : k < 0.75 ? "foam2" : "foam1", lut);
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), 1, 1);
    }
    if (this.target) {
      const tx = Math.round(this.target.x - cam.x), ty = Math.round(this.target.y - cam.y);
      if (Math.floor(this.t * 4) % 2 === 0) {
        ctx.fillStyle = lutHex("yellow", lut);
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(tx + i, ty + i, 1, 1);
          ctx.fillRect(tx + i, ty - i, 1, 1);
        }
      }
    }
    this.drawBoat(ctx, cam, lut);
    this.drawStorms(ctx, cam);
    this.drawTint(ctx);
    this.drawLabels(ctx, cam); // after the tint: names stay readable at night
    this.drawDocks(ctx, cam);
    this.drawHud(ctx, engine, lut);

    if (this.state.k === "towed") {
      dim(ctx, Math.min(0.85, this.state.t / 1.2));
      text(ctx, "선체가 버티지 못했다…", 320, 160, { align: "center", color: lutHex("coral") });
      text(ctx, `${this.state.island.name}(으)로 끌려간다`, 320, 180, { align: "center" });
    }
    if (this.pause) {
      dim(ctx, 0.5);
      panel(ctx, assets, "panel_wood", 320 - 90, 114, 180, 148);
      text(ctx, "일시정지", 320, 126, { align: "center", color: lutHex("bark1"), shadow: null, font: "bold 12px Galmuri11, monospace" });
      this.pauseItems().forEach((it, i) => button(ctx, assets, i === this.pause!.sel ? "hover" : "normal", it.label, it.rect.x, it.rect.y, it.rect.w, it.rect.h));
    }
    if (this.chartOpen && this.chart) drawChart(ctx, assets, this.chart, this.explored, { boat: this.boat, clockH: this.game.clockH, t: this.t });
    this.game.drawFlash(ctx, assets);
  }

  /** Little glints drifting on open water tiles (the baked map is still; this makes it move). */
  private drawSparkles(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }, lut: LutName): void {
    const g = seaGrid();
    const tx0 = Math.floor(cam.x / TILE), ty0 = Math.floor(cam.y / TILE);
    ctx.fillStyle = lutHex("foam2", lut);
    for (let ty = ty0; ty <= ty0 + VIEW_H / TILE + 1; ty++)
      for (let tx = tx0; tx <= tx0 + VIEW_W / TILE + 1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (g.kind[ty * MAP_W + tx] !== Kind.Water) continue;
        const h = hash2(tx, ty);
        const phase = (this.t * 0.55 + h * 7) % 3;
        if (phase > 0.5) continue;
        const len = phase < 0.25 ? 2 : 1;
        ctx.fillRect(tx * TILE + Math.floor(hash2(ty, tx) * 12) - cam.x + Math.floor(phase * 4), ty * TILE + Math.floor(h * 13) - cam.y, len, 1);
      }
  }

  private drawPoints(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }, lut: LutName): void {
    const near = this.prompt?.kind === "fish" ? this.prompt.point.id : null;
    for (const p of mapPoints()) {
      const cx = Math.round((p.tx + 0.5) * TILE - cam.x), cy = Math.round((p.ty + 0.5) * TILE - cam.y);
      if (cx < -40 || cy < -40 || cx > VIEW_W + 40 || cy > VIEW_H + 40) continue;
      const t = this.t + p.tx * 0.37;
      if (p.id === near) {
        // the range you can fish from (yellow reads on light jade and on dark ink alike)
        ctx.fillStyle = lutHex("yellow", lut);
        const R = POINT_RADIUS * TILE;
        for (let k = 0; k < 40; k++) {
          if ((k + Math.floor(this.t * 6)) % 3 === 0) continue;
          const a = (k / 40) * Math.PI * 2;
          ctx.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R), 1, 1);
        }
      }
      switch (p.look) {
        case "boil":
        case "ruins": {
          // ripples spreading from the school: dark rings read on every sea color
          for (let k = 0; k < 2; k++) {
            const rr = ((t * 7 + k * 9) % 18) + 2;
            ctx.fillStyle = lutHex(p.look === "ruins" ? "violet2" : "deep1", lut);
            ctx.globalAlpha = Math.max(0, 1 - rr / 20);
            for (let q = 0; q < 24; q++) {
              const a = (q / 24) * Math.PI * 2;
              ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.6), 1, 1);
            }
            ctx.globalAlpha = 1;
          }
          // the surface boils over a school (ruins glint yellow)
          for (let i = 0; i < 12; i++) {
            const a = i * 0.52 + t * 0.7;
            const r = 3 + ((t * 9 + i * 5) % 11);
            if ((t * 3 + i) % 2 > 1.2) continue;
            ctx.fillStyle = lutHex(p.look === "ruins" && i % 3 === 0 ? "yellow" : i % 2 ? "white" : "foam1", lut);
            ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.6), i % 4 === 0 ? 2 : 1, 1);
          }
          // a fish jumps now and then
          const j = (t * 0.5) % 3;
          if (j < 0.5) {
            const jx = cx - 6 + j * 24, jy = cy - Math.sin((j / 0.5) * Math.PI) * 6;
            ctx.fillStyle = lutHex("gray2", lut);
            ctx.fillRect(Math.round(jx), Math.round(jy), 3, 1);
          }
          break;
        }
        case "birds": {
          for (let i = 0; i < 4; i++) {
            const a = t * 0.9 + i * 1.57;
            const bx = Math.round(cx + Math.cos(a) * 13), by = Math.round(cy - 6 + Math.sin(a) * 7);
            ctx.fillStyle = lutHex("deep1", lut);
            ctx.fillRect(bx - 1, by + 12, 3, 1); // shadow on the water
            const flap = Math.floor(t * 6 + i) % 2;
            ctx.fillStyle = lutHex("white", lut);
            ctx.fillRect(bx - 2, by - flap, 2, 1);
            ctx.fillRect(bx + 1, by - flap, 2, 1);
            ctx.fillRect(bx, by, 1, 1);
          }
          break;
        }
        case "buoy": {
          const bob = Math.round(Math.sin(t * 2.2));
          ctx.fillStyle = lutHex("ink", lut);
          ctx.fillRect(cx - 3, cy - 4 + bob, 7, 8);
          ctx.fillStyle = lutHex("red2", lut);
          ctx.fillRect(cx - 2, cy - 3 + bob, 5, 6);
          ctx.fillStyle = lutHex("white", lut);
          ctx.fillRect(cx - 2, cy - 1 + bob, 5, 2);
          ctx.fillStyle = lutHex("foam2", lut);
          ctx.fillRect(cx - 4, cy + 4 + bob, 9, 1);
          break;
        }
      }
    }
  }

  /** Every island's dock: an anchor and the ring you must be inside to tie up, plus an arrow to
   *  the dock when you're near the island but on the wrong side of it. */
  private drawDocks(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    const bx = this.boat.x, by = this.boat.y;
    let nearest: { isl: (typeof ISLANDS)[number]; d: number } | null = null;
    for (const isl of ISLANDS) {
      const dxp = (isl.dock[0] + 0.5) * TILE, dyp = (isl.dock[1] + 0.5) * TILE;
      const dIsl = Math.hypot(bx / TILE - isl.cx, by / TILE - isl.cy);
      if (dIsl > 20) continue;
      const cx = Math.round(dxp - cam.x), cy = Math.round(dyp - cam.y);
      const inside = Math.hypot(bx - dxp, by - dyp) <= DOCK_RADIUS * TILE;
      if (!nearest || dIsl < nearest.d) nearest = { isl, d: dIsl };
      // dashed ring with a dark edge, so it reads on pale jade and on dark ink alike (yellow inside)
      const R = DOCK_RADIUS * TILE;
      const n = 40;
      for (const [col, off] of [[lutHex("ink"), 1], [inside ? lutHex("yellow") : lutHex("white"), 0]] as const) {
        ctx.fillStyle = col;
        for (let k = 0; k < n; k++) {
          if ((k + Math.floor(this.t * 3)) % 3 === 2) continue;
          const a = (k / n) * Math.PI * 2;
          ctx.fillRect(Math.round(cx + Math.cos(a) * R) - 1 + off, Math.round(cy + Math.sin(a) * R) - 1 + off, 2, 2);
        }
      }
      drawAnchor(ctx, cx, cy - 1 + Math.round(Math.sin(this.t * 2) * 1), inside ? lutHex("yellow") : lutHex("white"));
    }
    // near an island but outside its dock ring: point the way
    if (nearest && nearest.d < 14 && this.prompt?.kind !== "dock" && this.state.k === "sail") {
      const isl = nearest.isl;
      const dxp = (isl.dock[0] + 0.5) * TILE - bx, dyp = (isl.dock[1] + 0.5) * TILE - by;
      const len = Math.hypot(dxp, dyp);
      if (len > DOCK_RADIUS * TILE) {
        const ux = dxp / len, uy = dyp / len;
        // a bold arrow just off the bow side of the boat, pointing at the dock
        const ax = bx - cam.x + ux * 24, ay = by - cam.y + uy * 24;
        for (const [col, off] of [[lutHex("ink"), 1], [lutHex("yellow"), 0]] as const) {
          ctx.fillStyle = col;
          for (let s = 0; s < 10; s++) ctx.fillRect(Math.round(ax + ux * s) - 1 + off, Math.round(ay + uy * s) - 1 + off, 2, 2);
          for (const side of [-1, 1]) for (let s = 1; s <= 4; s++) ctx.fillRect(Math.round(ax + ux * (9 - s) - uy * s * side) - 1 + off, Math.round(ay + uy * (9 - s) + ux * s * side) - 1 + off, 2, 2);
        }
        if (!this.prompt) text(ctx, `${isl.name} 부두(닻 표시)로 가면 접안할 수 있어요`, 320, 306, { align: "center", color: lutHex("yellow") });
      }
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    for (const isl of ISLANDS) {
      const d = Math.hypot(this.boat.x / TILE - isl.cx, this.boat.y / TILE - isl.cy);
      if (d > 16) continue;
      const x = isl.cx * TILE - cam.x, y = (isl.cy - Math.max(isl.r, 3) - 1.2) * TILE - cam.y;
      text(ctx, isl.name, x, y, { align: "center", color: lutHex("white") });
    }
  }

  private drawBoat(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }, lut: LutName): void {
    const w = this.game.world;
    const dir = ((Math.round(this.boat.heading / ((Math.PI * 2) / 16)) % 16) + 16) % 16;
    const bx = Math.round(this.boat.x - cam.x), by = Math.round(this.boat.y - cam.y);
    // oars when rowing
    if (w.fuel <= 0 && Math.hypot(this.boat.vx, this.boat.vy) > 3) {
      const stroke = Math.sin(this.t * 7) * 0.6;
      for (const side of [-1, 1]) {
        const a = this.boat.heading + side * (Math.PI / 2) + stroke * side;
        const ox = bx - Math.cos(this.boat.heading) * 2, oy = by - Math.sin(this.boat.heading) * 2;
        pixelLine(ctx, ox, oy, ox + Math.cos(a) * 9, oy + Math.sin(a) * 9, lutHex("bark2", lut));
      }
    }
    this.engine.assets.draw(ctx, "boat_top", `top_lv${w.hullLv}_${dir}`, bx - 16, by - 16, { lut });
  }

  private drawStorms(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    for (const st of stormsAt(this.game.clockH)) {
      const cx = st.x * TILE - cam.x, cy = st.y * TILE - cam.y, R = st.r * TILE;
      if (cx + R < 0 || cy + R < 0 || cx - R > VIEW_W || cy - R > VIEW_H) continue;
      // dithered cloud mass: dark, thicker toward the eye
      ctx.fillStyle = lutHex("gray1");
      const step = 4;
      for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(VIEW_H, cy + R); y += step)
        for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(VIEW_W, cx + R); x += step) {
          const d = Math.hypot(x - cx, y - cy) / R;
          const wob = Math.sin((x + cam.x) * 0.05 + this.t * 0.7) * 0.06 + Math.cos((y + cam.y) * 0.06 - this.t * 0.5) * 0.06;
          const dens = 1 - d + wob;
          if (dens <= 0) continue;
          const o = ((x >> 2) + (y >> 2)) & 1;
          if (dens < 0.25 && o) continue;
          ctx.globalAlpha = Math.min(0.55, dens * 0.8);
          ctx.fillRect(x, y, step, step);
        }
      ctx.globalAlpha = 1;
    }
    if (this.storm > 0.05) {
      // rain + a darker view inside the storm; lightning now and then
      ctx.fillStyle = lutHex("foam1");
      for (let i = 0; i < 90 * this.storm; i++) {
        const x = (i * 97 + this.t * 260) % VIEW_W, y = (i * 53 + this.t * 420) % VIEW_H;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
      }
      ctx.globalAlpha = this.storm * 0.35;
      ctx.fillStyle = lutHex("navy");
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
      if (Math.sin(this.t * 1.3) > 0.995 - this.storm * 0.01) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = lutHex("white");
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Morning / sunset / night as a multiply tint over the world (not the HUD). */
  private drawTint(ctx: CanvasRenderingContext2D): void {
    const { a, b, t } = this.game.clock.blend();
    ctx.save();
    for (const [name, w] of [[a, 1 - t], [b, t]] as const) {
      if (w <= 0) continue;
      for (const layer of TINT[name] ?? []) {
        ctx.globalCompositeOperation = layer.mode;
        ctx.globalAlpha = layer.alpha * w;
        ctx.fillStyle = layer.color;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
    }
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, engine: Engine, lut: LutName): void {
    const assets = engine.assets;
    const w = this.game.world;
    const tile = tileAt(Math.floor(this.boat.x / TILE), Math.floor(this.boat.y / TILE));
    const sea = tile?.sea ?? "jade";

    panel(ctx, assets, "panel_wood", 6, 6, 176, 60);
    text(ctx, `${SEA_NAME[sea]}${tile?.deep ? " · 심해" : ""}`, 14, 13, { color: lutHex("bark1"), shadow: null });
    text(ctx, this.game.clock.label(), 174, 13, { align: "right", color: lutHex("bark2"), shadow: null });
    const fmax = fuelMax(w);
    assets.draw(ctx, "ui", "icon_fuel", 12, 27);
    gaugeH(ctx, assets, 30, 31, 112, w.fuel / fmax, w.fuel <= 0 ? lutHex("gray2") : w.fuel / fmax < 0.2 ? lutHex("coral") : lutHex("yellow"));
    text(ctx, w.fuel <= 0 ? "노" : `${Math.ceil(w.fuel)}`, 174, 29, { align: "right", color: lutHex("bark1"), shadow: null });
    const hmax = HULLS[w.hullLv].hp;
    assets.draw(ctx, "ui", "icon_repair", 12, 44);
    gaugeH(ctx, assets, 30, 48, 112, w.hullHp / hmax, w.hullHp / hmax < 0.3 ? lutHex("coral") : lutHex("jade3"));
    text(ctx, `${w.hullHp}`, 174, 46, { align: "right", color: lutHex("bark1"), shadow: null });

    this.game.drawSaveLabel(ctx, assets, 8, 72);
    button(ctx, assets, "normal", "해도 M", HUD_CHART.x, HUD_CHART.y, HUD_CHART.w, HUD_CHART.h);
    button(ctx, assets, "normal", "메뉴", HUD_MENU.x, HUD_MENU.y, HUD_MENU.w, HUD_MENU.h);

    // hold + freshness + gold
    const hold = this.game.backend.hold();
    let holdLine = `창고 0/${holdCap(w.holdLv)}`;
    if (hold.length) {
      const fresh = hold.reduce((s, h) => s + freshnessPct(h, w.seaTime, w.iceLv), 0) / hold.length;
      holdLine = `창고 ${hold.length}/${holdCap(w.holdLv)} · 신선도 ${Math.round(fresh)}%`;
    }
    text(ctx, `${w.day}일차 · ${HULLS[w.hullLv].name} · ${holdLine} · ${this.game.backend.gold().toLocaleString("ko-KR")}G`, 6, 344, { color: lutHex("foam2") });

    if (this.storm > 0.2 && Math.floor(this.t * 2) % 2 === 0) text(ctx, "폭풍 속 — 파도가 배를 민다 · 희귀종이 잘 문다", 320, 30, { align: "center", color: lutHex("yellow") });

    // the action prompt
    const p = this.prompt;
    if (p && this.state.k === "sail") {
      const label =
        p.kind === "dock"
          ? `접안 · ${p.island.name}`
          : `낚시 · ${POINT_BY_ID[p.point.pointId]?.name ?? ""}${tile?.deep ? " (심해)" : ""}${this.storm > 0.2 ? " (폭풍)" : ""}`;
      const waiting = this.pending ? " — 멈추는 중…" : "";
      button(ctx, assets, this.pending ? "pressed" : "hover", `Space · ${label}${waiting}`, PROMPT_BTN.x, PROMPT_BTN.y, PROMPT_BTN.w, PROMPT_BTN.h);
    } else if (this.state.k === "sail" && this.t < 6) {
      text(ctx, "방향키·WASD로 몰고, 클릭한 곳으로 항해 · 포인트에 멈춰 Space로 낚시", 320, 322, { align: "center", color: lutHex("foam2") });
    }

    if (this.toast) {
      const tw = Math.max(160, textWidth(ctx, this.toast.text) + 28);
      panel(ctx, assets, "panel_sea", 320 - tw / 2, 74, tw, 26);
      text(ctx, this.toast.text, 320, 81, { align: "center", color: this.toast.color });
    }
    if (engine.dev) {
      const line = `${Math.round(this.boat.x / TILE)},${Math.round(this.boat.y / TILE)} · ${Math.round(Math.hypot(this.boat.vx, this.boat.vy))}px/s · ${engine.fps}fps  [H]선체 [F]연료 [T]+1h`;
      text(ctx, line, 634, 344, { align: "right", color: lutHex("foam1") });
    }
  }
}

/** Time-of-day light over the top-down world: warm soft light at dawn and dusk, a deep blue at night. */
const TINT: Partial<Record<LutName, { color: string; alpha: number; mode: GlobalCompositeOperation }[]>> = {
  morning: [{ color: "#ffc59a", alpha: 0.5, mode: "soft-light" }],
  sunset: [
    { color: "#c97a8c", alpha: 0.55, mode: "multiply" },
    { color: "#ff9a50", alpha: 0.3, mode: "overlay" },
  ],
  night: [{ color: "#28366e", alpha: 0.8, mode: "multiply" }],
};

/** A small pixel anchor (7×9) centered on (cx, cy), with a dark shadow so it reads on any water. */
function drawAnchor(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  const rows = ["..XXX..", "..X.X..", "..XXX..", "XXXXXXX", "...X...", "...X...", "X..X..X", ".X.X.X.", "..XXX.."];
  for (const [col, off] of [[lutHex("ink"), 1], [color, 0]] as const) {
    ctx.fillStyle = col;
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) if (r[x] === "X") ctx.fillRect(cx - 3 + x + off, cy - 4 + y + off, 1, 1);
    });
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

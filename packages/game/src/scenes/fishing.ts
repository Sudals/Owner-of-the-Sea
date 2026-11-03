import { balance, BARE_HOOK, FISH_BY_ID, GRADE_LABEL, holdCap, ITEMS, omenCastIndex, POINT_BY_ID, rollCast, START_ISLAND, withBalance, type CastRoll, type FishData, type FishingPoint, type ItemId } from "@sea/shared";
import type { LutName } from "@sea/sprites/palette";
import { islandBg, lutHex, type BgName } from "../assets";
import type { CastResult, FishingSession, GameBackend, SessionSpot } from "../backend";
import type { Engine, Scene } from "../engine";
import type { Game } from "../game";
import { Fx } from "../render/fx";
import { pixelCurve, pixelLine } from "../render/pixels";
import { button, dim, gaugeH, gaugeV, inRect, panel, text, textWidth } from "../render/ui";
import { drawSurface } from "../render/water";
import { Reel } from "../systems/reel";
import { InventoryPanel } from "../ui/inventoryPanel";
import { Clock } from "../systems/timeOfDay";

// Fishing spot scene (design §4-1, §4-2; roadmap M3). One button drives everything:
//   IDLE → hold: CHARGING → release: CASTING → WAITING (2–8 s) → BITE (press within 0.6 s)
//   → REELING (tension minigame: hold to reel) → CAUGHT (into the hold) / LOST → IDLE
// What bites is rolled per cast from the session seed (shared/cast.ts) — the fish swimming
// around are scenery. Results are journaled through the GameBackend and saved later (§11).

export type SeaId = "jade" | "azure" | "indigo" | "ink";
export type Spot =
  | { kind: "dock"; islandId?: string }
  | {
      kind: "boat";
      sea: SeaId;
      hullLv: 1 | 2 | 3 | 4;
      /** Species pool (points.ts); defaults to the sea's open-water pool. */
      pointId?: string;
      /** The map point the boat stopped at (seaMap.ts) — sessions are per map point. */
      mapPointId?: string;
      /** Stopped on a dark deep-sea tile (design §4-8). */
      deep?: boolean;
      /** Stopped inside a storm (design §3-3). */
      storm?: boolean;
    };

/** Session key: one seed session per dock / per map point (design §11-3). */
export const spotIdOf = (spot: Spot): string =>
  spot.kind === "dock" ? `${spot.islandId ?? START_ISLAND.id}_dock` : (spot.mapPointId ?? spot.pointId ?? `${spot.sea}_1`);

/** The species pool + odds for a spot. */
export const poolOf = (spot: Spot): string => (spot.kind === "dock" ? `${spot.islandId ?? START_ISLAND.id}_dock` : (spot.pointId ?? `${spot.sea}_1`));

const SEA_ORDER: SeaId[] = ["jade", "azure", "indigo", "ink"];
const ROD_LEN = 34;
const FEET_ROW = 47; // angler sprites: the sole's outline row
const BOAT_X = 236;
const BOAT_DRAFT = 24; // boat sprite row sitting on the waterline
const CAST_TIME = 0.6;
const CHARGE_PERIOD = 1.1;
const BITE_WINDOW = () => balance().fishing.biteWindowSec; // design §4-1
const BAIT_BTN = { x: 470, y: 316, w: 162, h: 20 };
const LEAVE_BTN = { x: 508, y: 8, w: 124, h: 18 };

const AMBIENT: Record<"dock" | SeaId, string[]> = {
  dock: ["anchovy", "sardine", "gizzard_shad", "goby", "black_seabream", "halfbeak", "rockfish", "pufferfish", "red_seabream"],
  jade: ["anchovy", "sardine", "halfbeak", "mackerel", "horse_mackerel", "black_seabream", "pufferfish", "koi"],
  azure: ["mackerel", "yellowtail", "spanish_mackerel", "conger", "red_seabream", "saury", "sea_bass", "filefish"],
  indigo: ["bluefin_tuna", "skipjack", "cutlassfish", "salmon", "sunfish", "moray", "yellowtail"],
  ink: ["anglerfish", "lantern_angler", "ghost_cutlass", "pike_conger", "dark_rockfish", "cutlassfish"],
};

type Ambient = { id: string; x: number; y: number; vx: number; phase: number; w: number };
type Hooked = { roll: CastRoll; i: number; fish: FishData; castPower: number; bait: string };
type LostReason = "missed" | "snapped" | "escaped" | "reeled_in";

type State =
  | { k: "loading" }
  | { k: "idle"; t: number }
  | { k: "charging"; t: number }
  | { k: "casting"; t: number; power: number; to: number }
  | { k: "waiting"; t: number; hooked: Hooked; floatX: number; nibbles: number[] }
  | { k: "bite"; t: number; hooked: Hooked; floatX: number }
  | { k: "reeling"; t: number; hooked: Hooked; floatX: number; reel: Reel; fishPos: [number, number] }
  | { k: "caught"; t: number; hooked: Hooked; released?: boolean }
  | { k: "lost"; t: number; reason: LostReason; hooked: Hooked | null; from: [number, number] | null };

const LOST_TEXT: Record<LostReason, string> = {
  missed: "놓쳤다… 입질에 한발 늦었다.",
  snapped: "줄이 끊어졌다!",
  escaped: "물고기가 빠져나갔다…",
  reeled_in: "찌를 거둬들였다.",
};

export class FishingScene implements Scene {
  private readonly ownClock = new Clock(9);
  state: State = { k: "loading" };
  session: FishingSession | null = null;
  private fish: Ambient[] = [];
  private t = 0;
  private engine!: Engine;
  private toast: { text: string; until: number } | null = null;
  // geometry from the last render, used by update
  private tip: [number, number] = [380, 110];
  /** Splashes, sparkles, the snap, shake and flashes. */
  readonly fx = new Fx();
  private sprayT = 0;
  /** 창고 · 장비 (I, between casts). */
  bag: InventoryPanel | null = null;
  private feet: [number, number] = [344, 146];
  /** ESC menu (design §7-3): the world stops while it is open. */
  pause: { sel: number } | null = null;

  constructor(
    public spot: Spot,
    private readonly backend: GameBackend,
    private readonly game?: Game,
  ) {}

  get point(): FishingPoint {
    return POINT_BY_ID[poolOf(this.spot)] ?? POINT_BY_ID[`${START_ISLAND.id}_dock`]!;
  }

  /** The game's shared clock (time runs on across scenes), or a local one when run alone. */
  get clock(): Clock {
    return this.game?.clock ?? this.ownClock;
  }

  /** Where "leave" goes: back to the sea map from a boat, back to the island from its dock. */
  private get leaveLabel(): string {
    return this.spot.kind === "boat" ? "바다로 돌아가기" : "섬으로 돌아가기";
  }

  private leave(): void {
    if (!this.game) return;
    if (this.session) this.backend.closeSession(this.session.sessionId);
    this.session = null;
    if (this.spot.kind === "boat") this.game.toSea();
    else this.game.toIsland(this.spot.islandId ?? START_ISLAND.id);
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.spawnFish();
    void this.open();
  }

  /** Leaving the scene (to the lobby, a reload) keeps the session open: coming back resumes the
   *  same seed and cast index (design §11-4). Sailing away from the point closes it (moveTo). */
  exit(): void {}

  private async open(): Promise<void> {
    this.state = { k: "loading" };
    try {
      const sp = this.spot, w = this.game?.world;
      const req: SessionSpot = {
        spotId: spotIdOf(sp),
        pointId: poolOf(sp),
        at: sp.kind === "boat" && w?.at.kind === "sea" ? { x: w.at.x, y: w.at.y } : undefined,
        clockH: this.game?.clockH,
        deep: sp.kind === "boat" ? !!sp.deep : false,
        storm: sp.kind === "boat" ? !!sp.storm : false,
      };
      this.session = await this.backend.openSession(req);
      this.state = { k: "idle", t: 0 };
    } catch (e) {
      console.warn("[fishing] open", e);
      this.say(e instanceof Error && e.message ? e.message : "낚시 포인트를 열지 못했다. 잠시 후 다시 시도해 주세요.", 6);
    }
  }

  private moveTo(spot: Spot): void {
    if (this.session) this.backend.closeSession(this.session.sessionId);
    this.session = null;
    this.spot = spot;
    this.spawnFish();
    void this.open();
  }

  private say(textLine: string, seconds = 2.2): void {
    this.toast = { text: textLine, until: this.t + seconds };
  }

  private get waterline(): number {
    return this.engine.assets.meta.waterline;
  }

  private get bgName(): BgName {
    return this.spot.kind === "dock" ? islandBg(this.spot.islandId ?? START_ISLAND.id) : (`bg_sea_${this.spot.sea}` as BgName);
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

  // ── update ─────────────────────────────────────────────────────────────────────

  update(dt: number, engine: Engine): void {
    this.fx.update(dt);
    this.fx.danger = 0;
    if (this.updatePause(engine)) return;
    if (this.bag) {
      this.bag.update(engine);
      if (this.bag.closed) this.bag = null;
      return;
    }
    if (this.game && engine.input.hit("KeyI") && ["idle", "caught", "lost"].includes(this.state.k)) return void (this.bag = new InventoryPanel(this.game));
    // the "leave" button (top-right) — only between casts, and it eats the click
    if (this.game && engine.input.clicked && inRect(engine.input.clicked, LEAVE_BTN)) {
      if (this.state.k === "idle" || this.state.k === "loading") return this.leave();
      return;
    }
    this.t += dt;
    if (this.game) this.game.tick(dt, this.spot.kind === "boat");
    else this.clock.update(dt);
    const input = engine.input;
    if (engine.dev) this.devKeys(engine);
    if (this.toast && this.t > this.toast.until) this.toast = null;
    this.moveAmbient(dt);

    const s = this.state;
    switch (s.k) {
      case "loading":
        return;
      case "idle":
        s.t += dt;
        if (this.game && (input.hit("KeyE") || input.hit("KeyQ") || (input.clicked && inRect(input.clicked, BAIT_BTN)))) {
          this.game.cycleBait(input.hit("KeyQ") ? -1 : 1);
          return;
        }
        if (input.pressed) this.state = { k: "charging", t: 0 };
        return;
      case "charging":
        s.t += dt;
        // `!input.down` also catches a tap shorter than one frame (press + release in the same step)
        if (input.released || !input.down) {
          const power = chargePower(s.t);
          const to = Math.min(624, this.tip[0] + 40 + power * 210);
          this.state = { k: "casting", t: 0, power, to };
        }
        return;
      case "casting":
        s.t += dt;
        if (s.t >= CAST_TIME) this.startWaiting(s.power, s.to);
        return;
      case "waiting":
        s.t += dt;
        if (input.pressed) {
          // pulled the line in before anything bit — the rolled fish never showed itself
          this.finishCast(s.hooked, "escaped", 0, false);
          this.state = { k: "lost", t: 0, reason: "reeled_in", hooked: null, from: null };
          this.say(LOST_TEXT.reeled_in, 1.2);
        } else if (s.t >= s.hooked.roll.waitSec) {
          this.state = { k: "bite", t: 0, hooked: s.hooked, floatX: s.floatX };
          this.splash(s.floatX, 10, 1); // the float goes under
          this.fx.shake(1);
        }
        return;
      case "bite":
        s.t += dt;
        if (input.pressed) {
          const { fish, castPower } = s.hooked;
          const gear = this.backend.gear();
          const reel = new Reel({ power: fish.power, erratic: fish.erratic, boss: fish.rarity === "boss", rodLv: gear.rodLv, lineLv: gear.lineLv, castPower });
          this.state = { k: "reeling", t: 0, hooked: s.hooked, floatX: s.floatX, reel, fishPos: [s.floatX, this.waterline + 14] };
          this.splash(s.floatX, 14, 1.3); // strike!
          this.fx.shake(1.5);
        } else if (s.t >= BITE_WINDOW()) {
          this.finishCast(s.hooked, "escaped", 0);
          this.state = { k: "lost", t: 0, reason: "missed", hooked: s.hooked, from: [s.floatX, this.waterline + 16] };
          this.fx.ring(s.floatX, this.waterline + 1, "white", 12, 0.6, 0.3);
          this.say(LOST_TEXT.missed);
        }
        return;
      case "reeling": {
        s.t += dt;
        s.reel.update(dt, input.down);
        // the fish thrashes at the surface; the edges glow red as the line nears breaking
        this.sprayT += dt;
        if (s.reel.thrash > 0 && this.sprayT > 0.09) {
          this.sprayT = 0;
          this.splash(s.fishPos[0], 3, 0.7);
        }
        this.fx.danger = Math.max(0, Math.min(1, (s.reel.tension - 0.82) / 0.15));
        const out = s.reel.outcome;
        if (!out) return;
        const ms = Math.round(s.t * 1000);
        if (out === "caught") {
          const released = this.holdFull;
          this.finishCast(s.hooked, "caught", ms);
          this.state = { k: "caught", t: 0, hooked: s.hooked, released };
          this.catchFx(s.hooked.fish, s.fishPos);
        } else {
          this.finishCast(s.hooked, "escaped", ms);
          this.state = { k: "lost", t: 0, reason: out, hooked: s.hooked, from: s.fishPos };
          if (out === "snapped") {
            // the line parts with a crack
            const [tx, ty] = this.tip;
            this.fx.burst(tx, ty, 10, { colors: ["white", "foam1", "gray2"], speed: [30, 90], g: 260, life: [0.3, 0.6] });
            this.fx.text(tx, ty - 18, "툭!", "coral", { big: true, life: 1 });
            this.fx.shake(4);
            this.fx.flash("red2", 0.6, 1.2);
          }
          this.splash(s.fishPos[0], 12, 1);
          this.say(LOST_TEXT[out]);
        }
        return;
      }
      case "caught":
        s.t += dt;
        if (s.t > 0.5 && input.pressed) this.state = { k: "idle", t: 0 };
        return;
      case "lost":
        s.t += dt;
        if (s.t > 1.4 || (s.t > 0.35 && input.pressed)) this.state = { k: "idle", t: 0 };
        return;
    }
  }

  private pauseItems() {
    const x = 320 - 70, w = 140;
    return [
      { id: "resume", label: "계속하기", rect: { x, y: 150, w, h: 20 } },
      { id: "leave", label: this.leaveLabel, rect: { x, y: 176, w, h: 20 } },
      { id: "save", label: "저장", rect: { x, y: 202, w, h: 20 } },
      { id: "title", label: "로비로 나가기", rect: { x, y: 228, w, h: 20 } },
    ];
  }

  /** Handles the ESC menu; true while it is open (the world doesn't step). Mid-fight is not a
   *  pause point — the line would go slack. */
  private updatePause(engine: Engine): boolean {
    const input = engine.input;
    const calm = ["loading", "idle", "caught", "lost"].includes(this.state.k);
    if (!this.pause) {
      if (input.hit("Escape") && calm && this.game) this.pause = { sel: 0 };
      return !!this.pause;
    }
    const items = this.pauseItems();
    if (input.hit("Escape")) {
      this.pause = null;
      return true;
    }
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d) this.pause.sel = (this.pause.sel + d + items.length * 4) % items.length;
    const hover = items.findIndex((it) => inRect(input.pointer, it.rect));
    if (hover >= 0 && input.clicked) this.pause.sel = hover;
    const go = input.clicked ? hover : input.pressed ? this.pause.sel : -1;
    const id = items[go]?.id;
    if (id === "resume") this.pause = null;
    else if (id === "leave") this.leave();
    else if (id === "save") {
      this.pause = null;
      void this.game!.manualSave();
    } else if (id === "title") {
      this.pause = null;
      this.game!.leave("lobby");
    }
    return true;
  }

  /** Water thrown up at x on the surface (side view), with a ring spreading out. */
  private splash(x: number, n: number, k: number): void {
    const wl = this.waterline;
    this.fx.burst(x, wl - 1, n, { colors: ["white", "foam2", "foam1"], speed: [40 * k, 95 * k], dir: -Math.PI / 2, spread: 0.85, g: 340, drag: 0.5, life: [0.35, 0.7] });
    this.fx.ring(x, wl + 1, "white", 8 + n * 0.8, 0.55, 0.3);
  }

  /** A catch: the fish breaks the surface, sparkles around the card; rarer = brighter. */
  private catchFx(fish: FishData, at: [number, number]): void {
    this.splash(at[0], 18, 1.4);
    if (fish.trash) {
      // no sparkle for junk: a dull plop of dirty water
      this.fx.burst(at[0], this.waterline - 1, 8, { colors: ["gray2", "gray1"], speed: [30, 70], dir: -Math.PI / 2, spread: 0.8, g: 340, drag: 0.5, life: [0.3, 0.6] });
      return;
    }
    const rare = fish.rarity === "rare", top = fish.rarity === "legendary" || fish.rarity === "boss";
    const colors: Parameters<Fx["burst"]>[3]["colors"] = top ? ["white", "yellow", "peach", "coral"] : rare ? ["white", "yellow", "foam2"] : ["white", "foam2"];
    this.fx.burst(470, 70, top ? 46 : rare ? 30 : 16, { colors, speed: [30, top ? 120 : 80], life: [0.5, 1.1], drag: 0.2, jitter: 20 });
    if (top) {
      this.fx.flash("yellow", 0.5, 1.2);
      this.fx.shake(3);
    } else if (rare) this.fx.flash("yellow", 0.25, 2);
  }

  /** Roll the cast from the session seed (design §11-3) and start the wait. */
  private startWaiting(power: number, floatX: number): void {
    const sess = this.session!;
    const i = sess.nextIndex++;
    const pollutant = sess.omenFrom !== null && omenCastIndex(sess.seed, sess.omenFrom) === i;
    const spot = this.spot;
    // the session's conditions are the ones that count (the server fixes them in the full build)
    const conds = sess.conds ?? { deep: spot.kind === "boat" && !!spot.deep, storm: spot.kind === "boat" && !!spot.storm };
    const bait = this.game?.currentBait() ?? "bait_worm";
    const opts = { pollutant, deep: conds.deep, storm: conds.storm, bait };
    // a session that opened under another balance version rolls with it (pool and odds included)
    const roll = sess.balance ? withBalance(sess.balance, () => rollCast(sess.seed, i, POINT_BY_ID[this.point.id] ?? this.point, opts)) : rollCast(sess.seed, i, this.point, opts);
    const fish = FISH_BY_ID[roll.fishId]!;
    // fake nibbles before the real bite: purely visual
    const nibbles = Array.from({ length: Math.floor(Math.random() * 3) }, () => 0.6 + Math.random() * Math.max(0.2, roll.waitSec - 1.4)).sort((a, b) => a - b);
    this.state = { k: "waiting", t: 0, hooked: { roll, i, fish, castPower: power, bait }, floatX, nibbles };
    this.splash(floatX, 6, 0.6); // plop
  }

  /** The hold is full: a catch is let go (design §4-4 — time to head for port). */
  private get holdFull(): boolean {
    return !!this.game && this.backend.hold().length >= holdCap(this.game.world.holdLv);
  }

  /** `bit` false = reeled in before the bite: the bait stays on the hook (Economy.md §4-1). */
  private finishCast(h: Hooked, result: CastResult, reelMs: number, bit = true): void {
    if (!this.session) return;
    if (result === "caught" && this.holdFull) result = "released";
    this.backend.recordCast(this.session.sessionId, { i: h.i, fishId: h.roll.fishId, sizeCm: h.roll.sizeCm, result, reelMs, t: Date.now(), seaT: this.game?.world.seaTime, bait: h.bait, ...(bit ? {} : { bit: false }) });
  }

  private moveAmbient(dt: number): void {
    const minX = this.spot.kind === "dock" ? this.engine.assets.meta.dock.bedFrom + 40 : -40;
    for (const f of this.fish) {
      f.x += f.vx * dt;
      if ((f.vx < 0 && f.x < minX) || (f.vx > 0 && f.x > 640) || f.y > this.floor(f.x + (f.vx > 0 ? f.w : 0))) {
        f.vx = -f.vx;
        f.x += f.vx * dt * 2;
      }
    }
  }

  private devKeys(engine: Engine): void {
    const input = engine.input;
    if (input.hit("KeyT")) this.clock.advance(input.hit("KeyT"));
    const busy = this.state.k !== "idle" && this.state.k !== "loading";
    if (busy) return;
    if (input.hit("KeyB") % 2 === 1) this.moveTo(this.spot.kind === "dock" ? { kind: "boat", sea: "jade", hullLv: 1 } : { kind: "dock" });
    if (input.hit("KeyN") && this.spot.kind === "boat") {
      const next = SEA_ORDER[(SEA_ORDER.indexOf(this.spot.sea) + input.hit("KeyN")) % SEA_ORDER.length]!;
      this.moveTo({ kind: "boat", sea: next, hullLv: (SEA_ORDER.indexOf(next) + 1) as 1 | 2 | 3 | 4 });
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const { a, b, t } = this.clock.blend();
    const lut = this.clock.lut();
    const wl = this.waterline;
    const s = this.state;

    // the world shakes (the HUD doesn't)
    const shake = this.fx.offset();
    ctx.save();
    if (shake.x || shake.y) {
      ctx.fillStyle = lutHex("ink");
      ctx.fillRect(0, 0, 640, 360);
      ctx.translate(shake.x, shake.y);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(assets.background(this.bgName, a), 0, 0);
    if (t > 0) {
      ctx.globalAlpha = t;
      ctx.drawImage(assets.background(this.bgName, b), 0, 0);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 640, assets.meta.horizon);
    ctx.clip();
    const sun = this.clock.sun(), moon = this.clock.moon();
    if (sun) assets.draw(ctx, "sky", "sun", sun.x - 16, sun.y - 16, { lut: lut === "night" ? "day" : lut });
    if (moon) assets.draw(ctx, "sky", "moon", moon.x - 12, moon.y - 12);
    ctx.restore();

    for (const f of this.fish) {
      const y = f.y + Math.round(Math.sin(this.t * 1.5 + f.phase) * 2);
      assets.draw(ctx, "fish", f.id, f.x, y, { flipX: f.vx < 0, lut });
    }

    // a shadow drifts up under the float just before the bite
    if (s.k === "waiting" && s.hooked.roll.waitSec - s.t < 1.6) {
      const k = 1 - (s.hooked.roll.waitSec - s.t) / 1.6;
      ctx.globalAlpha = 0.25 + k * 0.25;
      ctx.fillStyle = lutHex("deep1", lut);
      const w = 10 + k * 10;
      ctx.fillRect(Math.round(s.floatX - w / 2), Math.round(wl + 30 - k * 14), Math.round(w), 4);
      ctx.globalAlpha = 1;
    }

    // hooked / fleeing fish under the surface
    if (s.k === "reeling") {
      const near = this.feet[0] + 28, far = s.floatX;
      const shake = s.reel.thrash > 0 ? Math.round(Math.sin(this.t * 40) * 2) : 0;
      const depth = s.hooked.fish.rarity === "boss" ? 30 : 14;
      s.fishPos = [far + (near - far) * s.reel.progress + shake, wl + depth + Math.round(Math.sin(this.t * 3) * 3)];
      this.drawHookedFish(ctx, s.hooked.fish, s.fishPos, lut);
    }
    if (s.k === "lost" && s.hooked && s.from && s.reason !== "reeled_in") {
      const x = s.from[0] + s.t * 160, y = s.from[1] + s.t * 30;
      if (x < 700) this.drawHookedFish(ctx, s.hooked.fish, [x, y], lut, false);
    }

    // boat + angler
    if (this.spot.kind === "boat") {
      const bob = Math.round(Math.sin(this.t * 1.3) * 1.2);
      const boatName = `boat_lv${this.spot.hullLv}`;
      const fr = assets.frame("boat", boatName);
      const by = wl - BOAT_DRAFT + bob;
      assets.draw(ctx, "boat", boatName, BOAT_X, by, { lut });
      const stand = fr.anchor?.stand ?? [44, 18];
      this.feet = [BOAT_X + stand[0], by + stand[1]];
    } else this.feet = assets.meta.dock.stand;
    this.drawAngler(ctx, lut);

    drawSurface(ctx, this.t, wl, this.spot.kind === "dock" ? assets.meta.dock.shoreX - 30 : 0, lut);
    this.drawFloat(ctx, lut);
    this.fx.draw(ctx, 0, 0, lut);
    ctx.restore();
    this.fx.drawScreen(ctx);
    this.drawHud(ctx, engine, lut);
    this.bag?.render(ctx, engine);
  }

  private drawHookedFish(ctx: CanvasRenderingContext2D, fish: FishData, [x, y]: [number, number], lut: LutName, facingAngler = true): void {
    const assets = this.engine.assets;
    const fr = assets.frame(fish.sheet, fish.id);
    // sprites face right; a hooked fish faces the angler (left) with the line at its mouth
    const mouth = fr.anchor?.mouth ?? [fr.w - 2, Math.floor(fr.h / 2)];
    const mx = facingAngler ? fr.w - 1 - mouth[0] : mouth[0];
    assets.draw(ctx, fish.sheet, fish.id, x - mx, y - mouth[1], { flipX: facingAngler, lut });
  }

  private anglerFrame(): string {
    const s = this.state;
    switch (s.k) {
      case "charging":
        return `charge_${chargePower(s.t) > 0.5 ? 1 : 0}`;
      case "casting":
        return `cast_${Math.min(2, Math.floor((s.t / CAST_TIME) * 3))}`;
      case "waiting":
      case "bite":
        return `wait_${Math.floor(this.t * 1.2) % 2}`;
      case "reeling":
        if (s.t < 0.25) return "hook_1";
        return this.engine.input.down ? `reel_${Math.floor(s.t * 9) % 4}` : "wait_0";
      case "caught":
        return `catch_${Math.floor(s.t * 2) % 2}`;
      default:
        return `idle_${Math.floor(this.t * 1.6) % 2}`;
    }
  }

  private drawAngler(ctx: CanvasRenderingContext2D, lut: LutName): void {
    const assets = this.engine.assets;
    const s = this.state;
    const name = this.anglerFrame();
    const fr = assets.frame("angler", name);
    const x = this.feet[0] - 16, y = this.feet[1] - FEET_ROW;
    assets.draw(ctx, "angler", name, x, y, { lut });

    const hand = fr.anchor?.hand ?? [24, 30];
    const angle = ((fr.anchor?.rod?.[0] ?? -50) * Math.PI) / 180;
    const hx = x + hand[0], hy = y + hand[1];
    let tipX = hx + Math.cos(angle) * ROD_LEN, tipY = hy + Math.sin(angle) * ROD_LEN;
    const butt = lutHex("bark1", lut), blank = lutHex("wood", lut), tipC = lutHex("coral", lut), lineC = lutHex("foam1", lut);

    if (s.k === "caught") {
      // the catch held up in both hands; the rod is set down
      const fish = s.hooked.fish;
      const ff = assets.frame(fish.sheet, fish.id);
      const hold = fr.anchor?.fish ?? [24, 20];
      assets.draw(ctx, fish.sheet, fish.id, x + hold[0] - ff.w / 2, y + hold[1] - ff.h / 2 - Math.round(Math.abs(Math.sin(s.t * 6)) * 2), { lut });
      return;
    }

    if (s.k === "reeling") {
      // the rod bends toward the fish with tension: straight butt, bent tip half
      const midX = hx + Math.cos(angle) * ROD_LEN * 0.5, midY = hy + Math.sin(angle) * ROD_LEN * 0.5;
      const bend = 4 + s.reel.tension * 12;
      tipX -= bend * 0.2;
      tipY += bend;
      pixelLine(ctx, hx - Math.cos(angle) * 3, hy - Math.sin(angle) * 3, midX, midY, (i) => (i < 7 ? butt : blank));
      pixelLine(ctx, midX, midY, tipX, tipY, (i, n) => (i >= n - 1 ? tipC : blank));
    } else {
      pixelLine(ctx, hx - Math.cos(angle) * 3, hy - Math.sin(angle) * 3, tipX, tipY, (i, n) => (i < 7 ? butt : i >= n - 1 ? tipC : blank));
    }
    this.tip = [tipX, tipY];

    switch (s.k) {
      case "casting": {
        const p = s.t / CAST_TIME;
        const fx = tipX + (s.to - tipX) * p, fy = tipY + (this.waterline - tipY) * p - Math.sin(p * Math.PI) * 46;
        pixelLine(ctx, tipX, tipY, fx, fy, lineC);
        assets.draw(ctx, "props", "float_idle", fx - 2, fy - 6, { lut });
        return;
      }
      case "waiting":
      case "bite":
        pixelCurve(ctx, tipX, tipY, (tipX + s.floatX) / 2, this.waterline + 6, s.floatX, this.waterline - 4, lineC);
        return;
      case "reeling":
        pixelCurve(ctx, tipX, tipY, (tipX + s.fishPos[0]) / 2, (tipY + s.fishPos[1]) / 2 + (1 - s.reel.tension) * 14, s.fishPos[0], s.fishPos[1], lineC);
        return;
      case "lost":
        if (s.reason === "snapped") pixelLine(ctx, tipX, tipY, tipX + 3, tipY + 12, lineC);
        else this.drawDanglingHook(ctx, tipX, tipY, lut);
        return;
      default:
        this.drawDanglingHook(ctx, tipX, tipY, lut);
    }
  }

  private drawDanglingHook(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, lut: LutName): void {
    const sway = Math.sin(this.t * 1.8) * 1.5;
    const hookX = tipX + sway, hookY = tipY + 16;
    pixelCurve(ctx, tipX, tipY, tipX + sway * 0.5, tipY + 8, hookX, hookY, lutHex("foam1", lut));
    this.engine.assets.draw(ctx, "props", "hook", hookX - 3, hookY, { lut });
  }

  private drawFloat(ctx: CanvasRenderingContext2D, lut: LutName): void {
    const s = this.state;
    if (s.k !== "waiting" && s.k !== "bite") return;
    const assets = this.engine.assets;
    const wl = this.waterline;
    let dip = Math.sin(this.t * 2.4) > 0.6 ? 1 : 0;
    if (s.k === "waiting" && s.nibbles.some((n) => s.t >= n && s.t < n + 0.18)) dip = 2;
    if (s.k === "bite") dip = 3 + (Math.floor(s.t * 20) % 2);
    assets.draw(ctx, "props", dip ? "float_bob" : "float_idle", s.floatX - 2, wl - 6 + dip, { lut });
    if (s.k === "bite") {
      // "!" — the strike cue
      const bx = s.floatX, by = wl - 26 - Math.round(Math.abs(Math.sin(s.t * 18)) * 2);
      ctx.fillStyle = lutHex("ink");
      ctx.fillRect(bx - 5, by - 1, 11, 16);
      ctx.fillStyle = lutHex("yellow");
      ctx.fillRect(bx - 4, by, 9, 14);
      text(ctx, "!", bx, by + 1, { align: "center", color: lutHex("red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, engine: Engine, lut: LutName): void {
    const assets = engine.assets;
    const s = this.state;

    if (s.k === "charging") {
      const p = chargePower(s.t);
      gaugeV(ctx, this.feet[0] - 26, this.feet[1] - 50, 40, p, p > 0.8 ? lutHex("coral") : p > 0.5 ? lutHex("yellow") : lutHex("jade3"));
    }

    if (s.k === "reeling") {
      const r = s.reel;
      const x = 220, y = 8, w = 200;
      panel(ctx, assets, "panel_sea", x, y, w, 52);
      text(ctx, s.hooked.fish.rarity === "boss" ? `오염체! ${s.hooked.fish.name}` : "텐션", x + 10, y + 7);
      text(ctx, `${Math.max(0, r.dist).toFixed(1)}m`, x + w - 10, y + 7, { align: "right", color: lutHex("foam1") });
      const tc = r.tension > 0.8 ? lutHex("coral") : r.tension > 0.6 ? lutHex("yellow") : lutHex("jade3");
      gaugeH(ctx, assets, x + 10, y + 22, w - 20, r.tension, tc, [0.6, 0.8]);
      gaugeH(ctx, assets, x + 10, y + 34, w - 20, r.progress, lutHex("sea3"));
      const blink = Math.floor(this.t * 6) % 2 === 0;
      if (r.tension > 0.85 && blink) text(ctx, "줄이 끊어질 것 같다! 손을 떼!", 320, y + 58, { align: "center", color: lutHex("coral") });
      else if (r.slack > 0.4 && blink) text(ctx, "줄이 느슨하다! 감아!", 320, y + 58, { align: "center", color: lutHex("yellow") });
    }

    if (s.k === "caught") this.drawResultCard(ctx, s.hooked, s.t);

    if (s.k === "idle" && s.t > 0.8 && !this.toast) {
      text(ctx, "누르고 있다가 떼면 던진다", 320, 330, { align: "center", color: lutHex("foam2") });
    }

    // status line
    const hold = this.game ? `${this.backend.hold().length}/${holdCap(this.game.world.holdLv)}` : `${this.backend.hold().length}`;
    const gear = this.backend.gear();
    const sp = this.spot;
    const tags = sp.kind === "boat" ? `${sp.deep ? " (심해)" : ""}${sp.storm ? " (폭풍)" : ""}` : "";
    text(ctx, `${this.point.name}${tags} · 창고 ${hold}마리 · 낚싯대 Lv${gear.rodLv} · 줄 Lv${gear.lineLv}`, 6, 344, { color: lutHex("foam2") });

    if (this.toast) {
      const w = Math.max(160, textWidth(ctx, this.toast.text) + 28);
      panel(ctx, assets, "panel_sea", 320 - w / 2, 70, w, 30);
      text(ctx, this.toast.text, 320, 79, { align: "center" });
    }
    if (s.k === "loading") text(ctx, "…", 320, 170, { align: "center" });

    if (this.game && !this.pause) {
      const bait = this.game.currentBait();
      const n = bait === BARE_HOOK ? 0 : (this.backend.inventory()[bait as ItemId] ?? 0);
      const label = bait === BARE_HOOK ? "미끼 없음 · 맨 바늘" : `${ITEMS[bait as ItemId]?.name ?? bait} ×${n}`;
      button(ctx, assets, s.k === "idle" ? "normal" : "disabled", `${label}  Q/E`, BAIT_BTN.x, BAIT_BTN.y, BAIT_BTN.w, BAIT_BTN.h);
    }
    if (this.game && !this.pause) button(ctx, assets, s.k === "idle" || s.k === "loading" ? "normal" : "disabled", `◀ ${this.leaveLabel}`, LEAVE_BTN.x, LEAVE_BTN.y, LEAVE_BTN.w, LEAVE_BTN.h);
    if (this.pause) {
      dim(ctx, 0.5);
      panel(ctx, assets, "panel_wood", 320 - 90, 114, 180, 148);
      text(ctx, "일시정지", 320, 126, { align: "center", color: lutHex("bark1"), shadow: null, font: "bold 12px Galmuri11, monospace" });
      this.pauseItems().forEach((it, i) => button(ctx, assets, i === this.pause!.sel ? "hover" : "normal", it.label, it.rect.x, it.rect.y, it.rect.w, it.rect.h));
    } else if (s.k === "idle" && this.game) text(ctx, "ESC 메뉴", 634, 344, { align: "right", color: lutHex("foam2") });
    if (this.game && !this.pause) this.game.drawSaveLabel(ctx, assets, 6, engine.dev ? 20 : 8);
    this.game?.drawFlash(ctx, assets);

    if (engine.dev) {
      const line = `${this.clock.label()} ${lut} · ${this.spot.kind === "dock" ? "선착장" : `배 위 (${this.spot.sea})`} · ${s.k} · ${engine.fps}fps  [T]+1h [B]장소 [N]바다`;
      text(ctx, line, 4, 4);
    }
  }

  private drawResultCard(ctx: CanvasRenderingContext2D, h: Hooked, t: number): void {
    const assets = this.engine.assets;
    const ff = assets.frame(h.fish.sheet, h.fish.id);
    const w = Math.max(220, ff.w + 40), hgt = 70 + ff.h;
    // over the water, clear of the angler holding up the catch
    const cx = 470;
    const x = Math.round(cx - w / 2), y = 24;
    panel(ctx, assets, "panel_paper", x, y, w, hgt);
    const ink = lutHex("ink"), muted = lutHex("bark2");
    const junk = !!h.fish.trash;
    text(ctx, junk ? "쓰레기를 건졌다…" : "잡았다!", cx, y + 8, { align: "center", color: lutHex(junk ? "bark2" : "red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });
    assets.draw(ctx, h.fish.sheet, h.fish.id, cx - ff.w / 2, y + 26);
    const tier = h.fish.tier ? ` ${h.fish.tier}` : "";
    text(ctx, junk ? h.fish.name : `${h.fish.name}  ${h.roll.sizeCm.toFixed(1)}cm`, cx, y + 32 + ff.h, { align: "center", color: ink, shadow: null });
    const s = this.state;
    const released = s.k === "caught" && s.released;
    const kept = released ? "창고가 가득 차 놓아주었다" : "창고에 넣었다";
    const line = junk ? `${released ? "창고가 가득 차 바다에 두었다" : "섬에서 처리하면 몇 G는 받는다"}` : `${GRADE_LABEL[h.fish.rarity]}${tier} · 크기 ${h.roll.sizeGrade}급 · ${kept}`;
    text(ctx, line, cx, y + 46 + ff.h, { align: "center", color: released ? lutHex("red2") : muted, shadow: null });
    if (t > 0.5 && Math.floor(t * 2) % 2 === 0) text(ctx, "▼", x + w - 16, y + hgt - 16, { color: muted, shadow: null });
  }
}

/** Ping-pong 0→1→0 while the button is held. */
export function chargePower(t: number): number {
  const p = (t / CHARGE_PERIOD) % 2;
  return p < 1 ? p : 2 - p;
}

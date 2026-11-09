import type { Assets } from "./assets";
import { Input } from "./input";
import type { Modal } from "./ui/modal";

// Core loop (design §1, §7-1): a 640×360 internal resolution, scaled up to the window,
// fixed-step simulation at 60 Hz with rendering once per animation frame.
//
// Every scene is laid out in 640×360. A `wide` scene (the top-down sea and village) gets a view
// shaped like the window instead — more world on an ultrawide or a 4:3 screen — with that
// 640×360 layout centered in it (`safe`). Pointer coordinates are always layout coordinates.

export const VIEW_W = 640;
export const VIEW_H = 360;
/** The most a wide scene's view grows to (32:9 · 4:3); past that, the soft fill takes over. */
const MAX_W = 1280, MAX_H = 480;
const STEP = 1 / 60;
const MAX_STEPS = 5; // after a long stall, don't try to catch up forever

export interface Scene {
  /** Show as much world as the window's shape allows (the view grows past 640×360). */
  readonly wide?: boolean;
  enter?(engine: Engine): void;
  /** Fixed step, `dt` seconds (always 1/60). */
  update(dt: number, engine: Engine): void;
  render(ctx: CanvasRenderingContext2D, engine: Engine): void;
  exit?(engine: Engine): void;
}

export type EngineOptions = { assets: Assets; dev?: boolean };

/** A camera's top-left along one axis: centered on `p`, kept inside the world — or, when the
 *  world is narrower than the view, the world centered in the view. */
export function followCam(p: number, world: number, view: number): number {
  if (world <= view) return Math.round((world - view) / 2);
  return Math.round(Math.max(0, Math.min(world - view, p - view / 2)));
}
/** fit: fill the window (a whole-multiple prescale, then a smooth resize) · sharp: whole multiples only. */
export type ScaleMode = "fit" | "sharp";

export class Engine {
  /** The internal buffer every scene draws into: 640×360, larger for a wide scene. */
  readonly view: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** The on-screen canvas: the whole window. The game sits in `viewport`; around it, a soft
   *  blurred copy of the game fills what would be black bars. */
  readonly screen: HTMLCanvasElement;
  private readonly screenCtx: CanvasRenderingContext2D;
  readonly input: Input;
  readonly assets: Assets;
  readonly dev: boolean;

  /** A dialog over the scene; while set, the scene doesn't step (ui/modal.ts). */
  modal: Modal | null = null;
  /** Seconds of simulated time since start. */
  time = 0;
  scale = 1;
  fps = 0;
  scaleMode: ScaleMode = "fit";
  /** The view's size in game pixels (640×360 unless the scene is wide). */
  viewW = VIEW_W;
  viewH = VIEW_H;
  /** Where the 640×360 layout sits in the view. */
  safe = { x: 0, y: 0 };
  /** Where the game is drawn on `screen`, in device pixels. */
  private viewport = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
  private dpr = 1;
  /** fit mode: the view at a whole multiple, resized smoothly from there (crisp, yet any size). */
  private mid: HTMLCanvasElement | null = null;
  private midCtx: CanvasRenderingContext2D | null = null;
  /** A tiny copy of the view, stretched over the whole window behind the game (the bars). */
  private readonly amb: HTMLCanvasElement;
  private readonly ambCtx: CanvasRenderingContext2D;
  private ambTick = 0;
  /** Redraw the bars on the next present (after a resize or a layout change). */
  private ambStale = true;

  private scene: Scene | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private frames = 0;
  private fpsT = 0;
  private readonly resizeObs: ResizeObserver;

  constructor(
    private readonly host: HTMLElement,
    opts: EngineOptions,
  ) {
    this.assets = opts.assets;
    this.dev = opts.dev ?? false;
    this.view = document.createElement("canvas");
    this.view.width = VIEW_W;
    this.view.height = VIEW_H;
    this.ctx = this.view.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;

    this.screen = document.createElement("canvas");
    this.screen.style.display = "block";
    this.screen.style.touchAction = "none";
    this.screenCtx = this.screen.getContext("2d")!;
    host.appendChild(this.screen);
    this.amb = document.createElement("canvas");
    this.amb.width = 48;
    this.amb.height = 27;
    this.ambCtx = this.amb.getContext("2d")!;

    // the pointer maps from the game's rectangle inside the full-window canvas
    this.input = new Input(this.screen, () => {
      const v = this.viewport, d = this.dpr;
      return { x: v.x / d, y: v.y / d, w: v.w / d, h: v.h / d, vw: this.viewW, vh: this.viewH, ox: this.safe.x, oy: this.safe.y };
    });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
  }

  /** The active scene (read-only; used by tests and the React HUD). */
  get currentScene(): Scene | null {
    return this.scene;
  }

  setScene(scene: Scene): void {
    this.scene?.exit?.(this);
    const relayout = !!this.scene?.wide !== !!scene.wide;
    this.scene = scene;
    if (relayout) this.layout();
    scene.enter?.(this);
  }

  /** The view's edges in layout coordinates (0, 0, 640, 360 unless the scene is wide): HUD
   *  pinned to a corner of a wide scene uses these. */
  get bounds(): { left: number; top: number; right: number; bottom: number } {
    return { left: -this.safe.x, top: -this.safe.y, right: this.viewW - this.safe.x, bottom: this.viewH - this.safe.y };
  }

  /** Layout coordinates → page CSS px, and how many CSS px one game pixel is (DOM overlays). */
  toPage(x: number, y: number): { x: number; y: number; k: number } {
    const r = this.screen.getBoundingClientRect(), v = this.viewport, d = this.dpr;
    const k = v.w / d / this.viewW;
    return { x: r.left + v.x / d + (x + this.safe.x) * k, y: r.top + v.y / d + (y + this.safe.y) * k, k };
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.stop();
    this.scene?.exit?.(this);
    this.resizeObs.disconnect();
    this.input.destroy();
    this.screen.remove();
  }

  private frame(now: number): void {
    const elapsed = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.input.update();
      if (this.modal) this.modal.update(this);
      else this.scene?.update(STEP, this);
      this.time += STEP;
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;

    this.frames++;
    this.fpsT += elapsed;
    if (this.fpsT >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsT);
      this.frames = 0;
      this.fpsT = 0;
    }

    this.ctx.imageSmoothingEnabled = false;
    this.scene?.render(this.ctx, this);
    if (this.modal) {
      // dialogs are laid out in 640×360, centered in a wide view
      this.ctx.save();
      this.ctx.translate(this.safe.x, this.safe.y);
      this.modal.render(this.ctx, this);
      this.ctx.restore();
    }
    this.present();
  }

  private present(): void {
    const c = this.screenCtx, v = this.viewport, W = this.screen.width, H = this.screen.height;
    // the bars keep what was drawn there: the soft glow only needs refreshing ~10 times a second
    if ((v.w < W || v.h < H) && (this.ambStale || ++this.ambTick % 6 === 0)) {
      this.ambStale = false;
      // bars: the game itself, tiny, stretched to cover the window — a soft glow of the scene
      this.ambCtx.imageSmoothingEnabled = true;
      this.ambCtx.drawImage(this.view, 0, 0, this.amb.width, this.amb.height);
      const k = Math.max(W / this.amb.width, H / this.amb.height);
      const aw = this.amb.width * k, ah = this.amb.height * k;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(this.amb, (W - aw) / 2, (H - ah) / 2, aw, ah);
      c.fillStyle = "rgba(13, 15, 28, 0.62)";
      c.fillRect(0, 0, W, H);
    }
    if (this.mid && this.midCtx) {
      this.midCtx.imageSmoothingEnabled = false;
      this.midCtx.drawImage(this.view, 0, 0, this.mid.width, this.mid.height);
      // the step down from the whole multiple is small (×3 → ×2.8): plain bilinear is enough
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "low";
      c.drawImage(this.mid, v.x, v.y, v.w, v.h);
      return;
    }
    c.imageSmoothingEnabled = false;
    c.drawImage(this.view, v.x, v.y, v.w, v.h);
  }

  /** 꽉 차게 (fit) or 선명하게 (sharp, whole multiples). */
  setScaleMode(mode: ScaleMode): void {
    if (mode === this.scaleMode) return;
    this.scaleMode = mode;
    this.layout();
  }

  /** Size the canvas to the whole window (device pixels, crisp at any DPR), then lay out. */
  private resize(): void {
    const dpr = (this.dpr = window.devicePixelRatio || 1);
    const cw = Math.max(1, this.host.clientWidth), ch = Math.max(1, this.host.clientHeight);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (this.screen.width !== W) this.screen.width = W;
    if (this.screen.height !== H) this.screen.height = H;
    this.screen.style.width = `${cw}px`;
    this.screen.style.height = `${ch}px`;
    this.layout();
  }

  /** Place the game in the window: sharp — the largest whole multiple of 640×360; fit — as large
   *  as fits, prescaled to the next whole multiple and resized smoothly (exact whole multiples are
   *  drawn pixel for pixel either way). A wide scene's view then grows to the window's shape. */
  private layout(): void {
    const W = this.screen.width, H = this.screen.height;
    const exact = Math.min(W / VIEW_W, H / VIEW_H);
    const whole = Math.floor(exact);
    const crisp = whole >= 1 && (this.scaleMode === "sharp" || exact - whole < 0.02);
    this.scale = crisp ? whole : exact;
    let vw = VIEW_W, vh = VIEW_H;
    if (this.scene?.wide) {
      vw = Math.max(VIEW_W, Math.min(MAX_W, Math.ceil(W / this.scale - 0.01)));
      vh = Math.max(VIEW_H, Math.min(MAX_H, Math.ceil(H / this.scale - 0.01)));
    }
    if (this.view.width !== vw || this.view.height !== vh) {
      this.view.width = vw;
      this.view.height = vh;
      this.ctx.imageSmoothingEnabled = false;
    }
    this.viewW = vw;
    this.viewH = vh;
    this.safe = { x: Math.floor((vw - VIEW_W) / 2), y: Math.floor((vh - VIEW_H) / 2) };
    const gw = Math.max(1, Math.round(vw * this.scale)), gh = Math.max(1, Math.round(vh * this.scale));
    if (crisp) this.mid = this.midCtx = null;
    else {
      const n = Math.max(1, Math.ceil(exact));
      if (!this.mid || this.mid.width !== vw * n || this.mid.height !== vh * n) {
        this.mid = document.createElement("canvas");
        this.mid.width = vw * n;
        this.mid.height = vh * n;
        this.midCtx = this.mid.getContext("2d")!;
      }
    }
    this.viewport = { x: Math.floor((W - gw) / 2), y: Math.floor((H - gh) / 2), w: gw, h: gh };
    this.ambStale = true;
    this.present();
  }
}

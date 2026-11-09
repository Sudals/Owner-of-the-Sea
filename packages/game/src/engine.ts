import type { Assets } from "./assets";
import { Input } from "./input";
import type { Modal } from "./ui/modal";

// Core loop (design §1, §7-1): fixed 640×360 internal resolution, integer upscaling,
// fixed-step simulation at 60 Hz with rendering once per animation frame.

export const VIEW_W = 640;
export const VIEW_H = 360;
const STEP = 1 / 60;
const MAX_STEPS = 5; // after a long stall, don't try to catch up forever

export interface Scene {
  enter?(engine: Engine): void;
  /** Fixed step, `dt` seconds (always 1/60). */
  update(dt: number, engine: Engine): void;
  render(ctx: CanvasRenderingContext2D, engine: Engine): void;
  exit?(engine: Engine): void;
}

export type EngineOptions = { assets: Assets; dev?: boolean };
/** fit: fill the window (a whole-multiple prescale, then a smooth resize) · sharp: whole multiples only. */
export type ScaleMode = "fit" | "sharp";

export class Engine {
  /** Internal 640×360 buffer every scene draws into. */
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
  /** Where the game is drawn on `screen`, in device pixels. */
  private viewport = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
  private dpr = 1;
  /** fit mode: the view at a whole multiple, resized smoothly from there (crisp, yet any size). */
  private mid: HTMLCanvasElement | null = null;
  private midCtx: CanvasRenderingContext2D | null = null;
  /** A tiny copy of the view, stretched over the whole window behind the game (the bars). */
  private readonly amb: HTMLCanvasElement;
  private readonly ambCtx: CanvasRenderingContext2D;

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
      return { x: v.x / d, y: v.y / d, w: v.w / d, h: v.h / d };
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
    this.scene = scene;
    scene.enter?.(this);
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
    this.modal?.render(this.ctx, this);
    this.present();
  }

  private present(): void {
    const c = this.screenCtx, v = this.viewport, W = this.screen.width, H = this.screen.height;
    if (v.w < W || v.h < H) {
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
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
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
    this.resize();
  }

  /** Size the canvas to the whole window (device pixels, crisp at any DPR) and place the game:
   *  sharp — the largest whole multiple; fit — as large as fits, prescaled to the next whole
   *  multiple and resized smoothly. Exact whole multiples are drawn pixel for pixel either way. */
  private resize(): void {
    const dpr = (this.dpr = window.devicePixelRatio || 1);
    const cw = Math.max(1, this.host.clientWidth), ch = Math.max(1, this.host.clientHeight);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    this.screen.width = W;
    this.screen.height = H;
    this.screen.style.width = `${cw}px`;
    this.screen.style.height = `${ch}px`;
    const exact = Math.min(W / VIEW_W, H / VIEW_H);
    const whole = Math.floor(exact);
    let gw: number, gh: number;
    if (whole >= 1 && (this.scaleMode === "sharp" || exact - whole < 0.02)) {
      this.scale = whole;
      gw = VIEW_W * whole;
      gh = VIEW_H * whole;
      this.mid = this.midCtx = null;
    } else {
      this.scale = exact;
      gw = Math.max(1, Math.round(VIEW_W * exact));
      gh = Math.max(1, Math.round(VIEW_H * exact));
      const n = Math.max(1, Math.ceil(exact));
      if (!this.mid || this.mid.width !== VIEW_W * n) {
        this.mid = document.createElement("canvas");
        this.mid.width = VIEW_W * n;
        this.mid.height = VIEW_H * n;
        this.midCtx = this.mid.getContext("2d")!;
      }
    }
    this.viewport = { x: Math.floor((W - gw) / 2), y: Math.floor((H - gh) / 2), w: gw, h: gh };
    this.present();
  }
}

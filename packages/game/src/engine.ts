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

export class Engine {
  /** Internal 640×360 buffer every scene draws into. */
  readonly view: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** The on-screen canvas: an integer multiple of the view in device pixels. */
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
    this.screen.style.imageRendering = "pixelated";
    this.screen.style.display = "block";
    this.screen.style.touchAction = "none";
    this.screenCtx = this.screen.getContext("2d")!;
    host.appendChild(this.screen);

    this.input = new Input(this.screen);
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
    const c = this.screenCtx;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.view, 0, 0, this.screen.width, this.screen.height);
  }

  /** Largest integer scale that fits the host, measured in device pixels (crisp at any DPR). */
  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.host.clientWidth * dpr, h = this.host.clientHeight * dpr;
    this.scale = Math.max(1, Math.floor(Math.min(w / VIEW_W, h / VIEW_H)));
    this.screen.width = VIEW_W * this.scale;
    this.screen.height = VIEW_H * this.scale;
    this.screen.style.width = `${this.screen.width / dpr}px`;
    this.screen.style.height = `${this.screen.height / dpr}px`;
    this.present();
  }
}

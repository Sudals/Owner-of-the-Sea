// One-button control (design §4-1): click / touch / Space / Enter / gamepad A all drive the
// same "action" button. Edges are counted between fixed steps so a quick tap is never lost.

export class Input {
  /** Button currently held. */
  down = false;
  /** Went down since the previous step. */
  pressed = false;
  /** Went up since the previous step. */
  released = false;
  /** Pointer position in layout pixels (the 640×360 space every scene lays out in; a wide
   *  scene's view reaches past it on its sides), or null when unknown. */
  pointer: { x: number; y: number } | null = null;
  /** Where the pointer went down since the previous step (menus hit-test this), or null. */
  clicked: { x: number; y: number } | null = null;
  /** Every pointer-down since the previous step, oldest first (fast double clicks on "+"). */
  clicks: { x: number; y: number }[] = [];
  /** Mouse wheel notches since the previous step (+ = down). */
  wheel = 0;

  private raw = false;
  private presses = 0;
  private releases = 0;
  private sources = new Set<string>();
  private keyHits = new Map<string, number>();
  private keyHitsStep = new Map<string, number>();
  private padWasDown = false;
  private padHeld = new Set<number>();
  private keysDown = new Set<string>();
  private stick = { x: 0, y: 0 };
  private pendingClicks: { x: number; y: number }[] = [];
  private pendingWheel = 0;
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly target: HTMLElement,
    /** The game's rectangle inside `target` (CSS px; the canvas may be larger than the game),
     *  the view's size in game pixels and where the 640×360 layout sits in it. */
    private readonly viewRect?: () => { x: number; y: number; w: number; h: number; vw: number; vh: number; ox: number; oy: number },
  ) {
    const on = <K extends keyof WindowEventMap>(el: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(target, "pointerdown", (e) => {
      e.preventDefault();
      target.setPointerCapture?.(e.pointerId);
      this.track(e);
      if (this.pointer) this.pendingClicks.push(this.pointer);
      this.setSource(`p${e.pointerId}`, true);
    });
    on(target, "pointermove", (e) => this.track(e));
    on(target, "pointerup", (e) => this.setSource(`p${e.pointerId}`, false));
    on(target, "pointercancel", (e) => this.setSource(`p${e.pointerId}`, false));
    on(target, "contextmenu", (e) => e.preventDefault());
    on(target, "wheel", (e) => {
      e.preventDefault();
      this.pendingWheel += Math.sign(e.deltaY);
    }, { passive: false });
    on(window, "keydown", (e) => {
      // Enter that commits a Hangul IME composition is not a button press
      if (e.isComposing || e.keyCode === 229) return;
      if (!(e.target instanceof HTMLInputElement)) this.keysDown.add(e.code);
      if (!e.repeat || e.code.startsWith("Arrow")) this.keyHits.set(e.code, (this.keyHits.get(e.code) ?? 0) + 1);
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (!e.repeat) this.setSource(`k${e.code}`, true);
      }
    });
    on(window, "keyup", (e) => {
      this.keysDown.delete(e.code);
      if (e.code === "Space" || e.code === "Enter") this.setSource(`k${e.code}`, false);
    });
    // losing focus must never leave the line reeling forever
    on(window, "blur", () => {
      this.keysDown.clear();
      for (const s of [...this.sources]) this.setSource(s, false);
    });
  }

  /** Called once per fixed step, before the scene updates. */
  update(): void {
    this.pollGamepad();
    this.pressed = this.presses > 0;
    this.released = this.releases > 0;
    this.presses = 0;
    this.releases = 0;
    this.down = this.raw;
    this.keyHitsStep = this.keyHits;
    this.keyHits = new Map();
    this.clicks = this.pendingClicks;
    this.clicked = this.clicks[0] ?? null;
    this.pendingClicks = [];
    this.wheel = this.pendingWheel;
    this.pendingWheel = 0;
  }

  /** How many times a key (KeyboardEvent.code) went down since the previous step — menus and dev
   *  shortcuts. Arrow keys count auto-repeat; the gamepad d-pad and B arrive as Arrow keys / Escape. */
  hit(code: string): number {
    return this.keyHitsStep.get(code) ?? 0;
  }

  /** Is a key (KeyboardEvent.code) held right now? */
  held(code: string): boolean {
    return this.keysDown.has(code);
  }

  /** Steering vector from arrows/WASD and the gamepad's left stick: x right, y down, length ≤ 1. */
  axis(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.held("ArrowLeft") || this.held("KeyA")) x -= 1;
    if (this.held("ArrowRight") || this.held("KeyD")) x += 1;
    if (this.held("ArrowUp") || this.held("KeyW")) y -= 1;
    if (this.held("ArrowDown") || this.held("KeyS")) y += 1;
    if (this.padHeld.has(14)) x -= 1;
    if (this.padHeld.has(15)) x += 1;
    if (this.padHeld.has(12)) y -= 1;
    if (this.padHeld.has(13)) y += 1;
    x += this.stick.x;
    y += this.stick.y;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  destroy(): void {
    for (const f of this.off) f();
  }

  private setSource(id: string, isDown: boolean): void {
    if (isDown) this.sources.add(id);
    else this.sources.delete(id);
    const now = this.sources.size > 0;
    if (now && !this.raw) this.presses++;
    if (!now && this.raw) this.releases++;
    this.raw = now;
  }

  /** Map the canvas box onto the view, then into layout coordinates, whatever its CSS size. */
  private track(e: PointerEvent): void {
    const r = this.target.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const v = this.viewRect?.() ?? { x: 0, y: 0, w: r.width, h: r.height, vw: 640, vh: 360, ox: 0, oy: 0 };
    this.pointer = { x: ((e.clientX - r.left - v.x) / v.w) * v.vw - v.ox, y: ((e.clientY - r.top - v.y) / v.h) * v.vh - v.oy };
  }

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    let isDown = false;
    const held = new Set<number>();
    this.stick = { x: 0, y: 0 };
    for (const p of pads) {
      if (!p) continue;
      if (p.buttons[0]?.pressed) isDown = true;
      const sx = p.axes[0] ?? 0, sy = p.axes[1] ?? 0;
      if (Math.hypot(sx, sy) > 0.25) this.stick = { x: sx, y: sy };
      for (const b of PAD_KEYS.keys()) if (p.buttons[b]?.pressed) held.add(b);
    }
    if (isDown !== this.padWasDown) this.setSource("pad", isDown);
    this.padWasDown = isDown;
    for (const b of held) if (!this.padHeld.has(b)) this.keyHits.set(PAD_KEYS.get(b)!, (this.keyHits.get(PAD_KEYS.get(b)!) ?? 0) + 1);
    this.padHeld = held;
  }
}

/** Standard-mapping gamepad buttons → the keyboard codes menus already listen for. */
const PAD_KEYS = new Map<number, string>([
  [1, "Escape"], // B
  [9, "Escape"], // Start
  [12, "ArrowUp"],
  [13, "ArrowDown"],
  [14, "ArrowLeft"],
  [15, "ArrowRight"],
]);

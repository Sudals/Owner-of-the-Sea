// One-button control (design §4-1): click / touch / Space / Enter / gamepad A all drive the
// same "action" button. Edges are counted between fixed steps so a quick tap is never lost.

export class Input {
  /** Button currently held. */
  down = false;
  /** Went down since the previous step. */
  pressed = false;
  /** Went up since the previous step. */
  released = false;
  /** Pointer position in view pixels (640×360 space), or null when unknown. */
  pointer: { x: number; y: number } | null = null;
  /** Where the pointer went down since the previous step (menus hit-test this), or null. */
  clicked: { x: number; y: number } | null = null;
  /** Every pointer-down since the previous step, oldest first (fast double clicks on "+"). */
  clicks: { x: number; y: number }[] = [];

  private raw = false;
  private presses = 0;
  private releases = 0;
  private sources = new Set<string>();
  private keyHits = new Map<string, number>();
  private keyHitsStep = new Map<string, number>();
  private padWasDown = false;
  private padHeld = new Set<number>();
  private pendingClicks: { x: number; y: number }[] = [];
  private readonly off: (() => void)[] = [];

  constructor(private readonly target: HTMLElement) {
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
    on(window, "keydown", (e) => {
      // Enter that commits a Hangul IME composition is not a button press
      if (e.isComposing || e.keyCode === 229) return;
      if (!e.repeat || e.code.startsWith("Arrow")) this.keyHits.set(e.code, (this.keyHits.get(e.code) ?? 0) + 1);
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (!e.repeat) this.setSource(`k${e.code}`, true);
      }
    });
    on(window, "keyup", (e) => {
      if (e.code === "Space" || e.code === "Enter") this.setSource(`k${e.code}`, false);
    });
    // losing focus must never leave the line reeling forever
    on(window, "blur", () => {
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
  }

  /** How many times a key (KeyboardEvent.code) went down since the previous step — menus and dev
   *  shortcuts. Arrow keys count auto-repeat; the gamepad d-pad and B arrive as Arrow keys / Escape. */
  hit(code: string): number {
    return this.keyHitsStep.get(code) ?? 0;
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

  /** Map the canvas box onto the 640×360 view, whatever its CSS size. */
  private track(e: PointerEvent): void {
    const r = this.target.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.pointer = { x: ((e.clientX - r.left) / r.width) * 640, y: ((e.clientY - r.top) / r.height) * 360 };
  }

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    let isDown = false;
    const held = new Set<number>();
    for (const p of pads) {
      if (!p) continue;
      if (p.buttons[0]?.pressed) isDown = true;
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

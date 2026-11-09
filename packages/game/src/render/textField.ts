import type { Engine } from "../engine";

// A real <input> laid over the canvas so typing works everywhere a browser does — Hangul IME
// composition, paste, mobile keyboards. The element is transparent; the scene draws the text
// in pixel style from `value`/`caret`, so the field looks like the rest of the canvas UI.

let styleAdded = false;
function addStyle(): void {
  if (styleAdded) return;
  styleAdded = true;
  const st = document.createElement("style");
  st.textContent = `.sea-text{position:fixed;margin:0;padding:0 2px;border:0;outline:0;background:transparent;color:transparent;caret-color:transparent;font-family:Galmuri11,monospace;z-index:2}.sea-text::selection{background:transparent}`;
  document.head.appendChild(st);
}

export class TextField {
  readonly el: HTMLInputElement;
  private box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private readonly engine: Engine,
    opts: { maxLength?: number; inputMode?: "text" | "latin"; label: string },
  ) {
    addStyle();
    const el = document.createElement("input");
    el.className = "sea-text";
    el.type = "text";
    el.autocomplete = "off";
    el.spellcheck = false;
    el.setAttribute("aria-label", opts.label);
    el.setAttribute("autocapitalize", opts.inputMode === "latin" ? "characters" : "off");
    if (opts.maxLength) el.maxLength = opts.maxLength;
    document.body.appendChild(el);
    this.el = el;
  }

  get value(): string {
    return this.el.value;
  }

  set value(v: string) {
    this.el.value = v;
  }

  /** Caret index into `value` (end of text when unknown). */
  get caret(): number {
    return this.el.selectionStart ?? this.el.value.length;
  }

  get focused(): boolean {
    return document.activeElement === this.el;
  }

  focus(): void {
    if (!this.focused) this.el.focus({ preventScroll: true });
  }

  /** Lay the element over view rect (x, y, w, h) — called every render, so resizes just work. */
  place(x: number, y: number, w: number, h: number): void {
    const b = this.box;
    // where the game sits in the window (it can be smaller than the canvas, or scaled by any factor)
    const p = this.engine.toPage(x, y);
    const key = `${p.x},${p.y},${p.k}`;
    if (b.x === x && b.y === y && b.w === w && b.h === h && this.el.dataset.at === key) return;
    this.box = { x, y, w, h };
    const k = p.k;
    Object.assign(this.el.style, {
      left: `${p.x}px`,
      top: `${p.y}px`,
      width: `${w * k}px`,
      height: `${h * k}px`,
      fontSize: `${12 * k}px`,
    });
    this.el.dataset.at = key;
  }

  destroy(): void {
    this.el.remove();
  }
}

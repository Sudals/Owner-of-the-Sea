import { lutHex } from "../assets";
import type { Engine } from "../engine";
import { button, dim, inRect, panel, text } from "../render/ui";

// A dialog that sits over whatever scene is running (save on exit, crash recovery — design
// §11-2, §11-5). While it is open the scene doesn't step. Mouse, arrows + Enter, gamepad.

export type ModalButton = { id: string; label: string };
export type ModalOptions = {
  title: string;
  lines: string[];
  buttons: ModalButton[];
  /** Button id that Escape picks (none = Escape does nothing). */
  cancel?: string;
  onPick: (id: string, modal: Modal) => void | Promise<void>;
};

const W = 340, BTN_H = 20;

export class Modal {
  sel = 0;
  /** Set while an action runs (e.g. saving): buttons are disabled and `note` shows. */
  busy = false;
  note: string | null = null;
  noteColor: string | undefined;

  constructor(readonly opts: ModalOptions) {}

  private layout() {
    const lines = this.opts.lines.length + (this.note ? 1 : 0);
    const h = 52 + lines * 18 + 34;
    const x = 320 - W / 2, y = Math.round(180 - h / 2);
    const n = this.opts.buttons.length;
    const bw = Math.min(140, Math.floor((W - 24 - (n - 1) * 8) / n));
    const total = n * bw + (n - 1) * 8;
    const buttons = this.opts.buttons.map((b, i) => ({ ...b, rect: { x: 320 - total / 2 + i * (bw + 8), y: y + h - 32, w: bw, h: BTN_H } }));
    return { x, y, h, buttons };
  }

  update(engine: Engine): void {
    if (this.busy) return;
    const input = engine.input;
    const { buttons } = this.layout();
    const d = input.hit("ArrowRight") + input.hit("ArrowDown") + input.hit("KeyD") - input.hit("ArrowLeft") - input.hit("ArrowUp") - input.hit("KeyA");
    if (d) this.sel = (this.sel + d + buttons.length * 4) % buttons.length;
    if (input.hit("Escape") && this.opts.cancel) return this.pick(this.opts.cancel);
    if (input.clicked) {
      const i = buttons.findIndex((b) => inRect(input.clicked, b.rect));
      if (i >= 0) this.pick(buttons[i]!.id);
      return;
    }
    if (input.pressed) this.pick(buttons[this.sel]!.id);
  }

  private pick(id: string): void {
    void Promise.resolve(this.opts.onPick(id, this)).catch((e: unknown) => {
      this.busy = false;
      this.note = e instanceof Error ? e.message : String(e);
      this.noteColor = lutHex("red2");
    });
  }

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const { x, y, h, buttons } = this.layout();
    dim(ctx, 0.55);
    panel(ctx, assets, "panel_paper", x, y, W, h);
    text(ctx, this.opts.title, 320, y + 14, { align: "center", color: lutHex("red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });
    this.opts.lines.forEach((l, i) => text(ctx, l, 320, y + 38 + i * 18, { align: "center", color: lutHex("ink"), shadow: null }));
    if (this.note) text(ctx, this.note, 320, y + 38 + this.opts.lines.length * 18, { align: "center", color: this.noteColor ?? lutHex("gray1"), shadow: null });
    buttons.forEach((b, i) => button(ctx, assets, this.busy ? "disabled" : i === this.sel ? "hover" : "normal", b.label, b.rect.x, b.rect.y, b.rect.w, b.rect.h));
  }
}

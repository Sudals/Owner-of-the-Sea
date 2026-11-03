import { NAME_MAX, NAME_RE, normalizeRecoveryCode, RECOVERY_RE } from "@sea/shared";
import type { LutName } from "@sea/sprites/palette";
import { lutHex } from "../assets";
import type { Profile } from "../backend";
import type { Engine, Scene } from "../engine";
import type { Game } from "../game";
import { pixelCurve, pixelLine } from "../render/pixels";
import { TextField } from "../render/textField";
import { button, dim, gaugeH, inRect, panel, text, textWidth, type ButtonState } from "../render/ui";
import { drawSurface } from "../render/water";
import { Clock } from "../systems/timeOfDay";

// 로비 (design §7-3): the first screen. 빨간등대 선착장 at sunset, the title, and
//   이어하기 / 새 게임 / 설정 / 종료.
// Mouse, touch, arrows + Enter/Space, and a gamepad all work. Typing (the name, the
// 이어하기 코드) goes through a transparent DOM <input> so Hangul IME works (render/textField).

type Rect = { x: number; y: number; w: number; h: number };
type Item = { id: string; label: string; rect: Rect; enabled?: boolean; kind?: "button" | "slider" | "row" };

type ConfirmKind = "new" | "forget" | "quit";
export type TitleState =
  | { k: "menu" }
  | { k: "name"; error: string | null; busy: boolean }
  | { k: "code"; error: string | null; busy: boolean }
  | { k: "confirm"; kind: ConfirmKind; lines: string[]; ok: string; back: "menu" | "settings" }
  | { k: "notice"; title: string; lines: string[]; big?: string; back: "menu" | "settings" }
  | { k: "settings" }
  | { k: "starting"; t: number };

const HOUR = 17.6; // just before sunset: the sun sits low over the sea, right of the title
const FEET_ROW = 47;
const ROD_LEN = 34;
const FLOAT_X = 404;
const TITLE_FONT = "bold 36px Galmuri11, monospace";
const BTN_H = 20;

const MENU: Rect = { x: 446, y: 140, w: 164, h: 124 };
const DIALOG: Rect = { x: 170, y: 92, w: 300, h: 168 };
const FIELD: Rect = { x: 214, y: 160, w: 212, h: 24 };
const SETTINGS_W = 320;

export class TitleScene implements Scene {
  state: TitleState = { k: "menu" };
  /** Selected item in the current state (keyboard / gamepad focus; the pointer moves it too). */
  sel = 0;
  private t = 0;
  private fadeIn = 0.6;
  private readonly clock = new Clock(HOUR);
  private field: TextField | null = null;
  private lastPointer = "";
  private lastText = "";
  private fish: { id: string; x: number; y: number; vx: number; phase: number }[] = [];
  private engine!: Engine;

  constructor(private readonly game: Game) {}

  get profile(): Profile | null {
    return this.game.backend.profile();
  }

  enter(engine: Engine): void {
    this.engine = engine;
    const m = engine.assets.meta;
    const ids = ["mackerel", "sardine", "black_seabream", "halfbeak", "red_seabream", "anchovy"].filter((id) => engine.assets.has("fish", id));
    this.fish = ids.map((id, i) => ({
      id,
      x: m.dock.bedFrom + 60 + ((i * 97) % 220),
      y: m.waterline + 22 + ((i * 23) % 60),
      vx: (8 + ((i * 7) % 10)) * (i % 2 ? -1 : 1),
      phase: i * 1.3,
    }));
    this.sel = this.firstEnabled();
    // a crash or a closed tab left unsaved progress (design §11-5)
    this.game.offerRecovery();
  }

  exit(): void {
    this.closeField();
  }

  // ── layout ─────────────────────────────────────────────────────────────────

  /** Selectable items of the current state, in focus order. Used by update and render alike. */
  private items(): Item[] {
    const s = this.state;
    const p = this.profile;
    switch (s.k) {
      case "menu":
        return this.menuItems();
      case "name":
      case "code": {
        const y = DIALOG.y + DIALOG.h - 34;
        return [
          { id: "submit", label: s.k === "name" ? "시작" : "불러오기", rect: { x: 320 - 84, y, w: 76, h: BTN_H }, enabled: !s.busy },
          { id: "cancel", label: "취소", rect: { x: 328, y, w: 76, h: BTN_H }, enabled: !s.busy },
        ];
      }
      case "confirm": {
        const y = DIALOG.y + DIALOG.h - 34;
        return [
          { id: "ok", label: s.ok, rect: { x: 320 - 84, y, w: 76, h: BTN_H } },
          { id: "cancel", label: "취소", rect: { x: 328, y, w: 76, h: BTN_H } },
        ];
      }
      case "notice":
        return [{ id: "ok", label: "확인", rect: { x: 320 - 38, y: DIALOG.y + DIALOG.h - 34, w: 76, h: BTN_H } }];
      case "settings": {
        const S = this.settingsRect();
        const x = S.x + 16, w = S.w - 32;
        let y = S.y + 40;
        const row = (h = 22) => {
          const r = { x, y, w, h };
          y += h + 8;
          return r;
        };
        const list: Item[] = [
          { id: "bgm", label: "배경음", rect: row(), kind: "slider" },
          { id: "sfx", label: "효과음", rect: row(), kind: "slider" },
          { id: "fullscreen", label: "전체 화면", rect: row(), kind: "row" },
        ];
        if (p?.recoveryCode) list.push({ id: "showCode", label: "이어하기 코드", rect: row(), kind: "row" });
        if (p) list.push({ id: "forget", label: "이 기기의 기록", rect: row(), kind: "row" });
        list.push({ id: "close", label: "닫기", rect: { x: 320 - 38, y: S.y + S.h - 32, w: 76, h: BTN_H } });
        return list;
      }
      case "starting":
        return [];
    }
  }

  /** The settings panel grows with its rows (the code / forget rows only exist with a save). */
  private settingsRect(): Rect {
    const p = this.profile;
    const rows = 3 + (p?.recoveryCode ? 1 : 0) + (p ? 1 : 0);
    const h = 40 + rows * 30 + 62;
    return { x: 320 - SETTINGS_W / 2, y: Math.round(180 - h / 2), w: SETTINGS_W, h };
  }

  private menuItems(): Item[] {
    const x = MENU.x + 12, w = MENU.w - 24;
    const row = (i: number) => ({ x, y: MENU.y + 12 + i * 26, w, h: BTN_H });
    return [
      { id: "continue", label: "이어하기", rect: row(0), enabled: !!this.profile || !!this.game.backend.recover },
      { id: "new", label: "새 게임", rect: row(1) },
      { id: "settings", label: "설정", rect: row(2) },
      { id: "quit", label: "종료", rect: row(3) },
    ];
  }

  /** The value control inside a settings row (right half). */
  private control(r: Rect): { minus: Rect; gauge: Rect; plus: Rect; whole: Rect } {
    const x = r.x + 110;
    return {
      minus: { x, y: r.y + 1, w: 20, h: BTN_H },
      gauge: { x: x + 24, y: r.y + 7, w: r.w - 110 - 48, h: 8 },
      plus: { x: r.x + r.w - 20, y: r.y + 1, w: 20, h: BTN_H },
      whole: { x, y: r.y + 1, w: r.w - 110, h: BTN_H },
    };
  }

  private firstEnabled(): number {
    const i = this.items().findIndex((it) => it.enabled !== false);
    return Math.max(0, i);
  }

  private go(next: TitleState): void {
    this.state = next;
    this.sel = this.firstEnabled();
    if (next.k === "name" || next.k === "code") {
      if (!this.field) {
        this.field = new TextField(this.engine, next.k === "name" ? { label: "이름", maxLength: 24 } : { label: "이어하기 코드", maxLength: 24, inputMode: "latin" });
        this.field.focus();
      }
    } else this.closeField();
  }

  private closeField(): void {
    this.field?.destroy();
    this.field = null;
  }

  // ── update ─────────────────────────────────────────────────────────────────

  update(dt: number, engine: Engine): void {
    this.t += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    this.swim(dt);
    const s = this.state;
    if (s.k === "starting") {
      s.t += dt;
      if (s.t >= 0.45) this.game.play();
      return;
    }

    const input = engine.input;
    const items = this.items();
    const typing = s.k === "name" || s.k === "code";

    // pointer hover moves the focus (only when the pointer actually moved)
    const pkey = input.pointer ? `${Math.round(input.pointer.x)},${Math.round(input.pointer.y)}` : "";
    if (pkey !== this.lastPointer) {
      this.lastPointer = pkey;
      const i = items.findIndex((it) => it.enabled !== false && inRect(input.pointer, it.rect));
      if (i >= 0) this.sel = i;
    }

    const step = (d: number) => {
      if (!items.length) return;
      for (let n = 1; n <= items.length; n++) {
        const i = (this.sel + d * n + items.length * n) % items.length;
        if (items[i]!.enabled !== false) return void (this.sel = i);
      }
    };
    if (!typing) {
      const down = input.hit("ArrowDown") + input.hit("KeyS");
      const up = input.hit("ArrowUp") + input.hit("KeyW");
      for (let i = 0; i < down; i++) step(1);
      for (let i = 0; i < up; i++) step(-1);
      const right = input.hit("ArrowRight") + input.hit("KeyD"), left = input.hit("ArrowLeft") + input.hit("KeyA");
      const cur = items[this.sel];
      if (s.k === "settings" && cur?.kind === "slider") {
        if (right || left) this.adjust(cur!.id as "bgm" | "sfx", right - left);
      } else if (s.k !== "menu" && s.k !== "settings") {
        // dialog buttons sit side by side
        for (let i = 0; i < right; i++) step(1);
        for (let i = 0; i < left; i++) step(-1);
      }
    } else {
      this.field?.focus();
      const now = this.field?.value ?? "";
      if (now !== this.lastText) {
        this.lastText = now;
        if ((s.k === "name" || s.k === "code") && !s.busy) s.error = null;
      }
      if (input.hit("ArrowDown") || input.hit("Tab")) step(1);
      if (input.hit("ArrowUp")) step(-1);
    }

    if (input.hit("Escape")) return this.back();

    if (input.clicked) {
      const i = items.findIndex((it) => inRect(input.clicked, it.rect));
      if (i < 0) {
        if (typing && inRect(input.clicked, FIELD)) this.field?.focus();
        return;
      }
      const it = items[i]!;
      if (it.enabled === false) return;
      this.sel = i;
      if (it.kind === "slider") {
        const c = this.control(it.rect);
        const key = it.id as "bgm" | "sfx";
        for (const at of input.clicks) {
          if (inRect(at, c.minus)) this.adjust(key, -1);
          else if (inRect(at, c.plus)) this.adjust(key, 1);
          else if (inRect(at, { ...c.gauge, y: c.gauge.y - 6, h: c.gauge.h + 12 })) this.game.settings.set(key, Math.round(((at.x - c.gauge.x) / c.gauge.w) * 10));
        }
        return;
      }
      if (it.kind === "row" && !inRect(input.clicked, this.control(it.rect).whole)) return;
      return this.activate(it.id);
    }
    // keyboard / gamepad: Enter always; Space too, except while typing (it never submits a name)
    const kb = typing ? input.hit("Enter") > 0 || (input.pressed && !input.hit("Space") && !input.hit("Enter") && !input.clicked) : input.pressed;
    const cur = items[this.sel]; // after this step's arrow keys: "↓ + Enter" in one frame picks the new item
    if (kb && cur && cur.enabled !== false) this.activate(cur.id);
  }

  private adjust(key: "bgm" | "sfx", d: number): void {
    this.game.settings.set(key, this.game.settings.data[key] + d);
  }

  private back(): void {
    const s = this.state;
    switch (s.k) {
      case "name":
      case "code":
        if (!s.busy) this.go({ k: "menu" });
        return;
      case "confirm":
      case "notice":
        return this.go(s.back === "settings" ? { k: "settings" } : { k: "menu" });
      case "settings":
        return this.go({ k: "menu" });
      default:
        return;
    }
  }

  private activate(id: string): void {
    const s = this.state;
    const backend = this.game.backend;
    const p = this.profile;
    switch (s.k) {
      case "menu":
        if (id === "continue") {
          if (p) return void this.run(() => backend.resume());
          if (backend.recover) return this.go({ k: "code", error: null, busy: false });
          return;
        }
        if (id === "new") {
          if (!p) return this.go({ k: "name", error: null, busy: false });
          return this.go({
            k: "confirm",
            kind: "new",
            back: "menu",
            ok: "새로 시작",
            lines: backend.recover
              ? [`지금 기록(${p.name})이 이 기기에서 빠져요.`, "이어하기 코드가 있어야 다시 불러올 수 있어요."]
              : [`지금 기록(${p.name})이 지워져요.`, "새로 시작할까요?"],
          });
        }
        if (id === "settings") return this.go({ k: "settings" });
        if (id === "quit") {
          if (this.game.quit) return this.go({ k: "confirm", kind: "quit", back: "menu", ok: "종료", lines: ["게임을 종료할까요?"] });
          return this.go({ k: "notice", title: "종료", back: "menu", lines: ["웹에서는 브라우저 탭을 닫으면", "게임이 종료돼요."] });
        }
        return;
      case "name":
      case "code":
        if (id === "cancel") return this.back();
        if (id === "submit") return this.submit();
        return;
      case "confirm":
        if (id === "cancel") return this.back();
        if (s.kind === "new") return this.go({ k: "name", error: null, busy: false });
        if (s.kind === "quit") return this.game.quit?.();
        if (s.kind === "forget") {
          void backend.forget().then(
            () => this.go({ k: "settings" }),
            (e: unknown) => this.go({ k: "notice", title: "설정", back: "settings", lines: [errorText(e)] }),
          );
        }
        return;
      case "notice":
        return this.back();
      case "settings":
        if (id === "close") return this.go({ k: "menu" });
        if (id === "fullscreen") return void this.game.settings.toggleFullscreen();
        if (id === "showCode" && p?.recoveryCode)
          return this.go({ k: "notice", title: "이어하기 코드", back: "settings", big: p.recoveryCode, lines: ["다른 PC의 로비 → 이어하기에서", "이 코드를 넣으면 같은 기록으로 이어져요."] });
        if (id === "forget" && p)
          return this.go({
            k: "confirm",
            kind: "forget",
            back: "settings",
            ok: "지우기",
            lines: backend.recover ? [`이 기기에서 ${p.name}의 기록을 지울까요?`, "이어하기 코드로 다시 불러올 수 있어요."] : [`${p.name}의 기록을 지울까요?`, "되돌릴 수 없어요."],
          });
        return;
    }
  }

  private submit(): void {
    const s = this.state;
    if ((s.k !== "name" && s.k !== "code") || s.busy || !this.field) return;
    const backend = this.game.backend;
    if (s.k === "name") {
      const name = this.field.value.trim();
      if (!NAME_RE.test(name)) {
        s.error = name.length > NAME_MAX ? `이름은 ${NAME_MAX}자까지예요.` : "2~12자의 한글, 영문, 숫자로 정해 주세요.";
        return;
      }
      s.error = null;
      s.busy = true;
      void this.run(() => backend.startNew(name), (e) => {
        s.busy = false;
        s.error = errorText(e);
      });
    } else {
      const code = normalizeRecoveryCode(this.field.value);
      if (!RECOVERY_RE.test(code)) {
        s.error = "16자리 코드를 확인해 주세요.";
        return;
      }
      s.error = null;
      s.busy = true;
      void this.run(() => backend.recover!(code), (e) => {
        s.busy = false;
        s.error = errorText(e);
      });
    }
  }

  /** Run a profile action, then fade out into the game. */
  private async run(action: () => Promise<Profile>, onError?: (e: unknown) => void): Promise<void> {
    try {
      await action();
      this.closeField();
      this.state = { k: "starting", t: 0 };
    } catch (e) {
      console.warn("[title]", e);
      if (onError) onError(e);
      else this.go({ k: "notice", title: "이어하기", back: "menu", lines: [errorText(e)] });
    }
  }

  private swim(dt: number): void {
    const m = this.engine.assets.meta;
    for (const f of this.fish) {
      f.x += f.vx * dt;
      if ((f.vx < 0 && f.x < m.dock.bedFrom + 50) || (f.vx > 0 && f.x > 630)) f.vx = -f.vx;
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const { a, b, t } = this.clock.blend();
    const lut = this.clock.lut();
    const m = assets.meta;
    const wl = m.waterline;

    ctx.globalAlpha = 1;
    ctx.drawImage(assets.background("bg_dock", a), 0, 0);
    if (t > 0) {
      ctx.globalAlpha = t;
      ctx.drawImage(assets.background("bg_dock", b), 0, 0);
      ctx.globalAlpha = 1;
    }
    const sun = this.clock.sun();
    if (sun) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 640, m.horizon);
      ctx.clip();
      assets.draw(ctx, "sky", "sun", sun.x - 16, sun.y - 16, { lut });
      ctx.restore();
    }
    for (const f of this.fish) assets.draw(ctx, "fish", f.id, Math.round(f.x), f.y + Math.round(Math.sin(this.t * 1.5 + f.phase) * 2), { flipX: f.vx < 0, lut });
    this.drawAngler(ctx, lut);
    drawSurface(ctx, this.t, wl, m.dock.shoreX - 30, lut);
    const bob = Math.round(Math.sin(this.t * 2.1) * 1);
    assets.draw(ctx, "props", "float_idle", FLOAT_X - 2, wl - 6 + bob, { lut });

    this.drawTitle(ctx);

    const s = this.state;
    const items = this.items();
    if (s.k === "menu" || s.k === "starting") this.drawMenu(ctx, s.k === "menu" ? items : []);
    else {
      this.drawMenu(ctx, []);
      dim(ctx, 0.5);
      if (s.k === "settings") this.drawSettings(ctx, items);
      else this.drawDialog(ctx, items);
    }

    // build / hint lines
    text(ctx, this.game.mode === "demo" ? "체험판 v0.1" : "v0.1", 6, 344, { color: lutHex("foam2") });
    if (s.k === "menu") text(ctx, "↑↓ 고르기 · Enter 결정", 634, 344, { align: "right", color: lutHex("foam2") });

    const fade = s.k === "starting" ? Math.min(1, s.t / 0.4) : this.fadeIn / 0.6;
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = lutHex("ink");
      ctx.fillRect(0, 0, 640, 360);
      ctx.globalAlpha = 1;
    }
  }

  private drawAngler(ctx: CanvasRenderingContext2D, lut: LutName): void {
    const assets = this.engine.assets;
    const [fx, fy] = assets.meta.dock.stand;
    const name = `wait_${Math.floor(this.t * 1.2) % 2}`;
    const fr = assets.frame("angler", name);
    const x = fx - 16, y = fy - FEET_ROW;
    assets.draw(ctx, "angler", name, x, y, { lut });
    const hand = fr.anchor?.hand ?? [24, 30];
    const angle = ((fr.anchor?.rod?.[0] ?? -50) * Math.PI) / 180;
    const hx = x + hand[0], hy = y + hand[1];
    const tipX = hx + Math.cos(angle) * ROD_LEN, tipY = hy + Math.sin(angle) * ROD_LEN;
    const butt = lutHex("bark1", lut), blank = lutHex("wood", lut), tipC = lutHex("coral", lut);
    pixelLine(ctx, hx - Math.cos(angle) * 3, hy - Math.sin(angle) * 3, tipX, tipY, (i, n) => (i < 7 ? butt : i >= n - 1 ? tipC : blank));
    const wl = assets.meta.waterline;
    pixelCurve(ctx, tipX, tipY, (tipX + FLOAT_X) / 2, wl + 6, FLOAT_X, wl - 4, lutHex("foam1", lut));
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    const title = "바다의 주인";
    const x = 320, y = 26;
    const o = { font: TITLE_FONT, align: "center" as const, shadow: null };
    // chunky 3px outline + a deep drop shadow, so the 3× glyphs keep their pixel look
    for (const [dx, dy] of [[0, 6], [3, 6], [-3, 6]] as const) text(ctx, title, x + dx, y + dy, { ...o, color: lutHex("red1") });
    for (let dy = -3; dy <= 3; dy += 3) for (let dx = -3; dx <= 3; dx += 3) if (dx || dy) text(ctx, title, x + dx, y + dy, { ...o, color: lutHex("ink") });
    text(ctx, title, x, y, { ...o, color: lutHex("sand2") });
    // a lighter top half, like a sunset glint on the letters
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, 640, 15);
    ctx.clip();
    text(ctx, title, x, y, { ...o, color: lutHex("white") });
    ctx.restore();
    text(ctx, "바다는 누구의 것인가", x, y + 50, { align: "center", color: lutHex("white") });
  }

  private drawMenu(ctx: CanvasRenderingContext2D, items: Item[]): void {
    const assets = this.engine.assets;
    panel(ctx, assets, "panel_wood", MENU.x, MENU.y, MENU.w, MENU.h);
    const list = items.length ? items : this.menuItems();
    list.forEach((it, i) => {
      const state: ButtonState = it.enabled === false ? "disabled" : items.length && i === this.sel ? (this.engine.input.down && inRect(this.engine.input.pointer, it.rect) ? "pressed" : "hover") : "normal";
      button(ctx, assets, state, it.label, it.rect.x, it.rect.y, it.rect.w, it.rect.h);
      if (state === "hover") text(ctx, "▶", it.rect.x - 9, it.rect.y + 4, { color: lutHex("yellow") });
    });
    const p = this.profile;
    const note = p ? `${p.name}의 기록 · ${shortDate(p.lastPlayedAt)}` : this.game.backend.recover ? "다른 PC 기록은 이어하기 → 코드" : "아직 기록이 없어요";
    text(ctx, note, MENU.x + MENU.w / 2, MENU.y + MENU.h + 6, { align: "center", color: lutHex("foam2") });
  }

  private drawDialog(ctx: CanvasRenderingContext2D, items: Item[]): void {
    const assets = this.engine.assets;
    const s = this.state;
    const D = DIALOG;
    panel(ctx, assets, "panel_paper", D.x, D.y, D.w, D.h);
    const ink = lutHex("ink"), soft = lutHex("gray1");
    const heading = (str: string) => text(ctx, str, 320, D.y + 14, { align: "center", color: lutHex("red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });

    if (s.k === "name" || s.k === "code") {
      heading(s.k === "name" ? "새 게임" : "이어하기 코드");
      text(ctx, s.k === "name" ? "선장의 이름을 정해 주세요" : "다른 PC에서 받은 16자리 코드를 넣어 주세요", 320, D.y + 36, { align: "center", color: ink, shadow: null });
      text(ctx, s.k === "name" ? "2~12자 · 한글, 영문, 숫자" : "예: 7KQ2-M9XA-04TD-R3HB", 320, D.y + 52, { align: "center", color: soft, shadow: null });
      this.drawField(ctx, s.k === "code");
      const msg = s.busy ? "잠시만요…" : s.error;
      const fallback = s.k === "name" ? (this.game.mode === "full" ? "순위표에 이 이름이 표시돼요" : "") : "";
      if (msg || fallback) text(ctx, msg ?? fallback, 320, FIELD.y + FIELD.h + 8, { align: "center", color: msg && !s.busy ? lutHex("red2") : soft, shadow: null });
    } else if (s.k === "confirm") {
      heading(s.kind === "quit" ? "종료" : s.kind === "forget" ? "기록 지우기" : "새 게임");
      s.lines.forEach((l, i) => text(ctx, l, 320, D.y + 48 + i * 18, { align: "center", color: ink, shadow: null }));
    } else if (s.k === "notice") {
      heading(s.title);
      let y = D.y + 40;
      if (s.big) {
        text(ctx, s.big, 320, y, { align: "center", color: lutHex("navy"), shadow: null, font: "bold 24px Galmuri11, monospace" });
        y += 40;
      }
      s.lines.forEach((l, i) => text(ctx, l, 320, y + i * 18, { align: "center", color: ink, shadow: null }));
    }
    this.drawButtons(ctx, items);
  }

  private drawField(ctx: CanvasRenderingContext2D, upper: boolean): void {
    const assets = this.engine.assets;
    const f = this.field;
    panel(ctx, assets, "panel_sea", FIELD.x, FIELD.y, FIELD.w, FIELD.h);
    f?.place(FIELD.x + 6, FIELD.y + 4, FIELD.w - 12, FIELD.h - 8);
    const raw = f?.value ?? "";
    const shown = upper ? raw.toUpperCase() : raw;
    const tx = FIELD.x + 9, ty = FIELD.y + 6;
    if (!shown) text(ctx, upper ? "XXXX-XXXX-XXXX-XXXX" : "이름", tx, ty, { color: lutHex("gray2"), shadow: null });
    else text(ctx, shown, tx, ty, { color: lutHex("white") });
    if (f?.focused && Math.floor(this.t * 2.5) % 2 === 0) {
      const cx = tx + Math.round(textWidth(ctx, shown.slice(0, f.caret)));
      ctx.fillStyle = lutHex("yellow");
      ctx.fillRect(cx, ty - 1, 1, 13);
    }
  }

  private drawButtons(ctx: CanvasRenderingContext2D, items: Item[]): void {
    const assets = this.engine.assets;
    items.forEach((it, i) => {
      if (it.kind === "slider" || it.kind === "row") return;
      const state: ButtonState = it.enabled === false ? "disabled" : i === this.sel ? "hover" : "normal";
      button(ctx, assets, state, it.label, it.rect.x, it.rect.y, it.rect.w, it.rect.h);
    });
  }

  private drawSettings(ctx: CanvasRenderingContext2D, items: Item[]): void {
    const assets = this.engine.assets;
    const S = this.settingsRect();
    const st = this.game.settings;
    const p = this.profile;
    panel(ctx, assets, "panel_paper", S.x, S.y, S.w, S.h);
    text(ctx, "설정", 320, S.y + 14, { align: "center", color: lutHex("red2"), shadow: null, font: "bold 12px Galmuri11, monospace" });
    items.forEach((it, i) => {
      if (it.kind !== "slider" && it.kind !== "row") return;
      const focus = i === this.sel;
      const r = it.rect;
      if (focus) {
        ctx.fillStyle = lutHex("sand1");
        ctx.globalAlpha = 0.35;
        ctx.fillRect(r.x - 4, r.y - 2, r.w + 8, r.h + 4);
        ctx.globalAlpha = 1;
      }
      text(ctx, it.label, r.x + 4, r.y + 5, { color: lutHex("ink"), shadow: null });
      const c = this.control(r);
      if (it.kind === "slider") {
        const v = st.data[it.id as "bgm" | "sfx"];
        button(ctx, assets, v <= 0 ? "disabled" : "normal", "-", c.minus.x, c.minus.y, c.minus.w, c.minus.h);
        gaugeH(ctx, assets, c.gauge.x, c.gauge.y, c.gauge.w, v / 10, lutHex("sea3"), [0.2, 0.4, 0.6, 0.8]);
        button(ctx, assets, v >= 10 ? "disabled" : "normal", "+", c.plus.x, c.plus.y, c.plus.w, c.plus.h);
      } else {
        const label = it.id === "fullscreen" ? (st.fullscreen ? "켬" : "끔") : it.id === "showCode" ? "코드 보기" : `${p?.name ?? ""} 지우기`;
        button(ctx, assets, focus ? "hover" : "normal", label, c.whole.x, c.whole.y, c.whole.w, c.whole.h);
      }
    });
    text(ctx, "설정은 이 기기에만 저장돼요 · 소리는 추후 적용", 320, S.y + S.h - 52, { align: "center", color: lutHex("gray1"), shadow: null });
    this.drawButtons(ctx, items);
  }
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 34 ? `${msg.slice(0, 33)}…` : msg || "잠시 후 다시 시도해 주세요.";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

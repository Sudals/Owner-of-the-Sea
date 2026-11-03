import { BARE_HOOK, dockFacing, ISLAND_BY_ID, ITEMS, START_ISLAND, TILE, type ItemId } from "@sea/shared";
import type { Assets } from "./assets";
import { lutHex } from "./assets";
import type { GameBackend, SaveOutcome, SaveReason, WorldState } from "./backend";
import type { Engine } from "./engine";
import { panel, text, textWidth } from "./render/ui";
import { FishingScene, type Spot } from "./scenes/fishing";
import { IslandScene, type ArrivalNote } from "./scenes/island";
import { SeaScene } from "./scenes/sea";
import { TitleScene } from "./scenes/title";
import { Settings } from "./settings";
import { Clock } from "./systems/timeOfDay";
import { Modal } from "./ui/modal";

export type BuildMode = "demo" | "full";

/** Manual saves are rate-limited (design §11-2: 저장 후 30초 쿨다운). */
export const MANUAL_SAVE_COOLDOWN_MS = 30_000;
/** HUD nags (blinks) after this long without a save (design §11-2). */
const NAG_AFTER_MS = 30 * 60_000;

/** What every scene shares: where saves go, the build, local settings, the world and its clock,
 *  and the scene changes between 로비 → 섬 ⇄ 바다 → 낚시 (design §7-3). */
export class Game {
  readonly settings = new Settings();
  /** One clock for every scene, so time keeps running across the island, the sea and fishing. */
  readonly clock = new Clock(9);
  private worldState: WorldState | null = null;
  private lastManual = -Infinity;
  private saving = false;
  /** Set between "저장 안 하고 나가기" and the next play(): nothing may write the world back. */
  private frozen = false;
  private flashMsg: { text: string; until: number; color?: string } | null = null;

  constructor(
    readonly engine: Engine,
    readonly backend: GameBackend,
    readonly mode: BuildMode,
    /** Closes the app (Electron). Null on the web — a tab can't close itself. */
    readonly quit: (() => void) | null,
    /** "0.2.0" — the lobby shows it. */
    readonly version = "",
  ) {}

  get world(): WorldState {
    return (this.worldState ??= this.backend.world());
  }

  /** Game hours since day 1, 00:00 — drives storms (shared/boat.ts). */
  get clockH(): number {
    return (this.world.day - 1) * 24 + this.clock.hours;
  }

  /** Advance the clock and the freshness clock (Economy.md §2-5: fish keep spoiling docked and
   *  while fishing, not only at sea). `_atSea` stays for callers; the clock runs everywhere. */
  tick(dt: number, _atSea: boolean): void {
    const before = this.clock.hours;
    this.clock.update(dt);
    if (this.clock.hours < before) this.world.day++;
    this.world.seaTime += dt;
  }

  // ── bait (Economy.md §4-1) ──
  private bait = "bait_worm";

  /** Baits on board (count > 0) in catalog order, then a bare hook. */
  baitChoices(): string[] {
    const inv = this.backend.inventory();
    const baits = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].kind === "bait" && (inv[id] ?? 0) > 0);
    return [...baits, BARE_HOOK];
  }

  /** The bait the next cast uses: the chosen one while it lasts, else the first on board, else a bare hook. */
  currentBait(): string {
    const c = this.baitChoices();
    return c.includes(this.bait) ? this.bait : c[0]!;
  }

  /** Put this bait on the hook (창고 · 장비 → Enter). */
  chooseBait(id: string): void {
    this.bait = id;
  }

  cycleBait(d: number): void {
    const c = this.baitChoices();
    const i = c.indexOf(this.currentBait());
    this.bait = c[(i + d + c.length * 4) % c.length]!;
  }

  /** Keep the world in the backend (local journal; a server sees it on the next commit). */
  save(): void {
    // only a world in play has a live clock; from the lobby (crash recovery) the journal is as-is
    if (this.frozen || !this.worldState) return;
    this.worldState.hour = this.clock.hours;
    this.backend.saveWorld(this.worldState);
  }

  // ── saving to the server (design §11) ──

  /** True when saves go to a server (full build); the demo keeps everything locally as it goes. */
  get remote(): boolean {
    return !!this.backend.commit;
  }

  hasUnsaved(): boolean {
    const s = this.backend.saveStatus?.();
    return !!s && (s.dirty || s.unsavedCaught > 0);
  }

  /** One server save: everything since the last one, in one call. */
  async commit(reason: SaveReason): Promise<SaveOutcome> {
    this.save();
    if (!this.backend.commit) return { ok: true, message: "저장했다" };
    if (this.saving) return { ok: false, message: "저장 중이에요" };
    this.saving = true;
    try {
      const r = await this.backend.commit(reason);
      // the confirmed state may have replaced the world object
      this.worldState = this.backend.world();
      return r;
    } finally {
      this.saving = false;
    }
  }

  /** 메뉴 → 저장, with the cooldown. Shows the result as a flash. */
  async manualSave(): Promise<void> {
    const wait = this.lastManual + MANUAL_SAVE_COOLDOWN_MS - Date.now();
    if (wait > 0) return this.flash(`${Math.ceil(wait / 1000)}초 뒤에 다시 저장할 수 있어요`, 2);
    this.flash("저장 중…", 10);
    const r = await this.commit("manual");
    if (r.ok) this.lastManual = Date.now();
    this.flash(r.message, 3, r.ok ? undefined : lutHex("coral"));
  }

  /** "마지막 저장 12분 전 · 미저장 3마리" (full build only), and whether to nag. */
  saveLabel(): { text: string; nag: boolean } | null {
    const s = this.backend.saveStatus?.();
    if (!s) return null;
    const ago = s.lastSavedAt === null ? null : Date.now() - s.lastSavedAt;
    const when = ago === null ? "저장 기록 없음" : ago < 60_000 ? "방금 저장" : `마지막 저장 ${Math.floor(ago / 60_000)}분 전`;
    const unsaved = s.unsavedCaught ? ` · 미저장 ${s.unsavedCaught}마리` : s.dirty ? " · 미저장 항해" : "";
    return { text: `${when}${unsaved}`, nag: (s.dirty || s.unsavedCaught > 0) && (ago === null || ago > NAG_AFTER_MS) };
  }

  /** 로비로 / 종료 (design §11-2): with unsaved progress, ask 저장하고 / 저장 안 하고 / 취소. */
  leave(kind: "lobby" | "quit"): void {
    const go = () => {
      // saved (or nothing to save): leaving must not write the world back and look unsaved again
      if (this.remote) this.frozen = true;
      if (kind === "lobby") this.toTitle();
      else this.quit?.();
    };
    if (!this.hasUnsaved()) return go();
    const what = kind === "quit" ? "종료" : "나가기";
    this.engine.modal = new Modal({
      title: kind === "quit" ? "종료" : "로비로",
      lines: ["저장하지 않은 기록이 있어요.", this.saveLabel()?.text ?? ""],
      buttons: [
        { id: "save", label: `저장하고 ${what}` },
        { id: "drop", label: `저장 안 하고 ${what}` },
        { id: "cancel", label: "취소" },
      ],
      cancel: "cancel",
      onPick: async (id, m) => {
        if (id === "cancel") return void (this.engine.modal = null);
        if (id === "save") {
          m.busy = true;
          m.note = "저장 중…";
          const r = await this.commit(kind === "quit" ? "exit" : "lobby");
          m.busy = false;
          if (!r.ok) {
            m.note = r.message;
            m.noteColor = lutHex("red2");
            return;
          }
        } else {
          this.backend.discardUnsaved?.();
          this.frozen = true; // scene exits must not write the dropped world back
        }
        this.engine.modal = null;
        go();
      },
    });
  }

  /** Crash / closed-tab leftovers (design §11-5): offer to save them now. */
  offerRecovery(): void {
    if (!this.backend.pendingRecovery?.()) return;
    this.engine.modal = new Modal({
      title: "복구",
      lines: ["저장되지 않은 기록이 있습니다.", "복구할까요?"],
      buttons: [
        { id: "recover", label: "복구하고 저장" },
        { id: "drop", label: "버리기" },
      ],
      onPick: async (id, m) => {
        if (id === "drop") {
          this.backend.discardUnsaved?.();
          this.engine.modal = null;
          return;
        }
        m.busy = true;
        m.note = "저장 중…";
        const r = await this.commit("recover");
        m.busy = false;
        if (!r.ok) {
          m.note = r.message;
          m.noteColor = lutHex("red2");
          return;
        }
        this.engine.modal = null;
        this.flash(r.message, 3);
      },
    });
  }

  flash(textLine: string, seconds = 2.5, color?: string): void {
    this.flashMsg = { text: textLine, until: performance.now() + seconds * 1000, color };
  }

  /** Scenes call this last in render: the save result banner. */
  drawFlash(ctx: CanvasRenderingContext2D, assets: Assets): void {
    const f = this.flashMsg;
    if (!f || performance.now() > f.until) return;
    const w = Math.min(620, Math.max(140, textWidth(ctx, f.text) + 28));
    panel(ctx, assets, "panel_sea", 320 - w / 2, 300, w, 26);
    text(ctx, f.text, 320, 307, { align: "center", color: f.color, maxW: w - 20 });
  }

  /** Small HUD line with the save status (full build). */
  drawSaveLabel(ctx: CanvasRenderingContext2D, assets: Assets, x: number, y: number, align: CanvasTextAlign = "left"): void {
    const l = this.saveLabel();
    if (!l) return;
    const blink = l.nag && Math.floor(performance.now() / 500) % 2 === 0;
    if (l.nag) assets.draw(ctx, "ui", "icon_save", align === "left" ? x : x - textWidth(ctx, l.text) - 18, y - 3);
    text(ctx, l.text, l.nag && align === "left" ? x + 18 : x, y, { align, color: blink ? lutHex("yellow") : lutHex("foam2") });
  }

  // ── scenes ──

  /** 로비 (design §7-3). */
  toTitle(): void {
    if (this.worldState) this.save();
    this.worldState = null;
    this.engine.setScene(new TitleScene(this));
  }

  /** After 이어하기 / 새 게임: back where the save left off — tied up at an island or out at sea. */
  play(): void {
    this.frozen = false;
    this.worldState = this.backend.world();
    this.clock.hours = this.world.hour;
    const at = this.world.at;
    if (at.kind === "island" && ISLAND_BY_ID[at.id]) this.engine.setScene(new IslandScene(this, at.id));
    else if (at.kind === "sea") this.engine.setScene(new SeaScene(this));
    else this.toIsland(START_ISLAND.id);
  }

  /** Tie up at an island. Arriving from the sea is an autosave event (design §11-2). */
  toIsland(id: string, note?: ArrivalNote): void {
    this.world.at = { kind: "island", id };
    this.save();
    this.engine.setScene(new IslandScene(this, id, note));
  }

  /** Cast off from an island (boat at its dock, bow away from the island) or return to the sea. */
  toSea(fromIsland?: string): void {
    if (fromIsland) {
      const isl = ISLAND_BY_ID[fromIsland]!;
      const [fx, fy] = dockFacing(isl);
      this.world.at = { kind: "sea", x: (isl.dock[0] + 0.5) * TILE, y: (isl.dock[1] + 0.5) * TILE, heading: Math.atan2(fy, fx) };
    }
    this.save();
    this.engine.setScene(new SeaScene(this));
  }

  toFishing(spot: Spot): void {
    this.save();
    this.engine.setScene(new FishingScene(spot, this.backend, this));
  }
}

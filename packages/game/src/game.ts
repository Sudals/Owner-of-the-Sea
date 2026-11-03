import type { GameBackend } from "./backend";
import type { Engine } from "./engine";
import { FishingScene, type Spot } from "./scenes/fishing";
import { TitleScene } from "./scenes/title";
import { Settings } from "./settings";

export type BuildMode = "demo" | "full";

/** What every scene shares: where saves go, the build, local settings, and scene changes. */
export class Game {
  readonly settings = new Settings();

  constructor(
    readonly engine: Engine,
    readonly backend: GameBackend,
    readonly mode: BuildMode,
    /** Closes the app (Electron). Null on the web — a tab can't close itself. */
    readonly quit: (() => void) | null,
    private readonly startSpot: Spot = { kind: "dock" },
  ) {}

  /** 로비 (design §7-3). */
  toTitle(): void {
    this.engine.setScene(new TitleScene(this));
  }

  /** Into the world after 이어하기 / 새 게임. Until the island hub (M5) and sea map (M6) land,
   *  that is the 빨간등대 dock fishing spot. */
  play(): void {
    this.engine.setScene(new FishingScene(this.startSpot, this.backend, this));
  }
}

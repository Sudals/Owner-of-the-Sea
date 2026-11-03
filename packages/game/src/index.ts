import { Assets } from "./assets";
import type { GameBackend } from "./backend";
import { Engine } from "./engine";
import { Game, type BuildMode } from "./game";

export { Assets, ATLASES, BACKGROUNDS, lutHex, type AtlasName, type BgName, type Frame } from "./assets";
export type { CastRecord, CastResult, FishingSession, GameBackend, Gear, HoldItem, Profile, SaveOutcome, SaveReason, SaveStatus, SessionSpot, WorldState } from "./backend";
export { Game, type BuildMode } from "./game";
export { Settings, type SettingsData } from "./settings";
export { TitleScene, type TitleState } from "./scenes/title";
export { Engine, VIEW_H, VIEW_W, type Scene } from "./engine";
export { Input } from "./input";
export { chargePower, FishingScene, poolOf, spotIdOf, type SeaId, type Spot } from "./scenes/fishing";
export { IslandScene } from "./scenes/island";
export { SeaScene } from "./scenes/sea";
export { Reel, REEL, type ReelOutcome, type ReelParams } from "./systems/reel";
export { Clock, GAME_HOUR_SECONDS } from "./systems/timeOfDay";

export type GameOptions = {
  /** Where saves go: LocalBackend (demo) or RemoteBackend (full) — design §7. */
  backend: GameBackend;
  /** URL prefix of the built sprite assets (apps/client/public/assets). */
  assetBase?: string;
  /** demo (web 체험판) or full (exe) — design §2. */
  mode?: BuildMode;
  /** Closes the app; omit on the web (the lobby's 종료 then explains to close the tab). */
  quit?: () => void;
  /** Dev overlay + shortcuts (fishing: T +1h, B dock/boat, N next sea · sea: H hull, F fuel). */
  dev?: boolean;
  onProgress?: (done: number, total: number) => void;
};

/** Load assets, mount the game canvas into `host`, and start the loop at the lobby. */
export async function createGame(host: HTMLElement, opts: GameOptions): Promise<{ engine: Engine; game: Game }> {
  const assets = await Assets.load(opts.assetBase ?? "/assets/", opts.onProgress);
  const engine = new Engine(host, { assets, dev: opts.dev });
  const game = new Game(engine, opts.backend, opts.mode ?? "full", opts.quit ?? null);
  game.toTitle();
  engine.start();
  return { engine, game };
}

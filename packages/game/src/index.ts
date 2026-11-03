import { Assets } from "./assets";
import type { GameBackend } from "./backend";
import { Engine } from "./engine";
import { FishingScene, type Spot } from "./scenes/fishing";

export { Assets, ATLASES, BACKGROUNDS, lutHex, type AtlasName, type BgName, type Frame } from "./assets";
export type { CastRecord, CastResult, FishingSession, GameBackend, Gear, HoldItem } from "./backend";
export { Engine, VIEW_H, VIEW_W, type Scene } from "./engine";
export { Input } from "./input";
export { chargePower, FishingScene, spotIdOf, type SeaId, type Spot } from "./scenes/fishing";
export { Reel, REEL, type ReelOutcome, type ReelParams } from "./systems/reel";
export { Clock, GAME_HOUR_SECONDS } from "./systems/timeOfDay";

export type GameOptions = {
  /** Where saves go: LocalBackend (demo) or RemoteBackend (full) — design §7. */
  backend: GameBackend;
  /** URL prefix of the built sprite assets (apps/client/public/assets). */
  assetBase?: string;
  /** Dev overlay + shortcuts (T: +1h, B: dock/boat, N: next sea). */
  dev?: boolean;
  spot?: Spot;
  onProgress?: (done: number, total: number) => void;
};

/** Load assets, mount the game canvas into `host`, and start the loop. */
export async function createGame(host: HTMLElement, opts: GameOptions): Promise<Engine> {
  const assets = await Assets.load(opts.assetBase ?? "/assets/", opts.onProgress);
  const engine = new Engine(host, { assets, dev: opts.dev });
  engine.setScene(new FishingScene(opts.spot ?? { kind: "dock" }, opts.backend));
  engine.start();
  return engine;
}

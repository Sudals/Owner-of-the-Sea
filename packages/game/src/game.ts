import { dockFacing, ISLAND_BY_ID, START_ISLAND, TILE } from "@sea/shared";
import type { GameBackend, WorldState } from "./backend";
import type { Engine } from "./engine";
import { FishingScene, type Spot } from "./scenes/fishing";
import { IslandScene, type ArrivalNote } from "./scenes/island";
import { SeaScene } from "./scenes/sea";
import { TitleScene } from "./scenes/title";
import { Settings } from "./settings";
import { Clock } from "./systems/timeOfDay";

export type BuildMode = "demo" | "full";

/** What every scene shares: where saves go, the build, local settings, the world and its clock,
 *  and the scene changes between 로비 → 섬 ⇄ 바다 → 낚시 (design §7-3). */
export class Game {
  readonly settings = new Settings();
  /** One clock for every scene, so time keeps running across the island, the sea and fishing. */
  readonly clock = new Clock(9);
  private worldState: WorldState | null = null;

  constructor(
    readonly engine: Engine,
    readonly backend: GameBackend,
    readonly mode: BuildMode,
    /** Closes the app (Electron). Null on the web — a tab can't close itself. */
    readonly quit: (() => void) | null,
  ) {}

  get world(): WorldState {
    return (this.worldState ??= this.backend.world());
  }

  /** Game hours since day 1, 00:00 — drives storms (shared/boat.ts). */
  get clockH(): number {
    return (this.world.day - 1) * 24 + this.clock.hours;
  }

  /** Advance the clock (and the freshness clock while at sea). */
  tick(dt: number, atSea: boolean): void {
    const before = this.clock.hours;
    this.clock.update(dt);
    if (this.clock.hours < before) this.world.day++;
    if (atSea) this.world.seaTime += dt;
  }

  save(): void {
    this.world.hour = this.clock.hours;
    this.backend.saveWorld(this.world);
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
    this.worldState = this.backend.world();
    this.clock.hours = this.world.hour;
    const at = this.world.at;
    if (at.kind === "island" && ISLAND_BY_ID[at.id]) this.engine.setScene(new IslandScene(this, at.id));
    else if (at.kind === "sea") this.engine.setScene(new SeaScene(this));
    else this.toIsland(START_ISLAND.id);
  }

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

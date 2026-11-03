import {
  fuelMax, HULLS, ISLAND_BY_ID, MAP_H, MAP_W, mapPoints, POINT_BY_ID, POINT_RADIUS, TILE,
  type HullLv, type HoldItemDto, type ReportedWorld, type WorldDto,
} from "@sea/shared";
import type { CargoItem, Player } from "../db/schema";

// The world as the client sees it (design §8 players ↔ WorldState), and the rules for what a
// save may change (design §11-6): gear is the server's; the voyage is reported and clamped.

export function worldOf(p: Player): WorldDto {
  return {
    at: p.seaX !== null && p.seaY !== null ? { kind: "sea", x: p.seaX, y: p.seaY, heading: p.seaHeading ?? 0 } : { kind: "island", id: p.locationId },
    hullLv: p.hullLv,
    hullHp: p.hullHp,
    fuel: p.fuel,
    fuelTank: p.fuelTank,
    lantern: p.hasLantern,
    iceLv: p.iceLv,
    day: p.day,
    hour: p.gameHour,
    seaTime: p.seaTime,
    chart: p.chart,
  };
}

export const holdOf = (cargo: CargoItem[]): HoldItemDto[] => cargo.map((c) => ({ ...c }));

const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Columns a save may write, clamped to what the server's gear allows. `flags` notes oddities. */
export function applyReported(p: Player, w: ReportedWorld): { patch: Partial<Player>; flags: string[] } {
  const flags: string[] = [];
  const hullMax = HULLS[p.hullLv as HullLv]?.hp ?? 100;
  const fMax = fuelMax({ fuelTank: p.fuelTank });
  const patch: Partial<Player> = {
    hullHp: Math.round(Math.max(0, Math.min(hullMax, w.hullHp))),
    fuel: Math.max(0, Math.min(fMax, w.fuel)),
    day: Math.max(p.day, w.day),
    gameHour: w.hour,
    seaTime: Math.max(p.seaTime, w.seaTime),
  };
  if (w.chart.length % 4 === 0 && B64.test(w.chart)) patch.chart = w.chart;
  else flags.push("bad_chart");

  if (w.at.kind === "island") {
    if (ISLAND_BY_ID[w.at.id]) Object.assign(patch, { locationId: w.at.id, seaX: null, seaY: null, seaHeading: null });
    else flags.push("unknown_island");
  } else {
    const x = Math.max(0, Math.min(WORLD_W, w.at.x)), y = Math.max(0, Math.min(WORLD_H, w.at.y));
    // a light voyage check: no faster than the fastest hull for the sea time that passed
    if (p.seaX !== null && p.seaY !== null) {
      const dt = Math.max(0, w.seaTime - p.seaTime);
      if (Math.hypot(x - p.seaX, y - p.seaY) > HULLS[4].speed * 1.5 * dt + 400) flags.push("fast_voyage");
    }
    Object.assign(patch, { seaX: x, seaY: y, seaHeading: w.at.heading });
  }
  return { patch, flags };
}

export type Spot = { spotId: string; pointId: string; kind: "dock" | "sea"; center: [number, number] | null };

/** A spot id the client may open: a map point (p_jade_3) or an island dock (red_lighthouse_dock). */
export function resolveSpot(spotId: string): Spot | null {
  const mp = mapPoints().find((p) => p.id === spotId);
  if (mp) return { spotId, pointId: mp.pointId, kind: "sea", center: [(mp.tx + 0.5) * TILE, (mp.ty + 0.5) * TILE] };
  if (spotId.endsWith("_dock") && POINT_BY_ID[spotId] && ISLAND_BY_ID[spotId.slice(0, -5)]) return { spotId, pointId: spotId, kind: "dock", center: null };
  return null;
}

/** How far from a point's center a boat may be and still fish it (a little slack over the prompt range). */
export const POINT_REACH_PX = (POINT_RADIUS + 1.5) * TILE;

// 1:1 crop of the baked top-down map around one island, at 3× — for checking island art.
//   packages/sprites/node_modules/.bin/tsx scripts/map-crop.ts water_market [radiusTiles]
// → screenshots/map-<island>.png
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ISLAND_BY_ID, TILE } from "../packages/shared/src/index.ts";
import { bakeSea, WORLD_W } from "../packages/game/src/render/seaBake.ts";
import { Img } from "../packages/sprites/src/lib/image.ts";
import { writePng } from "../packages/sprites/src/lib/sheet.ts";

const id = process.argv[2] ?? "water_market";
const rt = Number(process.argv[3] ?? 10);
const isl = ISLAND_BY_ID[id];
if (!isl) throw new Error(`no island ${id}`);
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../screenshots");
mkdirSync(OUT, { recursive: true });

const buf = bakeSea();
const x0 = Math.max(0, Math.round((isl.cx - rt) * TILE)), y0 = Math.max(0, Math.round((isl.cy - rt) * TILE));
const w = Math.round(rt * 2 * TILE), h = Math.round(rt * 2 * TILE);
const out = new Img(w, h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(x, y, buf[(y0 + y) * WORLD_W + (x0 + x)] ?? 0);
writePng(`${OUT}/map-${id}.png`, out, 3);
console.log(`screenshots/map-${id}.png`);

// Contact sheet of 1:1 map crops around every island (for spotting stray art).
//   packages/sprites/node_modules/.bin/tsx scripts/map-crops.ts [radiusTiles]
// → screenshots/map-islands.png
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ISLANDS, TILE } from "../packages/shared/src/index.ts";
import { bakeSea, WORLD_H, WORLD_W } from "../packages/game/src/render/seaBake.ts";
import { Img } from "../packages/sprites/src/lib/image.ts";
import { writePng } from "../packages/sprites/src/lib/sheet.ts";

const rt = Number(process.argv[2] ?? 12);
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../screenshots");
mkdirSync(OUT, { recursive: true });
const buf = bakeSea();
const S = Math.round(rt * 2 * TILE), cols = 4, rows = Math.ceil(ISLANDS.length / cols);
const out = new Img(S * cols, S * rows);
ISLANDS.forEach((isl, k) => {
  const x0 = Math.round((isl.cx - rt) * TILE), y0 = Math.round((isl.cy - rt) * TILE);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = x0 + x, wy = y0 + y;
      if (wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H) continue;
      out.set((k % cols) * S + x, Math.floor(k / cols) * S + y, buf[wy * WORLD_W + wx] ?? 0);
    }
  console.log(k, isl.id);
});
writePng(`${OUT}/map-islands.png`, out, 1);

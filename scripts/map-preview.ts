// Review render of the whole top-down map (design §3-3).
//   packages/sprites/node_modules/.bin/tsx scripts/map-preview.ts
// → screenshots/map-overview.png (¼ scale), map-start.png / map-east.png (1:1 crops, 2×)
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mapPoints, ISLANDS, TILE } from "../packages/shared/src/index.ts";
import { bakeSea, WORLD_H, WORLD_W } from "../packages/game/src/render/seaBake.ts";
import { Img } from "../packages/sprites/src/lib/image.ts";
import { writePng } from "../packages/sprites/src/lib/sheet.ts";
import { C } from "../packages/sprites/src/palette.ts";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../screenshots");
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const buf = bakeSea();
console.log(`baked ${WORLD_W}×${WORLD_H} in ${Date.now() - t0}ms`);

const full = new Img(WORLD_W, WORLD_H);
full.data.set(buf);
// mark fishing points and docks so the overview can be checked
const mark = (x: number, y: number, c: number) => {
  for (let d = -6; d <= 6; d++) {
    full.set(x + d, y, c);
    full.set(x, y + d, c);
  }
};
for (const p of mapPoints()) mark((p.tx + 0.5) * TILE, (p.ty + 0.5) * TILE, p.look === "ruins" ? C.coral : C.yellow);
for (const i of ISLANDS) mark((i.dock[0] + 0.5) * TILE, (i.dock[1] + 0.5) * TILE, C.white);

const crop = (x0: number, y0: number, w: number, h: number) => {
  const o = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.set(x, y, full.get(x0 + x, y0 + y));
  return o;
};
const down = (k: number) => {
  const o = new Img(Math.floor(WORLD_W / k), Math.floor(WORLD_H / k));
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, full.get(x * k + (k >> 1), y * k + (k >> 1)));
  return o;
};
writePng(`${OUT}/map-overview.png`, down(4));
const s = ISLANDS[0]!;
writePng(`${OUT}/map-start.png`, crop(Math.max(0, s.cx * TILE - 120), s.cy * TILE - 180, 640, 360), 2);
writePng(`${OUT}/map-east.png`, crop(WORLD_W - 700, 40 * TILE, 640, 360), 2);
const ru = mapPoints().find((p) => p.look === "ruins")!;
writePng(`${OUT}/map-ruins.png`, crop(ru.tx * TILE - 320, ru.ty * TILE - 180, 640, 360), 2);
console.log("→ screenshots/map-overview.png, map-start.png, map-east.png, map-ruins.png");

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

// Dev tool: crop named frames out of a built sheet and save them enlarged for review.
//   npx tsx src/zoom.ts <sheet> <scale> [frame…]   →  preview/zoom-<sheet>.png
const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(here, "../../../apps/client/public/assets");
const [sheet = "angler", scaleArg = "8", ...names] = process.argv.slice(2);
const scale = Number(scaleArg);
const atlas = JSON.parse(readFileSync(`${ASSETS}/${sheet}.json`, "utf8")) as {
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
};
const src = PNG.sync.read(readFileSync(`${ASSETS}/${sheet}.png`));
const frames = (names.length ? names : Object.keys(atlas.frames)).map((n) => {
  const f = atlas.frames[n];
  if (!f) throw new Error(`no frame "${n}" in ${sheet}.json`);
  return f;
});

const gap = 4;
const W = frames.reduce((s, f) => s + (f.w + gap) * scale, gap * scale);
const H = (Math.max(...frames.map((f) => f.h)) + gap * 2) * scale;
const out = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  const x = i % W, y = Math.floor(i / W);
  const c = (((x / scale) >> 2) + ((y / scale) >> 2)) & 1 ? [36, 108, 143] : [27, 75, 108]; // water checker
  out.data.set([c[0]!, c[1]!, c[2]!, 255], i * 4);
}
let ox = gap * scale;
for (const f of frames) {
  for (let y = 0; y < f.h * scale; y++)
    for (let x = 0; x < f.w * scale; x++) {
      const si = ((f.y + Math.floor(y / scale)) * src.width + f.x + Math.floor(x / scale)) * 4;
      if (src.data[si + 3] === 0) continue;
      out.data.set(src.data.subarray(si, si + 4), ((gap * scale + y) * W + ox + x) * 4);
    }
  ox += (f.w + gap) * scale;
}
const path = resolve(here, `../preview/zoom-${sheet}.png`);
writeFileSync(path, PNG.sync.write(out));
console.log(`→ ${path}`);

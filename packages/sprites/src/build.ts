import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contactSheet, writeAtlas, writePng, type SheetItem } from "./lib/sheet";
import { buildAngler, withRod } from "./sprites/angler";
import { buildBoats } from "./sprites/boat";
import { buildBoatTop } from "./sprites/boatTop";
import { buildProps } from "./sprites/props";
import { buildUi } from "./sprites/ui";
import { buildTown } from "./sprites/town";
import { Img } from "./lib/image";
import { BG_H, BG_W, DOCK, DOCK_LOOKS, HORIZON, lutVariants, renderDock, renderSea, SEAS, WATERLINE, type DockLook } from "./sprites/backgrounds";
import { writeFileSync } from "node:fs";
import { buildFish, FISH } from "./sprites/fish";
import { appIcon, BOSS_META, buildOwner, buildPollutants, buildSky } from "./sprites/pollutants";

// pnpm sprites → apps/client/public/assets/*.png + *.json, and 4× review sheets in packages/sprites/preview/

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../apps/client/public/assets");
const PREVIEW = resolve(here, "../preview");
mkdirSync(OUT, { recursive: true });
mkdirSync(PREVIEW, { recursive: true });

const only = process.argv[2]; // optional: build one group, e.g. `pnpm sprites fish`

type Group = { name: string; build: () => SheetItem[]; meta?: () => Record<string, unknown>; preview?: { scale?: number; cols?: number; rod?: boolean } };

const groups: Group[] = [
  {
    name: "fish",
    build: buildFish,
    meta: () => ({ species: Object.fromEntries(FISH.map((f) => [f.id, { name: f.name, silhouette: f.sil }])) }),
    preview: { scale: 4, cols: 6 },
  },
  {
    name: "angler",
    build: buildAngler,
    meta: () => ({ frameSize: [32, 48], anchors: "hand = rod grip, rod = [angle°, 0], fish = held catch" }),
    preview: { scale: 4, cols: 9, rod: true },
  },
  { name: "boat", build: buildBoats, meta: () => ({ anchors: "stand = angler feet on deck" }), preview: { scale: 4, cols: 2 } },
  { name: "boat_top", build: buildBoatTop, meta: () => ({ dirs: 16, note: "top_lv{L}_{d}: d=0 east, 4 south, 8 west, 12 north; sprite center = boat center" }), preview: { scale: 4, cols: 16 } },
  { name: "props", build: buildProps, preview: { scale: 6, cols: 7 } },
  { name: "ui", build: buildUi, meta: () => ({ anchors: "slice = 9-slice corner size [x, y]" }), preview: { scale: 6, cols: 8 } },
  { name: "pollutants", build: buildPollutants, meta: () => ({ bosses: BOSS_META }), preview: { scale: 3, cols: 2 } },
  { name: "owner", build: buildOwner, preview: { scale: 2, cols: 1 } },
  { name: "sky", build: buildSky, preview: { scale: 4, cols: 2 } },
  { name: "town", build: buildTown, meta: () => ({ people: "p_{id}_{down|up|left|right}_{0|1|2}: 16×24, feet at the bottom row; b_* buildings and o_* props are drawn bottom-anchored" }), preview: { scale: 4, cols: 12 } },
];

for (const g of groups) {
  if (only && g.name !== only) continue;
  const items = g.build();
  const { img } = writeAtlas(OUT, g.name, items, g.meta?.());
  const previewItems = g.preview?.rod ? items.map((it) => ({ ...it, img: withRod(it) })) : items;
  writePng(`${PREVIEW}/${g.name}.png`, contactSheet(previewItems, { cols: g.preview?.cols }), g.preview?.scale ?? 4);
  console.log(`${g.name.padEnd(12)} ${String(items.length).padStart(3)} sprites → ${g.name}.png (${img.w}×${img.h})`);
}

// ── backgrounds: one PNG per sea (not packed), plus review grids ──
if (!only || only === "bg") {
  const seas = SEAS.map((sea) => ({ sea, img: renderSea(sea) }));
  for (const { sea, img } of seas) writePng(`${OUT}/bg_sea_${sea}.png`, img);
  const docks = (Object.keys(DOCK_LOOKS) as DockLook[]).map((look) => renderDock(look));
  (Object.entries(DOCK_LOOKS) as [DockLook, string][]).forEach(([, name], i) => writePng(`${OUT}/${name}.png`, docks[i]!));
  const dock = docks[0]!;
  writeFileSync(`${OUT}/bg_meta.json`, JSON.stringify({ size: [BG_W, BG_H], horizon: HORIZON, waterline: WATERLINE, dock: DOCK, seas: SEAS }, null, 1));
  writePng(`${PREVIEW}/bg_dock.png`, dock, 2);
  const grid2 = (imgs: Img[], cols: number) => {
    const w = imgs[0]!.w, h = imgs[0]!.h, rows = Math.ceil(imgs.length / cols);
    const out = new Img(w * cols, h * rows);
    imgs.forEach((im, i) => out.blit(im, (i % cols) * w, Math.floor(i / cols) * h));
    return out;
  };
  writePng(`${PREVIEW}/bg_seas.png`, grid2(seas.map((s) => s.img), 2));
  writePng(`${PREVIEW}/bg_luts_jade.png`, grid2(lutVariants(seas[0]!.img).map((v) => v.img), 3));
  writePng(`${PREVIEW}/bg_docks.png`, grid2(docks, 2));
  console.log(`bg            ${seas.length} seas  → bg_sea_*.png (640×360)`);
}

// ── app icon (exe .ico is assembled from these by electron-builder) + favicon ──
if (!only || only === "icon") {
  const ICON_DIR = resolve(OUT, "icon");
  const base = appIcon(32);
  writePng(`${ICON_DIR}/icon-16.png`, appIcon(16));
  writePng(`${ICON_DIR}/icon-32.png`, base);
  writePng(`${ICON_DIR}/icon-48.png`, appIcon(48));
  writePng(`${ICON_DIR}/icon-64.png`, base, 2);
  writePng(`${ICON_DIR}/icon-256.png`, base, 8);
  writePng(`${PREVIEW}/icon.png`, base, 8);
  console.log("icon          16/32/48/64/256 → icon/icon-*.png");
}

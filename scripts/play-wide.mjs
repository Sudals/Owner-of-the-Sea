// Wide views: the top-down sea and village show more world on a wider (or squarer) window, the
// HUD stays pinned to the corners, and clicks land on the right spot of the world.
//   node scripts/play-wide.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173/?local";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

async function start(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.removeItem("sea.local.v1"); localStorage.removeItem("sea.settings.v1"); });
  await page.reload();
  await page.waitForFunction(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
  await page.waitForTimeout(650);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "name");
  // the name box (a DOM input) sits inside the game, wherever the game is in the window
  const box = await page.evaluate(() => {
    const el = document.querySelector("input");
    const r = el.getBoundingClientRect(), e = window.__sea.engine;
    const a = e.toPage(0, 0), b = e.toPage(640, 360);
    return { inside: r.left >= a.x - 1 && r.right <= b.x + 1 && r.top >= a.y - 1 && r.bottom <= b.y + 1, r: [r.left, r.top, r.width, r.height].map(Math.round), game: [a.x, a.y, b.x, b.y].map(Math.round) };
  });
  check(`${w}×${h}: the name box sits inside the game`, box.inside, `box ${box.r} game ${box.game}`);
  await page.keyboard.insertText("넓은화면");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "island");
  return { page, errors };
}

const view = (page) => page.evaluate(() => { const e = window.__sea.engine; return { w: e.viewW, h: e.viewH, safe: e.safe, scale: e.scale }; });
const toPage = (page, x, y) => page.evaluate(([x, y]) => window.__sea.engine.toPage(x, y), [x, y]);

for (const [w, h, name, wantW, wantH] of [[2560, 1080, "ultrawide", 853, 360], [1600, 1200, "4:3", 640, 480], [1280, 720, "16:9", 640, 360], [3840, 1080, "32:9", 1280, 360]]) {
  const { page, errors } = await start(w, h);
  // the island hub (side view) stays 640×360
  let v = await view(page);
  check(`${name}: the island hub keeps 640×360`, v.w === 640 && v.h === 360, `${v.w}×${v.h}`);

  // village: as wide as the window
  await page.evaluate(() => window.__sea.game.toVillage("red_lighthouse"));
  await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "village");
  await page.waitForTimeout(400);
  v = await view(page);
  check(`${name}: the village view grows to the window`, Math.abs(v.w - wantW) <= 1 && Math.abs(v.h - wantH) <= 1, `${v.w}×${v.h} at ×${v.scale.toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/wide-village-${name.replace(":", "x")}.png` });

  // a click on the ground walks to that tile (world = camera + view position)
  const walk = await page.evaluate(() => {
    const s = window.__sea.engine.currentScene, e = window.__sea.engine;
    const [px, py] = s.state.tile;
    // the nearest reachable tile 3+ tiles away
    for (let r = 3; r < 9; r++)
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        const tx = px + dx, ty = py + dy, route = s.findRoute(tx, ty);
        if (!route || !route.length) continue;
        const wx = (tx + 0.5) * 16, wy = ty * 16 + 8;
        return { tx, ty, lx: wx - s.cam.x - e.safe.x, ly: wy - s.cam.y - e.safe.y };
      }
    return null;
  });
  if (walk) {
    const p = await toPage(page, walk.lx, walk.ly);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(120);
    const end = await page.evaluate(() => { const s = window.__sea.engine.currentScene; return s.route.at(-1) ?? null; });
    check(`${name}: clicking a village tile walks there`, end && end[0] === walk.tx && end[1] === walk.ty, `asked ${walk.tx},${walk.ty} → route ends ${end}`);
  } else check(`${name}: found a tile to click`, false);

  // sea: wide too, and a click at the far left of the view sails there
  await page.evaluate(() => window.__sea.game.toSea("red_lighthouse"));
  await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "sail", null, { timeout: 20_000 });
  await page.waitForTimeout(500);
  v = await view(page);
  check(`${name}: the sea view grows to the window`, Math.abs(v.w - wantW) <= 1 && Math.abs(v.h - wantH) <= 1, `${v.w}×${v.h}`);
  await page.screenshot({ path: `${OUT}/wide-sea-${name.replace(":", "x")}.png` });
  const lx = 20 - v.safe.x, ly = 180;
  const p = await toPage(page, lx, ly);
  const before = await page.evaluate(() => { const s = window.__sea.engine.currentScene; return s.camera(); });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(80);
  const target = await page.evaluate(() => window.__sea.engine.currentScene.target);
  const want = { x: before.x + v.safe.x + lx, y: before.y + v.safe.y + ly };
  check(`${name}: a click near the left edge sails to that spot`, target && Math.abs(target.x - want.x) < 4 && Math.abs(target.y - want.y) < 4, `target ${target ? `${Math.round(target.x)},${Math.round(target.y)}` : "none"} want ${Math.round(want.x)},${Math.round(want.y)}`);
  // the 메뉴 button is pinned to the top-right corner
  const menu = await page.evaluate(() => { const b = window.__sea.engine.bounds; return { x: b.right - 72 + 32, y: b.top + 8 + 9 }; });
  const mp = await toPage(page, menu.x, menu.y);
  await page.mouse.click(mp.x, mp.y);
  await page.waitForTimeout(120);
  const paused = await page.evaluate(() => !!window.__sea.engine.currentScene.pause);
  check(`${name}: 메뉴 in the top-right corner opens the menu`, paused);
  await page.screenshot({ path: `${OUT}/wide-sea-menu-${name.replace(":", "x")}.png` });

  if (errors.length) check(`${name}: no errors`, false, errors.join(" | "));
  await page.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : "ok — wide views pass");
process.exit(failed ? 1 : 0);

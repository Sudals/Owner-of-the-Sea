// Display check: the game at several window sizes, both 화면 modes, and clicks landing where
// they should when the game sits inside a larger window.
//   node scripts/play-display.mjs [baseUrl] [outDir]
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

/** Where the game is drawn in the page (CSS px) and how big. */
const viewportOf = (page) =>
  page.evaluate(() => {
    const e = window.__sea.engine;
    const r = e.screen.getBoundingClientRect();
    const v = e.viewport, d = e.dpr;
    return { x: r.left + v.x / d, y: r.top + v.y / d, w: v.w / d, h: v.h / d, mode: e.scaleMode, scale: e.scale };
  });

async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.removeItem("sea.local.v1"); localStorage.removeItem("sea.settings.v1"); });
  await page.reload();
  await page.waitForFunction(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
  await page.waitForTimeout(700);
  return { page, errors };
}

for (const [w, h, name] of [[1280, 720, "16:9 exact"], [1600, 900, "1600×900"], [2560, 1080, "ultrawide"], [1920, 1010, "1080p window with taskbar"], [800, 1000, "tall window"]]) {
  const { page, errors } = await open(w, h);
  const v = await viewportOf(page);
  const fills = Math.abs(v.w - w) < 2 || Math.abs(v.h - h) < 2;
  check(`${name}: the game fills one side of the window (꽉 차게)`, fills && v.mode === "fit", `${Math.round(v.w)}×${Math.round(v.h)} at ×${v.scale.toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/display-${w}x${h}.png` });
  if (errors.length) check(`${name}: no errors`, false, errors.join(" | "));
  await page.close();
}

// clicks land in the right place when the game is offset inside the window, and 화면 switches
{
  const { page } = await open(2560, 1080);
  let v = await viewportOf(page);
  const click = (x, y) => page.mouse.click(v.x + (x / 640) * v.w, v.y + (y / 360) * v.h);
  const item = await page.evaluate(() => window.__sea.engine.currentScene.items().find((it) => it.id === "settings")?.rect);
  await click(item.x + item.w / 2, item.y + item.h / 2);
  await page.waitForTimeout(150);
  const k = await page.evaluate(() => window.__sea.engine.currentScene.state.k);
  check("a click on 설정 opens the settings in an off-ratio window", k === "settings", `scene ${k}`);
  const row = await page.evaluate(() => window.__sea.engine.currentScene.items().find((it) => it.id === "display")?.rect);
  const c = await page.evaluate((r) => window.__sea.engine.currentScene.control(r).whole, row);
  await click(c.x + c.w / 2, c.y + c.h / 2);
  await page.waitForTimeout(200);
  v = await viewportOf(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sea.settings.v1") ?? "{}").display);
  check("화면 → 선명하게: whole multiples, saved on this device", v.mode === "sharp" && Number.isInteger(v.scale) && saved === "sharp", `×${v.scale} · saved ${saved}`);
  await page.screenshot({ path: `${OUT}/display-sharp-ultrawide.png` });
  await page.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : "ok — display passes");
process.exit(failed ? 1 : 0);

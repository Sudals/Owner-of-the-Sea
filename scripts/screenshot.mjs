// M2 check (design §10-1 e2e): open the client, capture the game in a few states and the
// sprite preview page, and fail on any console/page error.
//   node scripts/screenshot.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
};

// 1280×720 viewport → exactly 2× the 640×360 view
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
watch(page);
await page.goto(BASE);
await page.waitForFunction(() => window.__sea?.ready === true, null, { timeout: 30_000 });
await page.waitForTimeout(800);

const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
console.log(`canvas ${box?.width}×${box?.height} (scale ${(box?.width ?? 0) / 640}×)`);

await canvas.screenshot({ path: `${OUT}/m2-dock-day.png` });
// dev shortcuts: B = boat, N = next sea, T = +1 hour
await page.keyboard.press("KeyB");
await page.waitForTimeout(500);
await canvas.screenshot({ path: `${OUT}/m2-boat-jade.png` });
for (let i = 0; i < 9; i++) await page.keyboard.press("KeyT"); // 09:xx → 18:xx (sunset)
await page.waitForTimeout(500);
await canvas.screenshot({ path: `${OUT}/m2-boat-sunset.png` });
await page.keyboard.press("KeyN");
await page.keyboard.press("KeyN");
for (let i = 0; i < 4; i++) await page.keyboard.press("KeyT"); // → ~22:xx night
await page.waitForTimeout(500);
await canvas.screenshot({ path: `${OUT}/m2-boat-indigo-night.png` });

// tap the action button once: must not throw (the M3 state machine will use it)
await canvas.click({ position: { x: 640, y: 360 } });
await page.keyboard.press("Space");

const preview = await browser.newPage({ viewport: { width: 1400, height: 900 } });
watch(preview);
await preview.goto(`${BASE}/dev/sprites`);
await preview.waitForSelector('[data-sheet="sky"]', { timeout: 30_000 });
await preview.waitForTimeout(500);
await preview.screenshot({ path: `${OUT}/m2-sprite-preview.png`, fullPage: true });

await browser.close();
if (errors.length) {
  console.error(`${errors.length} error(s):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`ok — screenshots in ${OUT}/ , no console errors`);

// Screenshots of the four open villages and their dialogs (local backend).
//   node scripts/shot-village.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173/?local";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
const shot = (name) => page.locator("canvas").screenshot({ path: `${OUT}/${name}.png` });
const until = (fn, arg, timeout = 20_000) => page.waitForFunction(fn, arg, { timeout });

await page.goto(BASE);
await page.evaluate(() => localStorage.removeItem("sea.local.v1"));
await page.reload();
await until(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText("마을구경");
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "island");
await page.waitForTimeout(200);
await shot("village-hub");

for (const id of ["red_lighthouse", "water_market", "salt_flower", "bell_tower"]) {
  await page.evaluate((id) => window.__sea.game.toVillage(id), id);
  await until(() => window.__sea.engine.currentScene.state.k === "village");
  await page.waitForTimeout(400);
  await shot(`village-${id}`);
  // walk up the path a little so the camera shows the middle of the village
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(900);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(200);
  await shot(`village-${id}-up`);
}
// a keeper with two services asks which
await page.evaluate(() => window.__sea.game.toVillage("red_lighthouse"));
await until(() => window.__sea.engine.currentScene.state.k === "village");
await page.evaluate(() => { const s = window.__sea.engine.currentScene; s.warpTo("granny"); });
await page.waitForTimeout(300);
await shot("village-granny-near");
await page.keyboard.press("Space");
await page.waitForTimeout(300);
await shot("village-granny-dialog");
await browser.close();
console.log(errors.length ? errors.join("\n") : "ok — no console errors");

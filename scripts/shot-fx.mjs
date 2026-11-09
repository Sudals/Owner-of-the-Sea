// Screenshots of the game-feel effects, trash and the 창고 · 장비 screen (local backend).
//   node scripts/shot-fx.mjs [baseUrl] [outDir]
// Effects are triggered directly on the scene (they're visual, the rules are tested elsewhere).
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
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 20_000 });
const scene = (fn, arg) => page.evaluate(fn, arg);

await page.goto(BASE);
await page.evaluate(() => localStorage.removeItem("sea.local.v1"));
await page.reload();
await until(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu");
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText("효과확인");
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "island");

// a hold with fish and trash
await scene(() => {
  const h = window.__sea.backend.hold();
  const add = (fishId, sizeCm, n) => { for (let i = 0; i < n; i++) h.push({ id: `shot:${fishId}:${i}`, fishId, sizeCm: sizeCm + i, spotId: "red_lighthouse_dock", caughtAt: new Date().toISOString(), freshAt: 0 }); };
  add("rockfish", 24, 3); add("black_seabream", 31, 2); add("koi", 62, 1); add("trash_tire", 60, 1); add("trash_bottle", 22, 2); add("trash_boot", 30, 1);
});
await page.keyboard.press("KeyI");
await until(() => window.__sea.engine.currentScene.state.panel === "bag");
await page.waitForTimeout(150);
await shot("fx-bag-hold");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(150);
await shot("fx-bag-gear");
await page.keyboard.press("Escape");
// the market is in the village now: 덕배 할멈 → 물고기 팔기
await scene(() => window.__sea.engine.currentScene.focus("village"));
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "village");
await scene(() => window.__sea.engine.currentScene.warpTo("granny"));
await page.keyboard.press("Space");
await until(() => !!window.__sea.engine.modal);
await scene(() => { const m = window.__sea.engine.modal; m.opts.onPick("market", m); });
await until(() => window.__sea.engine.currentScene.state.panel === "market");
await page.waitForTimeout(150);
await shot("fx-market-trash");
await page.mouse.click((22 + 16 + 100) * 2, (18 + 324 - 30 + 10) * 2); // 전부 팔기
await page.waitForTimeout(250);
await shot("fx-sold");
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
await scene(() => window.__sea.game.toIsland("red_lighthouse"));
await until(() => window.__sea.engine.currentScene.state.k === "island");

// sea: a hard hit, then a hull that's nearly gone
await scene(() => window.__sea.engine.currentScene.focus("sail"));
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state?.k === "sail");
await page.waitForTimeout(400);
await scene(() => {
  const s = window.__sea.engine.currentScene;
  s.boat.vx = 60; s.boat.vy = 0; s.boat.heading = 0;
  window.__sea.game.world.hullHp -= 10;
  s.hitFx(10, true);
});
await page.waitForTimeout(90);
await shot("fx-sea-hit");
await scene(() => { window.__sea.game.world.hullHp = 12; window.__sea.engine.currentScene.boat.vx = 0; });
await page.waitForTimeout(1500);
await shot("fx-sea-lowhull");

// fishing: a catch, then a snapped line
await scene(() => { window.__sea.game.world.hullHp = 100; window.__sea.game.toFishing({ kind: "dock", islandId: "red_lighthouse" }); });
await until(() => window.__sea.engine.currentScene.state.k === "idle");
await scene(() => {
  const s = window.__sea.engine.currentScene;
  s.splash(420, 18, 1.4);
  s.fx.burst(470, 70, 46, { colors: ["white", "yellow", "peach", "coral"], speed: [30, 120], life: [0.5, 1.1], drag: 0.2, jitter: 20 });
  s.fx.flash("yellow", 0.5, 1.2);
});
await page.waitForTimeout(120);
await shot("fx-fish-catch");
await page.waitForTimeout(1200);
await scene(() => {
  const s = window.__sea.engine.currentScene;
  const [tx, ty] = s.tip;
  s.fx.burst(tx, ty, 10, { colors: ["white", "foam1", "gray2"], speed: [30, 90], g: 260, life: [0.3, 0.6] });
  s.fx.text(tx, ty - 18, "툭!", "coral", { big: true, life: 1 });
  s.fx.shake(4);
  s.fx.flash("red2", 0.45, 1.8);
});
await page.waitForTimeout(120);
await shot("fx-fish-snap");

await browser.close();
console.log(errors.length ? errors.join("\n") : "ok — no console errors");

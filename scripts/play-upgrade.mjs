// Upgrade check: the desktop app starts cleanly on a journal written by 0.1.0 (M4: no trades,
// gold, 도감 or inventory) — 0.2.0 crashed with "Cannot read properties of undefined (reading
// 'length')". Creates one player named 업글xxxxxx (printed at the end) on the API the client
// build talks to; for the local API (the per-IP 새 이름 limit doesn't count localhost):
//   (cd apps/client && VITE_API_BASE=http://localhost:8787/api npx vite build --mode full)
//   pnpm --filter @sea/desktop build && node scripts/play-upgrade.mjs http://localhost:8787/api
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const API = process.argv[2] ?? "https://br-wandering-mud-b3h5v0u5-api.compute.c-4.ap-southeast-1.aws.neon.tech/api";
const EXE = join(ROOT, "apps/desktop/node_modules/electron/dist/electron.exe");
const userData = mkdtempSync(join(tmpdir(), "sea-upgrade-"));
const name = `업글${Date.now().toString(36).slice(-6)}`;
let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};
const errors = [];

async function launch() {
  const { ELECTRON_RUN_AS_NODE: _drop, ...env } = process.env;
  const app = await electron.launch({ executablePath: EXE, args: [join(ROOT, "apps/desktop")], env: { ...env, SEA_USER_DATA: userData } });
  app.context().on("response", (r) => /\/api\//.test(r.url()) && console.log(`     net ${r.request().method()} ${r.url().replace(/^.*\/api/, "/api")} → ${r.status()}`));
  app.context().on("console", (m) => m.type() !== "log" && console.log(`     [${m.type()}] ${m.text().slice(0, 240)}`));
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  return { app, page };
}
const kill = (app) => {
  try { execFileSync("taskkill", ["/PID", String(app.process().pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* gone */ }
};

// launch 1: a new player through the app's own 새 게임 (token saved by the app, as for a real player)
let { app, page } = await launch();
await page.waitForFunction(() => window.__sea?.ready && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
await page.waitForTimeout(700);
await page.keyboard.press("Enter"); // 새 게임 (no save yet)
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "name", null, { timeout: 10_000 });
await page.keyboard.insertText(name);
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "island", null, { timeout: 20_000 });
const world = await page.evaluate(() => structuredClone(window.__sea.backend.world()));
const profile = await page.evaluate(() => window.__sea.backend.profile());
await page.waitForTimeout(500);
// quit the way 종료 does (a hard kill right after the first launch would lose Electron's
// encryption key for the profile — then no saved token can be read back)
await Promise.all([app.waitForEvent("close"), page.evaluate(() => window.desktop.quit())]);
await new Promise((r) => setTimeout(r, 500));

// now the journal as 0.1.0 wrote it (M4: no trades, gold, 도감 or inventory; fuelTank, not tankLv)
delete world.tankLv; delete world.holdLv;
world.fuelTank = false;
const old = { v: 1, profile, base: { world, hold: [], gear: { rodLv: 1, lineLv: 1 } }, world: { ...world }, hold: [], sessions: {}, pending: {}, dirty: false, inflight: null, lastSavedAt: null };
writeFileSync(join(userData, "journal.json"), JSON.stringify(old));
errors.length = 0;

({ app, page } = await launch());
page.on("console", (m) => m.type() !== "log" && console.log(`     [${m.type()}] ${m.text().slice(0, 200)}`));
const ready = await page
  .waitForFunction(() => window.__sea?.ready && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 })
  .then(() => true, () => false);
check("starts to the lobby on a 0.1.0 journal", ready && errors.length === 0, errors.join(" | ") || "no errors");
await page.waitForTimeout(800);
await page.screenshot({ path: "screenshots/upgrade-lobby.png" });
const lobby = await page.evaluate(() => ({ focus: window.__sea.engine.currentScene.sel, signedIn: !!window.__sea.backend.profile() }));
check("the lobby knows the player (이어하기 focused)", lobby.signedIn && lobby.focus === 0, JSON.stringify(lobby));
await page.keyboard.press("Enter"); // 이어하기
const island = await page
  .waitForFunction(() => window.__sea.engine.currentScene.state.k === "island", null, { timeout: 20_000 })
  .then(() => true, () => false);
const v = await page.evaluate(() => ({ gold: window.__sea.backend.gold(), worms: window.__sea.backend.inventory().bait_worm ?? 0, dex: window.__sea.backend.dex().length }));
check("이어하기 loads the server's save (gold, bait)", island && v.gold === 50 && v.worms === 20, JSON.stringify(v));
await page.keyboard.press("KeyI");
await page.waitForTimeout(300);
check("창고 · 장비 and the rest work, no errors", errors.length === 0, errors.join(" | ") || "no errors");
kill(app);
console.log(`\nCREATED ${name}`);
console.log(failed ? `${failed} failed` : "ok — upgrade passes");
process.exit(failed ? 1 : 0);

// Selling in the full build (Economy.md §8-1): fish caught and saved on docking, then sold in a
// village market — the sale must survive the save the market makes when it closes (the server
// replays it), and the gold the player saw must be the gold the server keeps.
//   node scripts/play-sell-remote.mjs [clientUrl] [apiBase]      (Vite on :5173, `neon dev` on :8787)
// Creates one test player named 판매xxxxxx; the name is printed at the end.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173";
const API = process.argv[3] ?? "http://localhost:8787/api";
const name = `판매${Date.now().toString(36).slice(-6)}`;

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const zoneAt = (s, k) => (s.zone ? s.zone[0] + (s.zone[1] - s.zone[0]) * k : k < 0.5 ? 0.6 : 0.8);
const scene = () =>
  page.evaluate(() => {
    const sea = window.__sea, s = sea.engine.currentScene, st = s.state;
    return { k: st.k, modal: sea.engine.modal?.opts?.title ?? null, flash: sea.game.flashMsg?.text ?? null, tension: st.reel?.tension ?? null, zone: st.reel?.zone ?? null, gold: sea.backend.gold(), hold: sea.backend.hold().length };
  });
const waitFor = async (pred, timeout = 20_000, label = "") => {
  const t0 = Date.now();
  for (;;) {
    const v = await scene();
    if (pred(v)) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout ${label}; last ${JSON.stringify(v)}`);
    await page.waitForTimeout(30);
  }
};
const key = async (k, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(k);
    await page.waitForTimeout(40);
  }
};
const api = async (path, tok) => {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${tok}` } });
  return res.json();
};
async function fishOnce() {
  await waitFor((s) => s.k === "idle", 15_000, "idle");
  await page.keyboard.down("Space");
  await page.waitForTimeout(600);
  await page.keyboard.up("Space");
  await waitFor((s) => s.k === "bite", 20_000, "bite");
  await page.keyboard.press("Space");
  await waitFor((s) => s.k === "reeling" || s.k === "lost", 3000, "reeling");
  let holding = false;
  for (;;) {
    const s = await scene();
    if (s.k !== "reeling") break;
    if (!holding && s.tension < zoneAt(s, 0.4)) { await page.keyboard.down("Space"); holding = true; }
    else if (holding && s.tension > zoneAt(s, 0.6)) { await page.keyboard.up("Space"); holding = false; }
    await page.waitForTimeout(20);
  }
  if (holding) await page.keyboard.up("Space");
  if ((await scene()).k === "caught") {
    await page.waitForTimeout(600);
    await page.keyboard.press("Space");
  }
}

// a new player on the server, three casts at the dock, saved (like docking does)
await page.goto(BASE);
await page.evaluate(() => ["sea.token.v1", "sea.journal.v1"].forEach((k) => localStorage.removeItem(k)));
await page.reload();
await page.waitForFunction(() => window.__sea?.ready && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
await page.waitForTimeout(700);
await key("Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText(name);
await key("Enter");
await waitFor((s) => s.k === "island", 15_000, "island");
const tok = await page.evaluate(() => localStorage.getItem("sea.token.v1"));
await page.evaluate(() => window.__sea.engine.currentScene.focus("fish"));
await key("Enter");
for (let n = 0; n < 4; n++) await fishOnce();
const saved = await page.evaluate(() => window.__sea.game.commit("dock"));
let me = await api("/me", tok);
check("the catches are saved on the server", saved.ok && me.hold.length > 0, `${saved.message} · server hold ${me.hold.length}`);

// into the village, sell everything through the market's Trader; closing the market saves
await page.evaluate(() => window.__sea.game.toVillage("red_lighthouse"));
await waitFor((s) => s.k === "village", 15_000, "village");
const before = await scene();
const sale = await page.evaluate(() => {
  const v = window.__sea.engine.currentScene, b = window.__sea.backend;
  const ok = v.trader.trade({ kind: "sell", ids: b.hold().map((h) => h.id) });
  return { ok, gold: b.gold(), hold: b.hold().length };
});
check("the sale pays on screen", sale.ok && sale.gold > before.gold, `${before.gold}G → ${sale.gold}G, hold ${before.hold} → ${sale.hold}`);
const out = await page.evaluate(async () => {
  const v = window.__sea.engine.currentScene;
  v.trader.flush();
  // wait for the save the market made
  for (let i = 0; i < 400 && window.__sea.backend.saveStatus().dirty; i++) await new Promise((r) => setTimeout(r, 50));
  return { gold: window.__sea.backend.gold(), hold: window.__sea.backend.hold().length, status: window.__sea.backend.saveStatus() };
});
me = await api("/me", tok);
check("…and the gold stays after the market saves", out.gold === sale.gold && !out.status.dirty, `on screen ${out.gold}G (sold to ${sale.gold}G)`);
check("…the server keeps the same gold and the fish are gone", me.gold === sale.gold && me.hold.length === sale.hold, `server ${me.gold}G, hold ${me.hold.length}`);

if (errors.length) check("no errors", false, errors.join(" | "));
await browser.close();
console.log(`\nCREATED ${name}`);
console.log(failed ? `${failed} failed` : "ALL PASSED");
process.exit(failed ? 1 : 0);

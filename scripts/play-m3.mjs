// M3 check: play the fishing loop with the keyboard like a player would.
//   node scripts/play-m3.mjs [baseUrl] [outDir]
// cast → wait for the bite → strike → reel (hold under 60% tension, release over 80%) → result.
// Also: miss a bite on purpose, and reload mid-session to confirm the seed + cast index resume.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const scene = () =>
  page.evaluate(() => {
    const s = window.__sea.engine.currentScene;
    const st = s.state;
    return {
      k: st.k,
      tension: st.reel?.tension ?? null,
      dist: st.reel?.dist ?? null,
      fish: st.hooked?.fish?.name ?? null,
      size: st.hooked?.roll?.sizeCm ?? null,
      reason: st.reason ?? null,
      seed: s.session?.seed ?? null,
      nextIndex: s.session?.nextIndex ?? null,
      hold: window.__sea.backend.hold().length,
    };
  });
const waitFor = async (pred, timeout = 20_000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await scene();
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting; last state ${JSON.stringify(s)}`);
    await page.waitForTimeout(25);
  }
};
const shot = (name) => page.locator("canvas").screenshot({ path: `${OUT}/${name}.png` });

async function cast(holdMs = 650) {
  await waitFor((s) => s.k === "idle");
  await page.keyboard.down("Space");
  await page.waitForTimeout(holdMs);
  await page.keyboard.up("Space");
  await waitFor((s) => s.k === "waiting");
}

async function fishOnce(n, { strike = true } = {}) {
  await cast();
  if (n === 1) await shot("m3-waiting");
  await waitFor((s) => s.k === "bite", 15_000);
  if (n === 1) await shot("m3-bite");
  if (!strike) {
    const s = await waitFor((s) => s.k === "lost");
    await page.waitForTimeout(200);
    await shot("m3-missed");
    return { result: `lost (${s.reason})` };
  }
  await page.keyboard.press("Space");
  await waitFor((s) => s.k === "reeling");
  let holding = false, shotTaken = false;
  const t0 = Date.now();
  for (;;) {
    const s = await scene();
    if (s.k !== "reeling") break;
    if (!holding && s.tension < 0.6) { await page.keyboard.down("Space"); holding = true; }
    else if (holding && s.tension > 0.8) { await page.keyboard.up("Space"); holding = false; }
    if (!shotTaken && Date.now() - t0 > 1500) { await shot(`m3-reeling-${n}`); shotTaken = true; }
    await page.waitForTimeout(20);
  }
  if (holding) await page.keyboard.up("Space");
  const end = await scene();
  await page.waitForTimeout(250);
  await shot(`m3-result-${n}`);
  if (end.k === "caught") { await page.waitForTimeout(400); await page.keyboard.press("Space"); }
  return { result: end.k === "caught" ? `caught ${end.fish} ${end.size}cm` : `lost (${end.reason}) ${end.fish ?? ""}`, secs: ((Date.now() - t0) / 1000).toFixed(1) };
}

await page.goto(BASE);
await page.evaluate(() => localStorage.removeItem("sea.local.v1"));
await page.reload();
await page.waitForFunction(() => window.__sea?.ready === true, null, { timeout: 30_000 });
await waitFor((s) => s.k === "idle");

const log = [];
for (let n = 1; n <= 3; n++) log.push(await fishOnce(n));
log.push(await fishOnce(4, { strike: false }));
const before = await scene();
log.forEach((l, i) => console.log(`cast ${i + 1}: ${l.result}${l.secs ? ` (${l.secs}s)` : ""}`));
console.log(`hold after 4 casts: ${before.hold} · session seed ${before.seed?.slice(0, 8)}… next cast index ${before.nextIndex}`);

// reload without leaving the point: same seed, same next cast index (design §11-4)
await page.reload();
await page.waitForFunction(() => window.__sea?.ready === true, null, { timeout: 30_000 });
const after = await waitFor((s) => s.k === "idle");
const resumed = after.seed === before.seed && after.nextIndex === before.nextIndex;
console.log(`after reload: seed ${after.seed?.slice(0, 8)}… next cast index ${after.nextIndex} hold ${after.hold} → ${resumed ? "RESUMED ✓" : "NOT RESUMED ✗"}`);

await browser.close();
if (errors.length) {
  console.error(`${errors.length} error(s):\n${errors.join("\n")}`);
  process.exit(1);
}
if (!resumed) process.exit(1);
console.log("ok — no console errors");

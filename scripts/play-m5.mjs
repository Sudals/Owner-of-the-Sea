// M5 check (Economy.md v3): the island hub with the local backend.
//   node scripts/play-m5.mjs [baseUrl] [outDir]
// start money and worms → 덕배 할멈's worms (once a day) → bait is used by a bite, not by reeling
// in early → sell the hold at 빨간등대 → repair → 물장터: shop (bait, rod, hold), fuel → reload keeps it.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173/?local"; // LocalBackend (no server)
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const view = () =>
  page.evaluate(() => {
    const { engine, backend, game } = window.__sea;
    const s = engine.currentScene;
    const st = s.state;
    return {
      scene: s.constructor.name,
      k: st.k,
      panel: st.panel ?? null,
      island: st.island ?? null,
      reason: st.reason ?? null,
      gold: backend.gold(),
      inv: { ...backend.inventory() },
      hold: backend.hold().length,
      gear: { ...backend.gear() },
      world: { hullHp: game.world.hullHp, fuel: game.world.fuel, holdLv: game.world.holdLv, tankLv: game.world.tankLv },
      log: backend.marketLog(),
      toast: s.toast?.text ?? null,
      tension: st.reel?.tension ?? null,
    };
  });
const waitFor = async (pred, timeout = 20_000, what = "state") => {
  const t0 = Date.now();
  for (;;) {
    const s = await view();
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${what}; last ${JSON.stringify(s)}`);
    await page.waitForTimeout(25);
  }
};
const shot = (name) => page.locator("canvas").screenshot({ path: `${OUT}/${name}.png` });
const focus = (id) => page.evaluate((id) => window.__sea.engine.currentScene.focus(id), id);
const press = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(60);
};
const worms = (v) => v.inv.bait_worm ?? 0;

async function cast() {
  await waitFor((s) => s.k === "idle", 15_000, "idle");
  await page.keyboard.down("Space");
  await page.waitForTimeout(650);
  await page.keyboard.up("Space");
  await waitFor((s) => s.k === "waiting", 5000, "waiting");
}
/** Strike and reel like a player (hold under 60% tension, let go over 80%). */
async function reel() {
  await page.keyboard.press("Space");
  await waitFor((s) => s.k === "reeling", 5000, "reeling");
  let holding = false;
  for (;;) {
    const s = await view();
    if (s.k !== "reeling") break;
    if (!holding && s.tension < 0.6) { await page.keyboard.down("Space"); holding = true; }
    else if (holding && s.tension > 0.8) { await page.keyboard.up("Space"); holding = false; }
    await page.waitForTimeout(20);
  }
  if (holding) await page.keyboard.up("Space");
  const end = await view();
  if (end.k === "caught") {
    await page.waitForTimeout(600);
    await page.keyboard.press("Space");
  }
  return end.k === "caught";
}

// ── 1. a new player: 50G and 20 worms (Economy.md §6-2) ──
await page.goto(BASE);
await page.evaluate(() => localStorage.removeItem("sea.local.v1"));
await page.reload();
await page.waitForFunction(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
await page.waitForTimeout(650);
await press("Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText("경제시험");
await press("Enter");
let v = await waitFor((s) => s.k === "island", 15_000, "island");
check("a new player starts with 50G and 20 worms", v.gold === 50 && worms(v) === 20, `${v.gold}G, worms ${worms(v)}`);
await page.waitForTimeout(300);
await shot("m5-hub");

// ── 2. 덕배 할멈: 20 worms, once a KST day ──
await focus("gift");
await press("Enter");
v = await view();
check("할멈's worms: +20", worms(v) === 40, `worms ${worms(v)}`);
await press("Enter");
v = await view();
check("…only once a day", worms(v) === 40, `worms ${worms(v)}, toast "${v.toast}"`);
check("빨간등대 sells no fuel", !(await focus("fuel")));

// ── 3. bait: reeling in before a bite keeps it, a bite uses it ──
await focus("fish");
await press("Enter");
await waitFor((s) => s.k === "idle", 15_000, "dock");
await cast();
await page.keyboard.press("Space"); // pull in early
v = await waitFor((s) => s.k === "lost" || s.k === "idle", 5000, "reeled in");
check("reeling in before a bite keeps the worm", worms(v) === 40, `worms ${worms(v)} (${v.reason})`);
await cast();
await waitFor((s) => s.k === "bite", 15_000, "bite");
v = await waitFor((s) => s.k === "lost", 5000, "missed");
check("a missed bite still eats the worm", worms(v) === 39, `worms ${worms(v)}`);
let caught = 0, tries = 0;
while (caught < 3 && tries < 8) {
  tries++;
  await cast();
  await waitFor((s) => s.k === "bite", 15_000, "bite");
  if (await reel()) caught++;
}
v = await view();
check(`every bite used a worm (${tries} more casts)`, worms(v) === 39 - tries, `worms ${worms(v)}`);
check("the catches are in the hold", v.hold === caught, `hold ${v.hold}, caught ${caught}`);

// back to the island (ESC → 섬으로)
await press("Escape");
await page.waitForFunction(() => !!window.__sea.engine.currentScene.pause);
await press("ArrowDown");
await press("Enter");
await waitFor((s) => s.k === "island", 10_000, "island again");

// ── 4. 시장: sell the hold at 빨간등대 (×0.8, no 특가) ──
await focus("market");
await press("Enter");
v = await waitFor((s) => s.panel === "market", 3000, "market");
const want = await page.evaluate(() => window.__sea.engine.currentScene.marketRows().filter((r) => r.sellable).reduce((n, r) => n + r.total, 0));
await page.waitForTimeout(200);
await shot("m5-market");
const gold0 = v.gold;
await page.mouse.click((22 + 16 + 100) * 2, (18 + 324 - 30 + 10) * 2); // 전부 팔기
v = await waitFor((s) => s.hold === 0, 3000, "sold").catch(() => view());
check("전부 팔기 pays what the market quoted", want > 0 && v.gold === gold0 + want && v.hold === 0, `${gold0} + ${want} → ${v.gold}, hold ${v.hold}`);
check("the sales are noted for 수요 (포화)", Object.keys(v.log.demand).some((k) => k.startsWith("red_lighthouse:")), JSON.stringify(v.log.demand));
await press("Escape");
v = await waitFor((s) => s.panel === null, 2000, "market closed");

// ── 5. 수리: missing HP × 0.5G (Lv1) × 0.5 (빨간등대) ──
await page.evaluate(() => (window.__sea.game.world.hullHp -= 20));
await focus("repair");
const g1 = (await view()).gold;
await press("Enter");
v = await view();
check("배 수리: 20 HP for 5G", v.world.hullHp === 100 && v.gold === g1 - 5, `hull ${v.world.hullHp}, ${g1} → ${v.gold}G`);

// ── 6. 물장터: the shop and fuel ──
await page.evaluate(() => {
  window.__sea.backend.devGrant(1000);
  window.__sea.game.toIsland("water_market");
});
v = await waitFor((s) => s.island === "water_market", 5000, "물장터");
await focus("shop");
await press("Enter");
v = await waitFor((s) => s.panel === "shop", 3000, "shop");
await page.waitForTimeout(200);
await shot("m5-shop");
const g2 = v.gold;
await press("ArrowDown"); // 지렁이 → 새우 미끼
await press("Enter");
v = await view();
check("새우 미끼 ×20 for 40G", (v.inv.bait_shrimp ?? 0) === 20 && v.gold === g2 - 40, `shrimp ${v.inv.bait_shrimp}, ${g2} → ${v.gold}G`);
await press("ArrowDown"); // 낚싯대 Lv2
await press("Enter");
v = await view();
check("낚싯대 Lv2 for 300G", v.gear.rodLv === 2 && v.gold === g2 - 340, `rod Lv${v.gear.rodLv}, ${v.gold}G`);
await press("Enter");
v = await view();
check("…and not twice", v.gear.rodLv === 2 && v.gold === g2 - 340, `"${v.toast}"`);
await press("ArrowDown");
await press("ArrowDown"); // 화물칸 Lv2
await press("Enter");
v = await view();
check("화물칸 Lv2 → 30 slots", v.world.holdLv === 2, `hold Lv${v.world.holdLv}, "${v.toast}"`);
await press("Escape");
await waitFor((s) => s.panel === null, 2000, "shop closed");
await page.evaluate(() => (window.__sea.game.world.fuel = 50));
await focus("fuel");
const g3 = (await view()).gold;
await press("Enter");
v = await view();
check("연료 채우기: 50 for 50G", Math.round(v.world.fuel) === 100 && v.gold === g3 - 50, `fuel ${v.world.fuel}, ${g3} → ${v.gold}G`);
await page.waitForTimeout(200);
await shot("m5-water-market");

// ── 7. it all survives a reload ──
const before = await view();
await page.evaluate(() => window.__sea.game.save());
await page.reload();
await page.waitForFunction(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
await page.waitForTimeout(650);
await press("Enter"); // 이어하기
v = await waitFor((s) => s.k === "island", 15_000, "island after reload");
check(
  "gold, bait, gear and the market log survive a reload",
  v.gold === before.gold && v.inv.bait_shrimp === 20 && v.gear.rodLv === 2 && v.world.holdLv === 2 && JSON.stringify(v.log) === JSON.stringify(before.log),
  `${v.gold}G, shrimp ${v.inv.bait_shrimp}, rod Lv${v.gear.rodLv}, hold Lv${v.world.holdLv}`,
);

await browser.close();
if (errors.length) {
  console.log(errors.join("\n"));
  failed++;
}
console.log(failed ? `${failed} failed` : "ok — M5 economy passes, no console errors");
process.exit(failed ? 1 : 0);

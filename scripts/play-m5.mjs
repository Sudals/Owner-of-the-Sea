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
      tension: st.reel?.tension ?? null, zone: st.reel?.zone ?? null,
      prompt: st.prompt ?? null,
      modal: engine.modal?.opts.title ?? null,
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
// the village: walk in, stand at a spot, answer a dialog, walk out by the pier
const enterVillage = async () => {
  if (!(await focus("village"))) throw new Error("no 마을 들어가기 here");
  await press("Enter");
  await waitFor((s) => s.k === "village", 5000, "village");
};
const standAt = (id) => page.evaluate((id) => window.__sea.engine.currentScene.warpTo(id), id);
const pick = (id) =>
  page.evaluate((id) => {
    const m = window.__sea.engine.modal;
    if (!m) throw new Error("no dialog open");
    m.opts.onPick(id, m);
  }, id);
const leaveVillage = async () => {
  await standAt("pier");
  await press("Space");
  await waitFor((s) => s.k === "island", 5000, "back at the dock");
};

/** Where to aim inside the 유지 구간 (k = 0 its bottom … 1 its top). */
const zoneAt = (s, k) => (s.zone ? s.zone[0] + (s.zone[1] - s.zone[0]) * k : k < 0.5 ? 0.6 : 0.8);
async function cast() {
  await waitFor((s) => s.k === "idle", 15_000, "idle");
  await page.keyboard.down("Space");
  await page.waitForTimeout(650);
  await page.keyboard.up("Space");
  await waitFor((s) => s.k === "waiting", 5000, "waiting");
}
/** Strike and reel like a player (keep the tension inside the 유지 구간). */
async function reel() {
  await page.keyboard.press("Space");
  await waitFor((s) => s.k === "reeling", 5000, "reeling");
  let holding = false;
  for (;;) {
    const s = await view();
    if (s.k !== "reeling") break;
    if (!holding && s.tension < zoneAt(s, 0.4)) { await page.keyboard.down("Space"); holding = true; }
    else if (holding && s.tension > zoneAt(s, 0.6)) { await page.keyboard.up("Space"); holding = false; }
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

// ── 2. the dock sells nothing; the village is a walk away ──
check("the dock has no market, shop, fuel or repair", !(await focus("market")) && !(await focus("shop")) && !(await focus("fuel")) && !(await focus("repair")));
await enterVillage();
v = await view();
check("마을 들어가기 → the village of 빨간등대", v.k === "village" && v.island === "red_lighthouse");
await page.waitForTimeout(300);
await shot("m5-village");
// click 덕배 할멈: walk there by yourself, she asks what you want
const at = await page.evaluate(() => {
  const s = window.__sea.engine.currentScene;
  const w = s.walkers.find((x) => x.def.id === "granny");
  return [w.x - s.cam.x, w.y - 12 - s.cam.y];
});
await page.mouse.click(at[0] * 2, at[1] * 2);
v = await waitFor((s) => s.modal === "덕배 할멈", 15_000, "walked to 할멈");
check("clicking 할멈 walks up to her and opens her dialog", v.prompt === "granny", `prompt ${v.prompt}`);
await pick("gift");
v = await view();
check("할멈's worms: +20", worms(v) === 40, `worms ${worms(v)}`);
await press("Space");
await waitFor((s) => s.modal === "덕배 할멈", 3000, "할멈 again");
await pick("gift");
v = await view();
check("…only once a day", worms(v) === 40, `worms ${worms(v)}, toast "${v.toast}"`);
check("빨간등대 has no fuel pump", !(await standAt("fuel")));
await leaveVillage();

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

// ── 4. 시장: sell the hold to 덕배 할멈 (×0.8, no 특가) ──
await enterVillage();
await standAt("granny");
await press("Space");
await waitFor((s) => s.modal === "덕배 할멈", 3000, "할멈");
await pick("market");
v = await waitFor((s) => s.panel === "market", 3000, "market");
const want = await page.evaluate(() => window.__sea.engine.currentScene.sub.p.rows().filter((r) => r.sellable).reduce((n, r) => n + r.total, 0));
await page.waitForTimeout(200);
await shot("m5-market");
const gold0 = v.gold;
await page.mouse.click((22 + 16 + 100) * 2, (18 + 324 - 30 + 10) * 2); // 전부 팔기
v = await waitFor((s) => s.hold === 0, 3000, "sold").catch(() => view());
check("전부 팔기 pays what the market quoted", want > 0 && v.gold === gold0 + want && v.hold === 0, `${gold0} + ${want} → ${v.gold}, hold ${v.hold}`);
check("the sales are noted for 수요 (포화)", Object.keys(v.log.demand).some((k) => k.startsWith("red_lighthouse:")), JSON.stringify(v.log.demand));
await press("Escape");
v = await waitFor((s) => s.panel === null, 2000, "market closed");

// ── 5. 수리 at the boat shed: missing HP × 0.5G (Lv1) × 0.5 (빨간등대) ──
await page.evaluate(() => (window.__sea.game.world.hullHp -= 20));
await standAt("repair");
await press("Space");
await waitFor((s) => !!s.modal, 3000, "repair dialog");
const g1 = (await view()).gold;
await pick("ok");
v = await view();
check("배 수리 at the shed: 20 HP for 5G", v.world.hullHp === 100 && v.gold === g1 - 5, `hull ${v.world.hullHp}, ${g1} → ${v.gold}G`);
await leaveVillage();

// ── 6. 물장터: the shop and fuel ──
await page.evaluate(() => {
  window.__sea.backend.devGrant(1000);
  window.__sea.game.toIsland("water_market");
});
v = await waitFor((s) => s.island === "water_market", 5000, "물장터");
await enterVillage();
await page.waitForTimeout(300);
await shot("m5-water-market-village");
await standAt("shop");
await press("Space");
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
await standAt("fuel");
await press("Space");
await waitFor((s) => s.modal === "주유기", 3000, "주유기");
const g3 = (await view()).gold;
await pick("ok");
v = await view();
check("주유기: 50 for 50G", Math.round(v.world.fuel) === 100 && v.gold === g3 - 50, `fuel ${v.world.fuel}, ${g3} → ${v.gold}G`);
await page.waitForTimeout(200);
await shot("m5-water-market");
await leaveVillage();

// ── 6b. 소모품: 소금 절임, 얼음 덩이 (창고 · 장비), 수리 키트 (바다에서 R) ──
await page.evaluate(() => {
  const { backend, game } = window.__sea;
  const inv = backend.inventory();
  inv.salt = 1; inv.ice_chunk = 1; inv.repair_kit = 1;
  const h = backend.hold();
  const t = game.world.seaTime;
  h.push({ id: "m5:a", fishId: "rockfish", sizeCm: 25, spotId: "red_lighthouse_dock", caughtAt: new Date().toISOString(), freshAt: t - 1800 });
  h.push({ id: "m5:b", fishId: "black_seabream", sizeCm: 30, spotId: "red_lighthouse_dock", caughtAt: new Date().toISOString(), freshAt: t - 1800 });
});
await press("KeyI");
await waitFor((s) => s.panel === "bag", 2000, "bag");
const holdOf = () => page.evaluate(() => window.__sea.backend.hold().filter((h) => h.id?.startsWith("m5:")).map((h) => ({ id: h.id, fishId: h.fishId, salted: h.salted, fresh: Math.round(100 - (window.__sea.game.world.seaTime - h.freshAt) / 60) })));
// pick the 우럭 row and salt it
const rowIdx = await page.evaluate(() => window.__sea.engine.currentScene.sub.bag.groups().findIndex((g) => g.fishId === "rockfish"));
await page.evaluate((i) => (window.__sea.engine.currentScene.sub.bag.sel = i), rowIdx);
await press("Enter");
let hv = await holdOf();
const salted = hv.find((h) => h.fishId === "rockfish");
check("소금 절임 freezes one fish at its freshness", salted?.salted >= 68 && salted?.salted <= 71 && ((await view()).inv.salt ?? 0) === 0, JSON.stringify(salted));
await press("ArrowRight"); // 장비 · 소지품
const iceIdx = await page.evaluate(() => window.__sea.engine.currentScene.sub.bag.owned().indexOf("ice_chunk"));
await page.evaluate((i) => (window.__sea.engine.currentScene.sub.bag.sel = i), iceIdx);
await press("Enter");
hv = await holdOf();
const iced = hv.find((h) => h.fishId === "black_seabream");
check("얼음 덩이 lifts the hold's freshness by 10%p", iced && iced.fresh >= 79 && iced.fresh <= 81, JSON.stringify(iced));
await page.waitForTimeout(150);
await shot("m5-bag-use");
await press("Escape");
await waitFor((s) => s.panel === null, 2000, "bag closed");
await focus("sail");
await press("Enter");
await waitFor((s) => s.scene === "SeaScene" && s.k === "sail", 15_000, "sea");
await page.evaluate(() => (window.__sea.game.world.hullHp = 40));
await press("KeyR");
v = await view();
check("R at sea: 수리 키트 +25 (Lv1)", v.world.hullHp === 65 && (v.inv.repair_kit ?? 0) === 0, `hull ${v.world.hullHp}, kits ${v.inv.repair_kit}`);
await page.evaluate(() => window.__sea.game.toIsland("water_market"));
await waitFor((s) => s.island === "water_market", 5000, "back at 물장터");

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

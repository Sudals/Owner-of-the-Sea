// M4 check (design §13): the full build saves to the server.
//   · fishing many times → no server calls → one save → all of it in the DB
//   · quitting without saving can't reroll: the same fish come back in the same order (§11-4)
//   · a crash leaves a journal that is offered back and saved (§11-5)
//   · leaving with unsaved progress asks 저장하고 / 저장 안 하고 / 취소 (§11-2)
//   · a forged cast is refused; a retried batch is applied once (§7-4, §11-5)
//   node scripts/play-m4.mjs [clientUrl] [apiBase]      (Vite full mode on :5173, `neon dev` on :8787)
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173";
const API = process.argv[3] ?? "http://localhost:8787/api";
const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });
const name = `M4${Date.now().toString(36).slice(-6)}`;

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
let calls = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.startsWith(API) && r.method() !== "OPTIONS") calls.push(`${r.method()} ${u.slice(API.length)}`);
});

const scene = () =>
  page.evaluate(() => {
    const sea = window.__sea;
    const s = sea.engine.currentScene;
    const st = s.state;
    return {
      name: s.constructor.name,
      k: st.k,
      modal: sea.engine.modal ? sea.engine.modal.opts.title : null,
      flash: sea.game.flashMsg?.text ?? null,
      tension: st.reel?.tension ?? null,
      roll: st.hooked ? { i: st.hooked.i, fishId: st.hooked.roll.fishId, sizeCm: st.hooked.roll.sizeCm } : null,
      session: s.session ? { id: s.session.sessionId, next: s.session.nextIndex } : null,
      status: sea.backend.saveStatus?.() ?? null,
      hold: sea.backend.hold().length,
    };
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
const shot = (n) => page.locator("canvas").screenshot({ path: `${OUT}/${n}.png` });
const key = async (k, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(k);
    await page.waitForTimeout(40);
  }
};
const token = () => page.evaluate(() => localStorage.getItem("sea.token.v1"));
const api = async (method, path, body, tok) => {
  const res = await fetch(API + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
};

/** One cast like a player: hold to cast, strike the bite, reel under 60–80% tension. */
async function fishOnce() {
  await waitFor((s) => s.k === "idle", 15_000, "idle");
  await page.keyboard.down("Space");
  await page.waitForTimeout(600);
  await page.keyboard.up("Space");
  const w = await waitFor((s) => s.k === "waiting", 5000, "waiting");
  await waitFor((s) => s.k === "bite", 15_000, "bite");
  await page.keyboard.press("Space");
  await waitFor((s) => s.k === "reeling" || s.k === "lost", 3000, "reeling");
  let holding = false;
  for (;;) {
    const s = await scene();
    if (s.k !== "reeling") break;
    if (!holding && s.tension < 0.6) { await page.keyboard.down("Space"); holding = true; }
    else if (holding && s.tension > 0.8) { await page.keyboard.up("Space"); holding = false; }
    await page.waitForTimeout(20);
  }
  if (holding) await page.keyboard.up("Space");
  const end = await scene();
  if (end.k === "caught") {
    await page.waitForTimeout(600);
    await page.keyboard.press("Space");
  }
  return { ...w.roll, caught: end.k === "caught" };
}

async function toLobbyMenu() {
  await page.waitForFunction(() => window.__sea?.ready && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
  await page.waitForTimeout(700);
}

// ── 1. 새 게임 on the server ──
await page.goto(BASE);
await page.evaluate(() => ["sea.token.v1", "sea.journal.v1"].forEach((k) => localStorage.removeItem(k)));
await page.reload();
await toLobbyMenu();
calls = [];
await key("Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText(name);
await key("Enter");
let v = await waitFor((s) => s.k === "island", 15_000, "island");
const tok = await token();
check(`새 게임 "${name}" registers on the server and keeps a device token`, !!tok && calls.includes("POST /auth/start"), calls.join(", "));

// ── 2. fish three times with no server calls, then save once ──
await key("Enter"); // 선착장에서 낚시
v = await waitFor((s) => s.k === "idle", 15_000, "fishing");
check("the dock session comes from the server", calls.includes("POST /session/open"));
calls = [];
const first = [];
for (let n = 0; n < 3; n++) first.push(await fishOnce());
const caught1 = first.filter((f) => f.caught).length;
v = await scene();
check("three casts made no server calls", calls.length === 0, calls.join(", ") || "none");
check("the HUD knows what's unsaved", v.status?.unsavedCaught === caught1, `unsaved ${v.status?.unsavedCaught}, caught ${caught1}`);
await shot("m4-unsaved");

await key("Escape");
await page.waitForFunction(() => !!window.__sea.engine.currentScene.pause);
await key("ArrowDown", 2); // 계속하기 / 섬으로 / 저장
await key("Enter");
v = await waitFor((s) => s.flash?.startsWith("저장했다"), 15_000, "save");
await shot("m4-saved");
check("one save = one server call", calls.filter((c) => c === "POST /save").length === 1 && calls.length === 1, `${calls.join(", ")} · ${v.flash}`);
let me = await api("GET", "/me", null, tok);
check("…and the DB has every catch", me.json?.hold?.length === caught1, `server hold ${me.json?.hold?.length}, caught ${caught1}`);

// ── 3. quit without saving → same fish again (no reroll) ──
const before = [];
for (let n = 0; n < 2; n++) before.push(await fishOnce());
await page.reload(); // like killing the game: nothing saved
await toLobbyMenu();
v = await waitFor((s) => !!s.modal, 5000, "recovery prompt");
check("restart offers the unsaved casts back", v.modal === "복구");
await shot("m4-recover-prompt");
await key("ArrowRight"); // 버리기
await key("Enter");
await waitFor((s) => !s.modal, 5000, "prompt closed");
await key("Enter"); // 이어하기
await waitFor((s) => s.k === "island", 15_000, "island again");
await key("Enter");
v = await waitFor((s) => s.k === "idle", 15_000, "fishing again");
check("the session resumes at the last saved cast", v.session?.next === 3, `next cast ${v.session?.next}`);
const again = [];
for (let n = 0; n < 2; n++) again.push(await fishOnce());
const same = before.every((b, i) => b.fishId === again[i].fishId && b.sizeCm === again[i].sizeCm && b.i === again[i].i);
check("리셋 꼼수: the same fish come back in the same order", same, before.map((b, i) => `#${b.i} ${b.fishId} ${b.sizeCm} / ${again[i].fishId} ${again[i].sizeCm}`).join(" · "));

// ── 4. crash recovery: unsaved casts are saved on the next start ──
const caught2 = again.filter((f) => f.caught).length;
await page.reload();
await toLobbyMenu();
await waitFor((s) => s.modal === "복구", 5000, "recovery prompt 2");
calls = [];
await key("Enter"); // 복구하고 저장
v = await waitFor((s) => !s.modal, 15_000, "recovered");
me = await api("GET", "/me", null, tok);
check("복구하고 저장 puts the crashed casts in the DB", calls.includes("POST /save") && me.json?.hold?.length === caught1 + caught2, `server hold ${me.json?.hold?.length}, want ${caught1 + caught2}`);

// ── 5. leaving with unsaved progress asks first ──
await key("Enter"); // 이어하기
await waitFor((s) => s.k === "island", 15_000, "island 3");
await key("Enter");
await waitFor((s) => s.k === "idle", 15_000, "fishing 3");
const last = await fishOnce();
await key("Escape");
await page.waitForFunction(() => !!window.__sea.engine.currentScene.pause);
await key("ArrowDown", 3); // 로비로 나가기
await key("Enter");
v = await waitFor((s) => !!s.modal, 5000, "leave dialog");
await shot("m4-leave-dialog");
check("로비로 with unsaved progress asks 저장하고 / 저장 안 하고 / 취소", v.modal === "로비로");
await key("Enter"); // 저장하고 나가기
await waitFor((s) => s.k === "menu" && !s.modal, 15_000, "lobby");
me = await api("GET", "/me", null, tok);
check("저장하고 나가기 saved before leaving", me.json?.hold?.length === caught1 + caught2 + (last.caught ? 1 : 0), `server hold ${me.json?.hold?.length}`);

// ── 6. the server refuses forged casts and applies a batch once ──
{
  const o = await api("POST", "/session/open", { spotId: "red_lighthouse_dock" }, tok);
  const s = o.json;
  const forged = { batchId: crypto.randomUUID(), reason: "manual", holdIds: me.json.hold.map((h) => h.id), world: { ...me.json.world }, sessions: [{ sessionId: s.sessionId, sig: s.sig, closed: false, casts: [{ i: s.nextIndex, fishId: "golden_seabream", sizeCm: 99, result: "caught", reelMs: 5000, t: Date.now() }] }] };
  delete forged.world.hullLv; delete forged.world.fuelTank; delete forged.world.lantern; delete forged.world.iceLv;
  const r1 = await api("POST", "/save", forged, tok);
  check("a forged catch is refused (seed re-roll mismatch)", r1.status === 200 && r1.json.applied.caught === 0 && r1.json.rejected[0]?.why === "mismatch", JSON.stringify(r1.json?.rejected));
  const r2 = await api("POST", "/save", forged, tok);
  check("the same batchId is applied once", r2.json?.duplicate === true);
  const badSig = { ...forged, batchId: crypto.randomUUID(), sessions: [{ ...forged.sessions[0], sig: "0".repeat(64) }] };
  const r3 = await api("POST", "/save", badSig, tok);
  check("a bad session signature is refused", r3.json?.rejected?.[0]?.why === "bad_sig");
}

await browser.close();
if (errors.length) {
  failed++;
  console.error(`${errors.length} console/page error(s):\n${errors.join("\n")}`);
}
console.log(`\nCREATED ${name}`);
console.log(failed ? `${failed} FAILED` : "ok — M4 save flow passes, no console errors");
process.exit(failed ? 1 : 0);

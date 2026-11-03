// Lobby check (design §7-3, §5 v12): first run → 새 게임 → type a Hangul name → play; reload →
// 이어하기 resumes; 설정 changes stick; 종료 explains itself on the web; ESC → 로비로.
//   node scripts/play-lobby.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};

const view = () =>
  page.evaluate(() => {
    const sea = window.__sea;
    const s = sea.engine.currentScene;
    const isTitle = s.constructor.name === "TitleScene" || "sel" in s;
    return {
      scene: isTitle ? "title" : "fishing",
      k: s.state.k,
      sel: s.sel ?? null,
      error: s.state.error ?? null,
      profile: sea.backend.profile(),
      settings: { ...sea.game.settings.data },
      pause: s.pause ?? null,
      seed: s.session?.seed ?? null,
      nextIndex: s.session?.nextIndex ?? null,
    };
  });
const waitFor = async (pred, timeout = 15_000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await view();
    if (pred(v)) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout; last ${JSON.stringify(v)}`);
    await page.waitForTimeout(30);
  }
};
const canvas = page.locator("canvas");
const shot = (name) => canvas.screenshot({ path: `${OUT}/${name}.png` });
// view px → page px (the canvas is exactly 2× at 1280×720)
const click = async (x, y) => {
  const b = await canvas.boundingBox();
  await page.mouse.click(b.x + (x * b.width) / 640, b.y + (y * b.height) / 360);
};
/** Rect of a lobby item by id, read from the scene's own layout (so the test follows layout changes). */
const rectOf = (id) => page.evaluate((id) => window.__sea.engine.currentScene.items().find((it) => it.id === id).rect, id);
const clickItem = async (id, dx = null) => {
  const r = await rectOf(id);
  await click(dx === null ? r.x + r.w / 2 : dx < 0 ? r.x + r.w + dx : r.x + dx, r.y + r.h / 2);
};
const ready = async () => {
  await page.waitForFunction(() => window.__sea?.ready === true, null, { timeout: 30_000 });
  await page.waitForTimeout(700); // fade-in
};

// ── first run ──
await page.goto(BASE);
await page.evaluate(() => {
  localStorage.removeItem("sea.local.v1");
  localStorage.removeItem("sea.settings.v1");
});
await page.reload();
await ready();
let v = await view();
check("first run opens the lobby", v.scene === "title" && v.k === "menu", `${v.scene}/${v.k}`);
check("이어하기 disabled without a save → focus starts on 새 게임", v.sel === 1, `sel=${v.sel}`);
await shot("lobby-menu");

// 종료 on the web → notice, then back
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
v = await waitFor((x) => x.k === "notice");
check("종료 on the web shows the close-the-tab notice", v.k === "notice");
await shot("lobby-quit");
await page.keyboard.press("Escape");
await waitFor((x) => x.k === "menu");

// 설정: mouse on the bgm "+" twice, keyboard ← on sfx, then close
await clickItem("settings");
v = await waitFor((x) => x.k === "settings");
check("설정 opens by mouse", v.k === "settings");
await clickItem("bgm", -10); // the "+" at the right end of the row
await clickItem("bgm", -10);
await page.keyboard.press("ArrowDown"); // focus sfx
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(100);
v = await view();
check("bgm +2 (mouse), sfx −1 (keyboard)", v.settings.bgm === 9 && v.settings.sfx === 6, JSON.stringify(v.settings));
await shot("lobby-settings");
await page.keyboard.press("Escape");
await waitFor((x) => x.k === "menu");

// 새 게임 with a bad name, then a Hangul name typed through the DOM field
v = await view();
check("closing a dialog puts focus back on 새 게임", v.sel === 1, `sel=${v.sel}`);
await page.keyboard.press("Enter");
v = await waitFor((x) => x.k === "name");
check("새 게임 opens name entry", v.k === "name");
await page.keyboard.type("가");
await page.keyboard.press("Enter");
v = await waitFor((x) => x.error !== null);
check("one-char name is rejected", !!v.error, v.error);
await page.keyboard.press("Backspace");
await page.keyboard.insertText("바다사람"); // what an IME commits
await page.waitForTimeout(150);
await shot("lobby-name");
await page.keyboard.press("Space"); // must NOT submit
await page.waitForTimeout(150);
v = await view();
check("Space does not submit the name", v.k === "name");
await page.keyboard.press("Enter");
v = await waitFor((x) => x.scene === "fishing" && x.k === "idle");
check("Enter starts the game as 바다사람", v.profile?.name === "바다사람", v.profile?.name);
const seed = v.seed;

// one cast so the session has moved on
await page.keyboard.down("Space");
await page.waitForTimeout(600);
await page.keyboard.up("Space");
await waitFor((x) => x.k === "waiting");
await page.keyboard.press("Space"); // pull in early
v = await waitFor((x) => x.k === "idle", 5000);
const nextIndex = v.nextIndex;

// ESC → pause → 로비로
await page.keyboard.press("Escape");
v = await waitFor((x) => x.pause !== null);
await shot("lobby-pause");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
v = await waitFor((x) => x.scene === "title" && x.k === "menu");
check("ESC → 로비로 returns to the lobby with the save shown", v.profile?.name === "바다사람" && v.sel === 0, `sel=${v.sel}`);
await page.waitForTimeout(700);
await shot("lobby-menu-saved");

// reload → 이어하기 resumes the same seed + cast index
await page.reload();
await ready();
v = await view();
check("after reload: lobby, focus on 이어하기", v.scene === "title" && v.sel === 0);
check("settings survived the reload", v.settings.bgm === 9 && v.settings.sfx === 6);
await page.keyboard.press("Enter");
v = await waitFor((x) => x.scene === "fishing" && x.k === "idle");
check("이어하기 resumes the same seed and cast index", v.seed === seed && v.nextIndex === nextIndex, `${v.seed?.slice(0, 8)}… #${v.nextIndex} vs ${seed?.slice(0, 8)}… #${nextIndex}`);

// 새 게임 over a save asks first; cancel keeps it
await page.keyboard.press("Escape");
await waitFor((x) => x.pause !== null);
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await waitFor((x) => x.scene === "title" && x.k === "menu");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
v = await waitFor((x) => x.k === "confirm");
await page.waitForTimeout(700); // let the lobby fade-in finish
await shot("lobby-confirm-new");
await page.keyboard.press("Escape");
v = await waitFor((x) => x.k === "menu");
check("새 게임 over a save asks first; Esc keeps the save", v.profile?.name === "바다사람");

await browser.close();
if (errors.length) {
  failed++;
  console.error(`${errors.length} console/page error(s):\n${errors.join("\n")}`);
}
console.log(failed ? `${failed} FAILED` : "ok — lobby flow passes, no console errors");
process.exit(failed ? 1 : 0);

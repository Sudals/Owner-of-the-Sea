// Desktop app check (design §7-2, §11-5, §13 M4): the Electron shell loads the full build over
// app://, keeps the device token encrypted, writes the journal to userData, survives a hard
// kill, and asks before closing with unsaved progress.
//   pnpm --filter @sea/client build && pnpm --filter @sea/desktop build
//   node scripts/play-desktop.mjs [apiBase]
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const API = process.argv[2] ?? "https://br-wandering-mud-b3h5v0u5-api.compute.c-4.ap-southeast-1.aws.neon.tech/api";
const EXE = join(ROOT, "apps/desktop/node_modules/electron/dist/electron.exe");
const userData = mkdtempSync(join(tmpdir(), "sea-desktop-"));
const name = `PC${Date.now().toString(36).slice(-6)}`;

let failed = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};
const errors = [];

async function launch() {
  // ELECTRON_RUN_AS_NODE (set when this runs inside VS Code) would start Electron as plain Node
  const { ELECTRON_RUN_AS_NODE: _drop, ...env } = process.env;
  const app = await electron.launch({ executablePath: EXE, args: [join(ROOT, "apps/desktop")], env: { ...env, SEA_USER_DATA: userData } });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  await page.waitForFunction(() => window.__sea?.ready && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
  await page.waitForTimeout(700);
  return { app, page };
}
const scene = (page) =>
  page.evaluate(() => {
    const sea = window.__sea, s = sea.engine.currentScene, st = s.state;
    return { k: st.k, modal: sea.engine.modal?.opts.title ?? null, tension: st.reel?.tension ?? null, status: sea.backend.saveStatus?.() ?? null };
  });
const waitFor = async (page, pred, timeout = 20_000, label = "") => {
  const t0 = Date.now();
  for (;;) {
    const v = await scene(page);
    if (pred(v)) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout ${label}; last ${JSON.stringify(v)}`);
    await page.waitForTimeout(30);
  }
};
const key = async (page, k, n = 1) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(k);
    await page.waitForTimeout(40);
  }
};
async function fishOnce(page) {
  await waitFor(page, (s) => s.k === "idle", 15_000, "idle");
  await page.keyboard.down("Space");
  await page.waitForTimeout(600);
  await page.keyboard.up("Space");
  await waitFor(page, (s) => s.k === "bite", 15_000, "bite");
  await page.keyboard.press("Space");
  let holding = false;
  for (;;) {
    const s = await scene(page);
    if (s.k !== "reeling" && s.k !== "bite") break;
    if (s.k === "reeling") {
      if (!holding && s.tension < 0.6) { await page.keyboard.down("Space"); holding = true; }
      else if (holding && s.tension > 0.8) { await page.keyboard.up("Space"); holding = false; }
    }
    await page.waitForTimeout(20);
  }
  if (holding) await page.keyboard.up("Space");
  const end = await scene(page);
  if (end.k === "caught") {
    await page.waitForTimeout(600);
    await page.keyboard.press("Space");
  }
  return end.k === "caught";
}

// ── 1. the shell ──
let { app, page } = await launch();
const info = await page.evaluate(() => ({ href: location.href, desktop: typeof window.desktop, node: typeof window.require, mode: window.__sea.game.mode }));
check("loads the full build over app://", info.href.startsWith("app://bundle/") && info.mode === "full", info.href);
check("the page gets window.desktop and no Node", info.desktop === "object" && info.node === "undefined");
const prefs = await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const p = w.webContents.getLastWebPreferences();
  return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration };
});
check("contextIsolation + sandbox, nodeIntegration off", prefs.contextIsolation && prefs.sandbox && !prefs.nodeIntegration, JSON.stringify(prefs));
const csp = await page.evaluate(async () => (await fetch(location.href)).headers.get("content-security-policy"));
check("a CSP limits connect-src to the API", !!csp && csp.includes("connect-src 'self' https://*.neon.tech"), csp ?? "none");
await page.screenshot({ path: join(ROOT, "screenshots/desktop-lobby.png") });

// ── 2. new game → token encrypted at rest → unsaved casts in the journal ──
await key(page, "Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText(name);
await key(page, "Enter");
await waitFor(page, (s) => s.k === "island", 20_000, "island");
const token = await page.evaluate(() => window.desktop.getToken());
const tokenFile = join(userData, "token.bin");
const raw = existsSync(tokenFile) ? readFileSync(tokenFile) : Buffer.alloc(0);
check("device token kept in userData, encrypted (safeStorage)", !!token && raw.length > 0 && !raw.includes(Buffer.from(token)), `${raw.length} bytes`);
await page.evaluate(() => window.__sea.engine.currentScene.focus("fish"));
await key(page, "Enter"); // 선착장에서 낚시
let caught = 0;
for (let i = 0; i < 2; i++) caught += (await fishOnce(page)) ? 1 : 0;
const journal = join(userData, "journal.json");
const j = existsSync(journal) ? JSON.parse(readFileSync(journal, "utf8")) : null;
const pendingCasts = j ? Object.values(j.pending).flat().length : 0;
check("unsaved casts are journaled to userData", pendingCasts === 2, `${pendingCasts} pending`);

// ── 3. hard kill → restart → offered back → saved ──
// a real hard kill: the whole process tree, no chance to save (child.kill() doesn't end Electron on Windows)
const pid = app.process().pid;
const { execFileSync } = await import("node:child_process");
const alive = () => { try { return execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).includes(String(pid)); } catch { return false; } };
try { execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already gone */ }
for (let i = 0; i < 20 && alive(); i++) await new Promise((r) => setTimeout(r, 200));
check("the first instance is really gone (hard kill)", !alive(), `pid ${pid}`);
await new Promise((r) => setTimeout(r, 800));
({ app, page } = await launch());
let v = await waitFor(page, (s) => !!s.modal, 8000, "recovery");
check("after a hard kill the journal is offered back", v.modal === "복구");
await page.screenshot({ path: join(ROOT, "screenshots/desktop-recover.png") });
await key(page, "Enter"); // 복구하고 저장
await waitFor(page, (s) => !s.modal, 20_000, "recovered");
const me = await (await fetch(`${API}/me`, { headers: { authorization: `Bearer ${token}` } })).json();
check("…and saved to the server", me.hold?.length === caught, `server hold ${me.hold?.length}, caught ${caught}`);

// ── 4. closing with unsaved progress asks first; then the window really closes ──
await key(page, "Enter"); // 이어하기
await waitFor(page, (s) => s.k === "island", 20_000, "island 2");
await page.evaluate(() => window.__sea.engine.currentScene.focus("fish"));
await key(page, "Enter");
await fishOnce(page);
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
v = await waitFor(page, (s) => !!s.modal, 5000, "close dialog");
check("the close button asks 저장하고 종료 / 저장 안 하고 종료 / 취소", v.modal === "종료");
await page.screenshot({ path: join(ROOT, "screenshots/desktop-close.png") });
const closed = new Promise((r) => app.on("close", r));
await key(page, "Enter"); // 저장하고 종료
await Promise.race([closed, new Promise((_, rej) => setTimeout(() => rej(new Error("app did not quit")), 20_000))]);
check("저장하고 종료 saves and quits", true);
const j2 = existsSync(journal) ? JSON.parse(readFileSync(journal, "utf8")) : null;
check("nothing left unsaved in the journal", !!j2 && Object.keys(j2.pending).length === 0 && !j2.dirty);

// Electron can hold userData files for a moment after quitting
await new Promise((r) => setTimeout(r, 1000));
try {
  rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
} catch {
  console.log(`     (could not remove ${userData}; it is only test data)`);
}
if (errors.length) {
  failed++;
  console.error(`${errors.length} console/page error(s):\n${errors.join("\n")}`);
}
console.log(`\nCREATED ${name}`);
console.log(failed ? `${failed} FAILED` : "ok — desktop app passes");
process.exit(failed ? 1 : 0);

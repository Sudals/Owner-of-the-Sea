// Web site check: serve apps/web/dist as plain static files, open the landing page, follow
// "브라우저에서 체험하기" to /demo/, start a new game and make one cast — no server involved.
//   node scripts/build-web.mjs && node scripts/play-web.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve("apps/web/dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname).split("/").filter((x) => x && x !== "..").join("/");
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!f.startsWith(ROOT) || !existsSync(f)) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((r) => server.listen(4180, r));
const BASE = "http://localhost:4180";

let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const bad = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));

await page.goto(`${BASE}/`);
check("landing page loads", (await page.title()) === "바다의 주인");
await page.screenshot({ path: "screenshots/web-landing.png", fullPage: true });
await page.click("text=브라우저에서 체험하기");
await page.waitForURL(/\/demo\/$/);
await page.waitForFunction(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
check("the demo opens from /demo/ with relative paths", true, page.url());
const remote = await page.evaluate(() => typeof window.__sea.backend.commit === "function");
check("the web build saves in the browser (no server saves)", !remote);
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText("웹시험");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "island", null, { timeout: 15_000 });
await page.evaluate(() => window.__sea.engine.currentScene.focus("fish"));
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "idle", null, { timeout: 15_000 });
await page.keyboard.down("Space");
await page.waitForTimeout(650);
await page.keyboard.up("Space");
await page.waitForFunction(() => window.__sea.engine.currentScene.state.k === "waiting", null, { timeout: 5000 });
check("new game → island → a cast", true);
await page.locator("canvas").screenshot({ path: "screenshots/web-demo.png" });
const saved = await page.evaluate(() => !!localStorage.getItem("sea.local.v1"));
check("progress is in localStorage", saved);
check("no failed requests", bad.length === 0, bad.join(", "));
check("no console errors", errors.length === 0, errors.join(" | "));
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : "ok — web site passes");
process.exit(failed ? 1 : 0);

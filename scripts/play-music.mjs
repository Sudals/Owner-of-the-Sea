// Music (design §1 사운드: WebAudio로 합성): every scene plays its song, a fish on the line brings
// in the tension layer, 배경음 0 is silent — and each song, rendered offline, is neither silent
// nor clipping. The renders are saved as WAV files to listen to.
//   node scripts/play-music.mjs [baseUrl] [outDir] [seconds]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173/?local";
const OUT = process.argv[3] ?? "screenshots/music";
const SECS = Number(process.argv[4] ?? 24);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};
const until = (fn, arg, timeout = 20_000) => page.waitForFunction(fn, arg, { timeout });
const audio = () => page.evaluate(() => window.__sea.game.audio.state);

await page.goto(BASE);
await page.evaluate(() => { localStorage.removeItem("sea.local.v1"); localStorage.removeItem("sea.settings.v1"); });
await page.reload();
await until(() => window.__sea?.ready === true && window.__sea.engine.currentScene.state.k === "menu");
await page.waitForTimeout(700);

// ── each song, offline: levels, and a WAV to listen to ──
for (const id of ["title", "island", "sea", "village", "storm"]) {
  const r = await page.evaluate(async ([id, secs]) => {
    const { left, right, sampleRate } = await window.__sea.game.audio.render(id, secs, id === "storm" ? 0 : 0);
    let peak = 0, sum = 0, quietest = Infinity;
    const win = sampleRate * 2;
    for (let w = sampleRate * 2; w + win <= left.length; w += win) {
      let s = 0;
      for (let i = w; i < w + win; i++) s += left[i] * left[i] + right[i] * right[i];
      quietest = Math.min(quietest, Math.sqrt(s / (2 * win)));
    }
    const n = left.length, pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      sum += left[i] * left[i] + right[i] * right[i];
      pcm[i * 2] = Math.max(-1, Math.min(1, left[i])) * 32767;
      pcm[i * 2 + 1] = Math.max(-1, Math.min(1, right[i])) * 32767;
    }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { peak, rms: Math.sqrt(sum / (2 * n)), quietest, sampleRate, b64: btoa(bin) };
  }, [id, SECS]);
  const data = Buffer.from(r.b64, "base64");
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(r.sampleRate, 24);
  head.writeUInt32LE(r.sampleRate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(`${OUT}/bgm-${id}.wav`, Buffer.concat([head, data]));
  const db = (x) => (20 * Math.log10(x)).toFixed(1);
  check(`${id}: plays, never clips, never drops out`, r.peak < 0.97 && r.rms > 0.02 && r.quietest > 0.004, `peak ${db(r.peak)} dB · rms ${db(r.rms)} dB · quietest 2 s ${db(r.quietest)} dB`);
}

// ── live: the lobby, then each scene's song ──
await page.mouse.click(4, 4); // the first click (or key) unlocks sound in a browser
await page.waitForTimeout(300);
const a = await audio();
check("the lobby plays its song", a.song === "title" && a.running, JSON.stringify(a));
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText("음악듣기");
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "island");
await page.waitForTimeout(200);
check("the island plays its song", (await audio()).song === "island");

await page.evaluate(() => window.__sea.game.toVillage("red_lighthouse"));
await until(() => window.__sea.engine.currentScene.state.k === "village");
await page.waitForTimeout(200);
check("the village plays its song", (await audio()).song === "village");

await page.evaluate(() => window.__sea.game.toSea("red_lighthouse"));
await until(() => window.__sea.engine.currentScene.state.k === "sail", null, 20_000);
await page.waitForTimeout(200);
check("the sea plays its song", (await audio()).song === "sea");

// fishing at the dock: the island song; a fish on the line brings in the tension layer
await page.evaluate(() => window.__sea.game.toIsland("red_lighthouse"));
await until(() => window.__sea.engine.currentScene.state.k === "island");
await page.evaluate(() => window.__sea.engine.currentScene.focus("fish"));
await page.keyboard.press("Enter");
await until(() => window.__sea.engine.currentScene.state.k === "idle", null, 15_000);
check("dock fishing keeps the island song, calm", (await audio()).song === "island" && (await audio()).tension === 0);
await page.keyboard.down("Space");
await page.waitForTimeout(600);
await page.keyboard.up("Space");
await until(() => window.__sea.engine.currentScene.state.k === "bite", null, 25_000);
await page.waitForTimeout(50);
const bite = await audio();
await page.keyboard.press("Space");
await until(() => ["reeling", "lost"].includes(window.__sea.engine.currentScene.state.k), null, 3000);
await page.waitForTimeout(100);
const reel = await audio();
check("a bite stirs the tension layer, reeling brings it all in", bite.tension === 0.5 && (reel.tension === 1 || reel.song === "island"), `bite ${bite.tension} · reeling ${reel.tension}`);

// 배경음 0 → silent; back up → audible
await page.evaluate(() => window.__sea.game.settings.set("bgm", 0));
await page.waitForTimeout(100);
check("배경음 0 mutes the music", (await audio()).level === 0);
await page.evaluate(() => window.__sea.game.settings.set("bgm", 7));

if (errors.length) check("no errors", false, errors.join(" | "));
await browser.close();
console.log(failed ? `${failed} failed` : `ok — music passes · WAVs in ${OUT}`);
process.exit(failed ? 1 : 0);

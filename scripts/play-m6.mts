// M6 check (design §13): sail from 빨간등대 to 검은등대 on the top-down map, stop at a point and
// fish, and exercise the sea's rules on the way.
//   packages/sprites/node_modules/.bin/tsx scripts/play-m6.mts [baseUrl] [outDir]   (Vite on :5173)
//
// Routes are planned here from the shared map data (a BFS over tiles with room for the hull);
// the game is only told "sail to this spot" — the same thing a click does — so the boat's own
// steering, inertia, collisions, sea gating and storms do the actual sailing.
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { dockFacing, ISLAND_BY_ID, isSolid, MAP_H, MAP_W, mapPoints, seaBlock, stormsAt, TILE, tileAt, type Gear } from "../packages/shared/src/index.ts";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (label: string, ok: boolean, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};

// ── route planning (Node side, shared map data) ─────────────────────────────

type Pt = [number, number];
/** Water with a one-tile margin of water around it (room for the hull), in a sea `gear` may enter. */
function roomy(tx: number, ty: number, gear: Gear, m = 1): boolean {
  for (let dy = -m; dy <= m; dy++)
    for (let dx = -m; dx <= m; dx++) {
      if (isSolid(tx + dx, ty + dy)) return false;
      const t = tileAt(tx + dx, ty + dy);
      if (!t || seaBlock(t.sea, gear) !== null) return false; // keep a tile off seas we can't enter
    }
  return true;
}

/** Same exact circle-vs-tile test the boat uses (SeaScene.blocked), plus the sea rule. */
function circleClear(x: number, y: number, r: number, gear: Gear): boolean {
  for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++)
    for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
      if (!isSolid(tx, ty)) continue;
      const nx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE)), ny = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return false;
    }
  const t = tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  return !!t && seaBlock(t.sea, gear) === null;
}

/** Can a boat of radius r sail straight from a to b (world px)? */
function lineClear(a: [number, number], b: [number, number], r: number, gear: Gear): boolean {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
  for (let i = 1; i <= n; i++) if (!circleClear(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, r, gear)) return false;
  return true;
}

const HULL_R: Record<number, number> = { 1: 5, 2: 5, 3: 6, 4: 7 };

/** Waypoints (tile coords) from the boat's exact position to `to`: BFS over tiles with the widest
 *  margin that still finds a way, then straight legs checked with the boat's own radius + slack
 *  for drift in turns. */
function route(fromPx: [number, number], to: Pt, gear: Gear): Pt[] | null {
  const from: Pt = [Math.floor(fromPx[0] / TILE), Math.floor(fromPx[1] / TILE)];
  const c = (p: Pt): [number, number] => [(p[0] + 0.5) * TILE, (p[1] + 0.5) * TILE];
  for (const m of [2, 1, 0]) {
    const path = bfs(from, to, gear, m);
    if (!path) continue;
    for (const slack of [5, 2, 0]) {
      const r = HULL_R[gear.hullLv]! + slack;
      const out: Pt[] = [];
      let at = fromPx, i = 0, ok = true;
      while (i < path.length - 1) {
        let j = path.length - 1;
        while (j > i && !lineClear(at, c(path[j]!), r, gear)) j--;
        if (j === i) { ok = false; break; } // not even the next tile is reachable this wide
        out.push(path[j]!);
        at = c(path[j]!);
        i = j;
      }
      if (ok) return out;
    }
  }
  return null;
}

function bfs(from: Pt, to: Pt, gear: Gear, m: number): Pt[] | null {
  const key = (x: number, y: number) => y * MAP_W + x;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const start = key(from[0], from[1]);
  prev[start] = start;
  const q = [start];
  const goal = key(to[0], to[1]);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    const cx = cur % MAP_W, cy = Math.floor(cur / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || prev[k] !== -1) continue;
      if (k !== goal && !roomy(nx, ny, gear, m)) continue;
      prev[k] = cur;
      q.push(k);
    }
  }
  if (prev[goal] === -1) return null;
  const path: Pt[] = [];
  for (let k = goal; k !== start; k = prev[k]!) path.push([k % MAP_W, Math.floor(k / MAP_W)]);
  path.push(from);
  path.reverse();
  return path;
}

/** A roomy tile next to (tx, ty) — docks and points sit close to things. */
function nearestRoomy(tx: number, ty: number, gear: Gear, maxR = 4): Pt {
  for (let r = 0; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (roomy(tx + dx, ty + dy, gear)) return [tx + dx, ty + dy];
  return [tx, ty];
}

// ── browser helpers ─────────────────────────────────────────────────────────

const browser = await chromium.launch();
const page: Page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

type View = {
  scene: string; k: string; boat: { x: number; y: number; speed: number } | null; target: boolean; prompt: string | null;
  toast: string | null; storm: number; island: string | null; spot: { kind: string; mapPointId?: string; deep?: boolean; storm?: boolean } | null;
  world: { at: { kind: string; id?: string }; hullLv: number; hullHp: number; fuel: number; day: number; hour: number; seaTime: number };
  clockH: number; explored: number;
};
const view = (): Promise<View> =>
  page.evaluate(() => {
    const sea = (window as any).__sea;
    const s = sea.engine.currentScene;
    const w = sea.game.world;
    return {
      scene: s.constructor.name,
      k: s.state.k,
      boat: s.boat ? { x: s.boat.x, y: s.boat.y, speed: Math.hypot(s.boat.vx, s.boat.vy) } : null,
      target: !!s.target,
      prompt: s.prompt?.kind ?? null,
      toast: s.toast?.text ?? null,
      storm: s.storm ?? 0,
      island: s.islandId ?? null,
      spot: s.spot ?? null,
      world: { at: w.at, hullLv: w.hullLv, hullHp: w.hullHp, fuel: w.fuel, day: w.day, hour: w.hour, seaTime: w.seaTime },
      clockH: sea.game.clockH,
      explored: s.explored?.count?.() ?? 0,
    };
  });
/** Every sea the boat has been seen in (sampled on every poll), with a screenshot of each. */
const seasSeen = new Set<string>();
let tracking = false;
async function track(v: View): Promise<void> {
  if (!tracking || v.scene !== "SeaScene" || !v.boat) return;
  const sea = tileAt(Math.floor(v.boat.x / TILE), Math.floor(v.boat.y / TILE))?.sea;
  if (sea && !seasSeen.has(sea)) {
    seasSeen.add(sea);
    await canvas.screenshot({ path: `${OUT}/m6-voyage-${sea}.png` });
  }
}
const waitFor = async (pred: (v: View) => boolean, timeout = 20_000, label = "") => {
  const t0 = Date.now();
  for (;;) {
    const v = await view();
    await track(v);
    if (pred(v)) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout ${label}; last ${JSON.stringify({ ...v, world: { ...v.world } })}`);
    await page.waitForTimeout(40);
  }
};
const canvas = page.locator("canvas");
const shot = (name: string) => canvas.screenshot({ path: `${OUT}/${name}.png` });
const tileOf = (v: View): Pt => [Math.floor(v.boat!.x / TILE), Math.floor(v.boat!.y / TILE)];
const pxOf = (v: View): [number, number] => [v.boat!.x, v.boat!.y];
const setScene = (fn: string, arg?: unknown) => page.evaluate(([f, a]) => new Function("s", "w", "a", f as string)((window as any).__sea.engine.currentScene, (window as any).__sea.game.world, a), [fn, arg] as const);

/** Sail along waypoints; each leg is a "sail there" order. Returns false if the boat got stuck. */
async function sail(waypoints: Pt[], opts: { onLeg?: (v: View, i: number) => Promise<void>; finalExact?: Pt } = {}): Promise<boolean> {
  for (let i = 0; i < waypoints.length; i++) {
    const [tx, ty] = waypoints[i]!;
    const last = i === waypoints.length - 1;
    const goal = last && opts.finalExact ? opts.finalExact : ([tx + 0.5, ty + 0.5] as Pt);
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      await setScene("s.target = { x: a[0] * 16, y: a[1] * 16 }; s.pending = null;", goal);
      const v = await waitFor((x) => !x.target || x.scene !== "SeaScene", 60_000, `leg ${i}`);
      ok = Math.hypot(v.boat!.x - goal[0] * TILE, v.boat!.y - goal[1] * TILE) < 14;
      if (!ok) await page.waitForTimeout(300); // knocked off course (storm, bump): aim again
    }
    if (!ok) {
      const x = await view();
      console.log(`     stuck on leg ${i}/${waypoints.length}: boat ${(x.boat!.x / TILE).toFixed(1)},${(x.boat!.y / TILE).toFixed(1)} → goal ${goal[0].toFixed(1)},${goal[1].toFixed(1)} · toast "${x.toast ?? ""}"`);
      return false;
    }
    await opts.onLeg?.(await view(), i);
  }
  return true;
}

/** Plan from wherever the boat is and sail; if knocked off a leg, plan again from there. */
async function voyageTo(goal: Pt, gear: Gear, opts: Parameters<typeof sail>[1] = {}): Promise<boolean> {
  for (let replan = 0; replan < 8; replan++) {
    const r = route(pxOf(await view()), goal, gear);
    if (!r) return false;
    if (await sail(r, opts)) return true;
    console.log("     re-planning from here");
  }
  return false;
}

// ── 1. lobby → island → cast off ───────────────────────────────────────────

await page.goto(BASE);
await page.evaluate(() => localStorage.removeItem("sea.local.v1"));
await page.reload();
await page.waitForFunction(() => (window as any).__sea?.ready && (window as any).__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
await page.waitForTimeout(650);
await page.keyboard.press("Enter");
await page.waitForFunction(() => (window as any).__sea.engine.currentScene.state.k === "name");
await page.keyboard.insertText("항해시험");
await page.keyboard.press("Enter");
let v = await waitFor((x) => x.scene === "IslandScene", 10_000, "island");
check("새 게임 starts tied up at 빨간등대", v.island === "red_lighthouse" && v.world.at.kind === "island");
await page.waitForTimeout(300);
await shot("m6-island");

await page.keyboard.press("ArrowDown"); // 출항
await page.waitForTimeout(50);
await page.keyboard.press("Enter");
const t0 = Date.now();
v = await waitFor((x) => x.scene === "SeaScene" && x.k === "sail", 15_000, "sea");
console.log(`     sea map ready in ${Date.now() - t0} ms`);
const dockT = ISLAND_BY_ID.red_lighthouse!.dock;
check("출항 puts the boat at the 빨간등대 dock", Math.hypot(v.boat!.x / TILE - dockT[0] - 0.5, v.boat!.y / TILE - dockT[1] - 0.5) < 0.6);
await page.waitForTimeout(250);
await shot("m6-sea-start");

// ── 2. keyboard steering + fuel ──
const fuel0 = v.world.fuel, x0 = v.boat!.x;
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(1800);
await page.keyboard.up("ArrowRight");
v = await waitFor((x) => (x.boat?.speed ?? 0) < 2, 8000, "coast to stop");
check("arrow keys steer the boat (and it coasts to a stop)", v.boat!.x > x0 + 60, `moved ${Math.round(v.boat!.x - x0)} px`);
check("fuel burns with distance", v.world.fuel < fuel0, `${fuel0} → ${v.world.fuel.toFixed(1)}`);

// ── 3. click to sail ──
const before = v.boat!;
await canvas.click({ position: { x: 900, y: 360 } }); // view (450, 180): east of the boat
v = await waitFor((x) => x.target, 2000, "click course");
check("a click sets a course", v.target);
v = await waitFor((x) => !x.target, 20_000, "click arrival");
check("click-to-sail moves toward the spot", v.boat!.x > before.x + 100, `moved ${Math.round(v.boat!.x - before.x)} px`);

// ── 4. Lv1 can't enter 청빛 바다 ──
const lv1: Gear = { hullLv: 1, lantern: false, fuelTank: false };
{
  // the nearest azure tile from here, then try to sail straight into it
  let best: Pt | null = null, bestD = 1e9;
  const [bx, by] = tileOf(v);
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = tileAt(tx, ty);
      if (!t || t.sea !== "azure" || isSolid(tx, ty)) continue;
      const d = Math.hypot(tx - bx, ty - by);
      if (d < bestD) { bestD = d; best = [tx, ty]; }
    }
  const [ax, ay] = best!;
  const deeper: Pt = [ax + Math.sign(ax - bx) * 6, ay + Math.sign(ay - by) * 6];
  await voyageTo(nearestRoomy(ax - Math.sign(ax - bx) * 3, ay - Math.sign(ay - by) * 3, lv1), lv1);
  await setScene("s.target = { x: a[0] * 16, y: a[1] * 16 };", [deeper[0] + 0.5, deeper[1] + 0.5]);
  let sawToast = "";
  const tEnd = Date.now() + 15_000;
  let entered = false;
  while (Date.now() < tEnd) {
    const x = await view();
    const t = tileAt(...tileOf(x));
    if (t?.sea === "azure") entered = true;
    if (x.toast?.includes("버티지")) sawToast = x.toast;
    if (!x.target) break;
    await page.waitForTimeout(50);
  }
  await shot("m6-blocked");
  check("Lv1 hull is pushed back from 청빛 바다", !entered && !!sawToast, sawToast);
}

// ── 5. stop at a 옥빛 point and fish ──
v = await view();
{
  const jadePts = mapPoints().filter((p) => p.pointId === "jade_1" && p.id.startsWith("p_jade"));
  const [bx, by] = tileOf(v);
  const p = jadePts.sort((a, b) => Math.hypot(a.tx - bx, a.ty - by) - Math.hypot(b.tx - bx, b.ty - by))[0]!;
  const ok = await voyageTo(nearestRoomy(p.tx, p.ty, lv1), lv1);
  check(`sailed to point ${p.id}`, ok);
  v = await waitFor((x) => (x.boat?.speed ?? 99) < 30, 5000, "slow at point");
  check("arrives in range of the point (prompt shows)", ok && v.prompt === "fish", `prompt=${v.prompt}`);
  await shot("m6-point");
  await page.keyboard.press("Space");
  v = await waitFor((x) => x.scene === "FishingScene" && x.k === "idle", 15_000, "fishing");
  check("Space at a point → 배 위 낚시 at that point", v.spot?.kind === "boat" && v.spot.mapPointId === p.id, JSON.stringify(v.spot));
  await page.waitForTimeout(300);
  await shot("m6-fishing-boat");
  await page.keyboard.down("Space");
  await page.waitForTimeout(600);
  await page.keyboard.up("Space");
  await waitFor((x) => x.k === "waiting", 5000, "cast");
  await page.keyboard.press("Space"); // pull in
  await waitFor((x) => x.k === "idle", 5000, "idle again");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !!(window as any).__sea.engine.currentScene.pause);
  await page.keyboard.press("ArrowDown"); // 바다로 돌아가기
  await page.waitForTimeout(50);
  await page.keyboard.press("Enter");
  v = await waitFor((x) => x.scene === "SeaScene" && x.k === "sail", 10_000, "back to sea");
  check("낚시 끝 → back on the map at the point", Math.hypot(v.boat!.x / TILE - p.tx - 0.5, v.boat!.y / TILE - p.ty - 0.5) < 4);
}

// ── 6. rowing when the tank is empty ──
await setScene("w.fuel = 0;");
await page.keyboard.down("ArrowLeft");
let top = 0;
for (let i = 0; i < 40; i++) {
  top = Math.max(top, (await view()).boat!.speed);
  await page.waitForTimeout(50);
}
await page.keyboard.up("ArrowLeft");
check("empty tank → rowing at ~30% speed", top > 5 && top < 66 * 0.3 + 6, `top ${top.toFixed(1)} px/s`);
await shot("m6-rowing");
await page.keyboard.press("KeyF"); // dev: refuel

// ── 7. hitting the shore costs hull; at 0 the boat is towed ──
{
  const isl = ISLAND_BY_ID.red_lighthouse!;
  const [fx, fy] = dockFacing(isl);
  await voyageTo(nearestRoomy(isl.dock[0] + Math.round(fx * 3), isl.dock[1] + Math.round(fy * 3), lv1), lv1);
  // ram the pier head-on at full speed
  await setScene("const h = Math.atan2(-a[1], -a[0]); s.boat.heading = h; s.boat.speed = 66; s.boat.vx = Math.cos(h) * 66; s.boat.vy = Math.sin(h) * 66;", [fx, fy]);
  const hp0 = (await view()).world.hullHp;
  await page.keyboard.down(fx > 0 ? "ArrowLeft" : "ArrowRight");
  v = await waitFor((x) => x.world.hullHp < hp0, 6000, "collision damage");
  await page.keyboard.up(fx > 0 ? "ArrowLeft" : "ArrowRight");
  check("ramming the pier damages the hull", v.world.hullHp < hp0, `${hp0} → ${v.world.hullHp} (${v.toast})`);
  await shot("m6-bump");
  await page.waitForTimeout(900); // past the per-impact cooldown
  await setScene("w.hullHp = 1; s.boat.x += a[0] * 24; s.boat.y += a[1] * 24; const h = Math.atan2(-a[1], -a[0]); s.boat.heading = h; s.boat.speed = 66; s.boat.vx = Math.cos(h) * 66; s.boat.vy = Math.sin(h) * 66;", [fx, fy]);
  v = await waitFor((x) => x.scene === "IslandScene", 10_000, "towed");
  check("hull 0 → towed to the nearest island", v.island === "red_lighthouse" && v.world.hullHp > 0, `hull now ${v.world.hullHp}`);
  await shot("m6-towed");
}

// ── 8. the long voyage: 빨간등대 → 검은등대 (dev: hull Lv4 + 연료통 + 등불) ──
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(50);
await page.keyboard.press("Enter"); // 출항
await waitFor((x) => x.scene === "SeaScene" && x.k === "sail", 10_000, "sea again");
for (let i = 0; i < 3; i++) await page.keyboard.press("KeyH"); // Lv1 → Lv4
v = await waitFor((x) => x.world.hullLv === 4, 2000, "hull Lv4").catch(() => view());
check("dev H: hull Lv4 with lantern + tank", v.world.hullLv === 4);
const lv4: Gear = { hullLv: 4, lantern: true, fuelTank: true };
const dest = ISLAND_BY_ID.black_lighthouse!;
const destApproach = nearestRoomy(dest.dock[0], dest.dock[1], lv4);
const voyage = route(pxOf(v), destApproach, lv4);
check("a route exists 빨간등대 → 검은등대", !!voyage, `${voyage?.length} legs`);
const seen = seasSeen;
const tv = Date.now();
const hullBefore = v.world.hullHp, fuelBefore = v.world.fuel;
tracking = true;
const ok = await voyageTo(destApproach, lv4, { finalExact: [dest.dock[0] + 0.5, dest.dock[1] + 0.5] });
tracking = false;
v = await view();
console.log(`     voyage: ${((Date.now() - tv) / 1000).toFixed(0)} s real, seas ${[...seen].join(" → ")}, fuel ${fuelBefore.toFixed(0)} → ${v.world.fuel.toFixed(0)}, hull ${hullBefore} → ${v.world.hullHp}`);
check("sailed all the way to 검은등대's dock", ok && v.prompt === "dock", `prompt=${v.prompt}`);
check("crossed all four seas", ["jade", "azure", "indigo", "ink"].every((s) => seen.has(s)), [...seen].join(","));
await page.keyboard.press("KeyM");
await page.waitForTimeout(250);
await shot("m6-chart");
v = await view();
await page.keyboard.press("KeyM");
await page.waitForFunction(() => !(window as any).__sea.engine.currentScene.chartOpen);
check("해도 reveals the route (fog of war)", v.explored > 1500, `${v.explored} tiles seen`);
await page.keyboard.press("Space");
v = await waitFor((x) => x.scene === "IslandScene", 10_000, "dock at 검은등대");
check("Space at the dock → 검은등대", v.island === "black_lighthouse");
await page.waitForTimeout(300);
await shot("m6-black-lighthouse");

// ── 9. storms ──
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(50);
await page.keyboard.press("Enter"); // 출항
v = await waitFor((x) => x.scene === "SeaScene" && x.k === "sail", 10_000, "sea for storm");
{
  // jump into whichever storm is nearest (test-only teleport), and watch it shove the boat
  const s = stormsAt(v.clockH).sort((a, b) => Math.hypot(a.x - dest.cx, a.y - dest.cy) - Math.hypot(b.x - dest.cx, b.y - dest.cy))[0]!;
  const spot = nearestRoomy(Math.round(s.x), Math.round(s.y), lv4, 6);
  await setScene("s.boat.x = a[0] * 16 + 8; s.boat.y = a[1] * 16 + 8; s.boat.vx = s.boat.vy = s.boat.speed = 0; s.target = null;", spot);
  await page.waitForTimeout(1500);
  v = await view();
  const drift = Math.hypot(v.boat!.x - (spot[0] * 16 + 8), v.boat!.y - (spot[1] * 16 + 8));
  await shot("m6-storm");
  check("storms push the boat and darken the view", v.storm > 0.2 && drift > 3, `intensity ${v.storm.toFixed(2)}, drifted ${drift.toFixed(1)} px in 1.5 s`);
}

// ── 10. the save remembers the sea ──
await page.waitForTimeout(5500); // past the 5 s autosave
v = await view();
await page.reload();
await page.waitForFunction(() => (window as any).__sea?.ready && (window as any).__sea.engine.currentScene.state.k === "menu", null, { timeout: 30_000 });
await page.waitForTimeout(650);
await page.keyboard.press("Enter"); // 이어하기
const after = await waitFor((x) => x.scene === "SeaScene" && x.k === "sail", 15_000, "resume at sea");
check("이어하기 resumes out at sea where the boat was", Math.hypot(after.boat!.x - v.boat!.x, after.boat!.y - v.boat!.y) < 40 && after.world.hullLv === 4, `${Math.round(after.boat!.x)},${Math.round(after.boat!.y)} vs ${Math.round(v.boat!.x)},${Math.round(v.boat!.y)}`);

await browser.close();
if (errors.length) {
  failed++;
  console.error(`${errors.length} console/page error(s):\n${errors.join("\n")}`);
}
console.log(failed ? `${failed} FAILED` : "ok — M6 voyage passes, no console errors");
process.exit(failed ? 1 : 0);

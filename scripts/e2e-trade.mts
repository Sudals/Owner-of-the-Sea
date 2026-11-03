// Server-side trades (Economy.md §8-1): casts + a 할멈 gift + a sale in one /api/save, and the
// server's gold/worms must match the shared rules run here.
//   packages/sprites/node_modules/.bin/tsx scripts/e2e-trade.mts [apiBase]
// Creates one test player named 거래xxxxxx; the name is printed at the end.
import { CAST_MS, kstDate, POINT_BY_ID, quoteSale, rollCast, emptyLog, type HoldLike } from "../packages/shared/src/index.ts";

const API = (process.argv[2] ?? "http://localhost:8787/api").replace(/\/$/, "");
const name = `거래${Date.now().toString(36).slice(-6)}`;
let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};
async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

const start = await api("POST", "/auth/start", { name });
const tok = start.json.token as string;
let me = await api("GET", "/me", undefined, tok);
check("a new player has 50G and 20 worms on the server", me.json.gold === 50 && me.json.inventory?.bait_worm === 20, `${me.json.gold}G, ${JSON.stringify(me.json.inventory)}`);

const s = (await api("POST", "/session/open", { spotId: "red_lighthouse_dock" }, tok)).json;
const point = POINT_BY_ID[s.pointId]!;
const now = Date.now();
let t = now;
const casts = [];
const hold: HoldLike[] = [];
for (let i = s.nextIndex; i < s.nextIndex + 3; i++) {
  const roll = rollCast(s.seed, i, point, { deep: s.conds.deep, storm: s.conds.storm, bait: "bait_worm" });
  t += Math.ceil(CAST_MS + roll.waitSec * 1000 + 700 + 50);
  casts.push({ i, fishId: roll.fishId, sizeCm: roll.sizeCm, result: "caught", reelMs: 700, t, seaT: 0, bait: "bait_worm" });
  hold.push({ id: `${s.sessionId}:${i}`, fishId: roll.fishId, sizeCm: roll.sizeCm, spotId: s.spotId, freshAt: 0 });
}
const want = quoteSale(hold, "red_lighthouse", { date: kstDate(now), now, clock: 0, iceLv: 0, log: emptyLog() }).total;
const body = {
  batchId: crypto.randomUUID(),
  reason: "shop",
  sessions: [{ sessionId: s.sessionId, sig: s.sig, closed: true, casts }],
  world: { at: { kind: "island", id: "red_lighthouse" }, hullHp: 100, fuel: 100, day: 1, hour: 9, seaTime: 0, chart: "" },
  holdIds: [],
  ops: [
    { kind: "gift", island: "red_lighthouse", t: t + 1000 },
    { kind: "sell", island: "red_lighthouse", ids: hold.map((h) => h.id), t: t + 2000 },
    { kind: "gift", island: "red_lighthouse", t: t + 3000 }, // a second gift the same day
    { kind: "buy", island: "red_lighthouse", item: "rod_2", t: t + 4000 }, // 빨간등대 sells nothing
  ],
};
const r = await api("POST", "/save", body, tok);
check("the save goes through", r.status === 200 && r.json.applied.casts === 3, `HTTP ${r.status} ${JSON.stringify(r.json?.rejected ?? r.json)}`);
check("the sale pays what the shared rules quote", r.json.gold === 50 + want && r.json.hold.length === 0, `${r.json.gold}G, want ${50 + want} (3 fish ${want}G)`);
check("3 bites used 3 worms, 할멈 gave 20", r.json.inventory.bait_worm === 37, JSON.stringify(r.json.inventory));
check("…only once a day, and 빨간등대 sells no rod", JSON.stringify(r.json.rejectedOps.map((o: any) => o.why)) === '["given","not_sold"]', JSON.stringify(r.json.rejectedOps));
check("the sale is noted for 수요", Object.keys(r.json.marketLog.demand).length > 0 && r.json.marketLog.gift === kstDate(now), JSON.stringify(r.json.marketLog));
check("the reply names the balance version", typeof r.json.configVersion === "number" && r.json.configVersion >= 1, `v${r.json.configVersion}`);
me = await api("GET", "/me", undefined, tok);
check("/me agrees after the save", me.json.gold === r.json.gold && me.json.inventory.bait_worm === 37);

console.log(`\nCREATED ${name}`);
console.log(failed ? `${failed} failed` : "ALL PASSED");
process.exit(failed ? 1 : 0);

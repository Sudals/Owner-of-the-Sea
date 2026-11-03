// Server-side trades (Economy.md §8-1): casts + a 할멈 gift + a sale in one /api/save, and the
// server's gold/worms must match the shared rules run here.
//   packages/sprites/node_modules/.bin/tsx scripts/e2e-trade.mts [apiBase]
// Creates one test player named 거래xxxxxx; the name is printed at the end.
import { balanceSchema, CAST_MS, FISH_BY_ID, kstDate, POINT_BY_ID, quoteSale, rollCast, emptyLog, withBalance, type HoldLike } from "../packages/shared/src/index.ts";

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
// roll with the balance version the session opened under, as the game does (GET /api/config?version=N)
const pinned = balanceSchema.parse((await api("GET", `/config?version=${s.configVersion}`)).json.data);
const roll0 = (seed: string, i: number, pointId: string) => withBalance(pinned, () => rollCast(seed, i, POINT_BY_ID[pointId]!, { deep: false, storm: false, bait: "bait_worm" }));
const point = POINT_BY_ID[s.pointId]!;
const now = Date.now();
let t = now;
const casts = [];
const hold: HoldLike[] = [];
for (let i = s.nextIndex; i < s.nextIndex + 3; i++) {
  const roll = roll0(s.seed, i, s.pointId);
  t += Math.ceil(CAST_MS + roll.waitSec * 1000 + 700 + 50);
  casts.push({ i, fishId: roll.fishId, sizeCm: roll.sizeCm, result: "caught", reelMs: 700, t, seaT: 0, bait: "bait_worm" });
  hold.push({ id: `${s.sessionId}:${i}`, fishId: roll.fishId, sizeCm: roll.sizeCm, spotId: s.spotId, freshAt: 0 });
}
const want = withBalance(pinned, () => quoteSale(hold, "red_lighthouse", { date: kstDate(now), now, clock: 0, iceLv: 0, log: emptyLog() }).total);
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

// ── consumables: buy 소금 + 얼음 덩이 at 소금꽃섬, salt one fish, ice the rest, at given clocks ──
{
  const s2 = (await api("POST", "/session/open", { spotId: "red_lighthouse_dock" }, tok)).json;
  let t2 = Date.now();
  const casts2 = [];
  const ids: string[] = [];
  // two real fish (a trash roll is kept too, but salt and ice don't work on it)
  for (let i = s2.nextIndex; ids.length < 2 && i < s2.nextIndex + 12; i++) {
    const roll = roll0(s2.seed, i, s2.pointId);
    t2 += Math.ceil(CAST_MS + roll.waitSec * 1000 + 750);
    casts2.push({ i, fishId: roll.fishId, sizeCm: roll.sizeCm, result: "caught", reelMs: 700, t: t2, seaT: 0, bait: "bait_worm" });
    if (!withBalance(pinned, () => FISH_BY_ID[roll.fishId]?.trash)) ids.push(`${s2.sessionId}:${i}`);
  }
  // the batch ends at seaTime 1800 (30 min): the fish are at 70%; salt at 600 s (90%), ice at 1200 s
  const body2 = {
    batchId: crypto.randomUUID(),
    reason: "shop",
    sessions: [{ sessionId: s2.sessionId, sig: s2.sig, closed: true, casts: casts2 }],
    world: { at: { kind: "island", id: "salt_flower" }, hullHp: 100, fuel: 100, day: 1, hour: 10, seaTime: 1800, chart: "" },
    holdIds: [],
    ops: [
      { kind: "buy", island: "salt_flower", item: "salt", t: t2 + 100, clock: 500 },
      { kind: "buy", island: "salt_flower", item: "ice_chunk", t: t2 + 200, clock: 500 },
      { kind: "use", item: "salt", target: ids[0], t: t2 + 300, clock: 600 },
      { kind: "use", item: "ice_chunk", t: t2 + 400, clock: 1200 },
      { kind: "use", item: "repair_kit", t: t2 + 500, clock: 1300 }, // none on board
      { kind: "use", item: "salt", target: ids[1], t: t2 + 600, clock: 99999 }, // no salt left (and a clock past the batch)
    ],
  };
  const r2 = await api("POST", "/save", body2, tok);
  const hold = r2.json.hold as any[];
  const salted = hold.find((h) => h.id === ids[0]), iced = hold.find((h) => h.id === ids[1]);
  check("소금 freezes freshness at the moment it was used (90%)", salted?.salted === 90, JSON.stringify(salted));
  check("얼음 덩이 gives the other fish +10%p (caught later in effect)", iced && Math.abs(iced.freshAt - 600) < 1e-6, JSON.stringify(iced));
  check("the items were bought and used up", (r2.json.inventory.salt ?? 0) === 0 && (r2.json.inventory.ice_chunk ?? 0) === 0, JSON.stringify(r2.json.inventory));
  check("no kit / no salt left are refused", JSON.stringify(r2.json.rejectedOps.map((o: any) => o.why)) === '["none","none"]', JSON.stringify(r2.json.rejectedOps));
}

console.log(`\nCREATED ${name}`);
console.log(failed ? `${failed} failed` : "ALL PASSED");
process.exit(failed ? 1 : 0);

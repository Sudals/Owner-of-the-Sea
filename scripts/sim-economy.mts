// Economy simulator (Economy.md §9): a virtual player fishes each sea with the real cast rolls
// and the real prices (balance.jsonc as bundled), fills the hold, sails to market and sells by a
// strategy. Prints gold per hour, bait and repair costs, and how long each sea's required
// purchases (§7-2) take — and checks the §9 criteria.
//   pnpm sim:economy            (packages/sprites/node_modules/.bin/tsx scripts/sim-economy.mts)
//   pnpm sim:economy -- --days 30
//
// Time model (assumptions, tune here): a cast = cast animation + the rolled wait + a fight that
// grows with the fish's pull + result screens; 70% of bites are landed (Economy.md §10); a full
// hold sails to market (minutes per sea below) and back. Prices move with the KST date, so the
// run spans several days.
import {
  CAST_MS, FISH_BY_ID, freshnessPct, holdCap, HULLS, impactDamage, ISLANDS, MARKETS, mapPoints, POINT_BY_ID, quoteSale, rollCast, stormDamagePerSec,
  balance, emptyLog, kstDate, type HoldLike, type MarketLog, type SeaColor,
} from "../packages/shared/src/index.ts";

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : NaN);
const DAYS = flag("--days") || 14;
/** Economy.md §7-1 assumes ~60 fish an hour with sailing and shops; the cast model is stretched to it. */
const FISH_PER_HOUR = flag("--fph") || 60;
const HOURS_PER_DAY = 2;
const LAND_RATE = 0.7;
const SEAS: SeaColor[] = ["jade", "azure", "indigo", "ink"];
const SEA_KO: Record<SeaColor, string> = { jade: "옥빛", azure: "청빛", indigo: "남빛", ink: "먹빛" };
/** Gear a player has while in each sea (hold, ice, hull). */
const GEAR: Record<SeaColor, { holdLv: number; iceLv: number; hullLv: 1 | 2 | 3 | 4 }> = {
  jade: { holdLv: 1, iceLv: 0, hullLv: 1 },
  azure: { holdLv: 2, iceLv: 1, hullLv: 2 },
  indigo: { holdLv: 3, iceLv: 2, hullLv: 3 },
  ink: { holdLv: 4, iceLv: 3, hullLv: 4 },
};
/** Round trip from the fishing grounds to market, minutes (sailing + docking + shop). */
const TRIP_MIN: Record<SeaColor, number> = { jade: 3, azure: 4, indigo: 5, ink: 6 };
const SPLIT_EXTRA_MIN = 1.5; // selling at a second island on the way
/** §7-2: what each sea's next step costs, and the target stay (hours). */
const TARGET: Record<SeaColor, { spend: number; hours: number }> = {
  jade: { spend: 1700, hours: 2 },
  azure: { spend: 5600, hours: 2.5 },
  indigo: { spend: 17000, hours: 3.5 },
  ink: { spend: 5000, hours: 2 },
};
const BUMPS_PER_HOUR = 3; // light knocks at 60% speed
const STORM_SHARE = 0.1; // share of sailing time in a storm (intensity 0.6)

type Strategy = { name: string; pick: (sea: SeaColor) => string[] | "best" };

const marketsIn = (sea: SeaColor) => ISLANDS.filter((i) => i.sea === sea && MARKETS[i.id] && Object.keys(MARKETS[i.id]!.buy).length).map((i) => i.id);
const spotsIn = (sea: SeaColor) => mapPoints().filter((mp) => POINT_BY_ID[mp.pointId]?.sea === sea);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

type Result = { gold: number; hours: number; fish: number; bait: number; repair: number; casts: number };

function play(sea: SeaColor, strategy: Strategy, opts: { onePoint?: boolean; seed?: number; k?: number } = {}): Result {
  const k = opts.k ?? 1; // time stretch (calibration)
  const r = rng(opts.seed ?? 7);
  const g = GEAR[sea];
  const cap = holdCap(g.holdLv);
  const spots = spotsIn(sea);
  const markets = marketsIn(sea);
  const pick = strategy.pick(sea);
  const log: MarketLog = emptyLog();
  const start = Date.UTC(2026, 10, 2, 0, 0, 0);
  let gold = 0, bait = 0, casts = 0, fish = 0, repair = 0;
  let playSec = 0; // play time
  let seaClock = 0; // freshness clock (seconds)
  let castIndex = 0;
  const seed = "5eed".repeat(8);
  for (let day = 0; day < DAYS; day++) {
    let dayPlay = 0;
    while (dayPlay < HOURS_PER_DAY * 3600) {
      // one trip: fish until the hold is full
      const spot = opts.onePoint ? spots[0]! : spots[Math.floor(r() * spots.length)]!;
      const point = POINT_BY_ID[spot.pointId]!;
      const hold: HoldLike[] = [];
      while (hold.length < cap) {
        const roll = rollCast(seed, castIndex++, point, { bait: "bait_worm" });
        const f = FISH_BY_ID[roll.fishId]!;
        // charge + cast + the rolled wait + the fight (longer for strong fish) + result screens
        const t = (1 + CAST_MS / 1000 + roll.waitSec + (4 + f.power * 1.5) + 2) * k;
        dayPlay += t;
        seaClock += t;
        casts++;
        bait += 1; // a bite eats a worm (1G each, 20 for 20G)
        if (r() < LAND_RATE) {
          hold.push({ id: `c${castIndex}`, fishId: roll.fishId, sizeCm: roll.sizeCm, spotId: spot.id, freshAt: seaClock });
          fish++;
        }
      }
      // sail to market
      const trip = TRIP_MIN[sea] * 60 * k;
      dayPlay += trip / 2;
      seaClock += trip / 2;
      const now = start + day * 86_400_000 + dayPlay * 1000;
      const ctx = { date: kstDate(now), now, clock: seaClock, iceLv: g.iceLv, log };
      let sold = 0;
      if (pick === "best") {
        // each fish to the island that pays most for it right now (특가, 시세, 수요)
        const by = new Map<string, HoldLike[]>();
        for (const h of hold) {
          let best = markets[0]!, bv = -1;
          for (const m of markets) {
            const v = quoteSale([h], m, { ...ctx, log }).total;
            if (v > bv) (bv = v), (best = m);
          }
          (by.get(best) ?? by.set(best, []).get(best)!).push(h);
        }
        for (const [m, items] of by) sold += sellAt(items, m, ctx, log);
        if (by.size > 1) dayPlay += SPLIT_EXTRA_MIN * 60 * k;
      } else {
        // fixed: the first listed island that buys it
        const left = [...hold];
        for (const m of pick) {
          const here = left.filter((h) => quoteSale([h], m, ctx).total > 0);
          sold += sellAt(here, m, ctx, log);
          for (const h of here) left.splice(left.indexOf(h), 1);
        }
      }
      gold += sold;
      dayPlay += trip / 2;
      seaClock += trip / 2;
      // wear: a few bumps and some storm time, repaired at the market
      const h = HULLS[g.hullLv];
      const tripH = (trip + 0) / 3600;
      const hp = impactDamage(g.hullLv, h.speed * 0.6, false) * BUMPS_PER_HOUR * tripH * 4 + stormDamagePerSec(g.hullLv, 0.6) * trip * STORM_SHARE;
      const perHp = balance().economy.repairPerHp[String(g.hullLv)] ?? 1;
      repair += hp * perHp;
    }
    playSec += dayPlay;
  }
  return { gold, hours: playSec / 3600, fish, bait, repair, casts };
}

function sellAt(items: HoldLike[], island: string, ctx: { date: string; now: number; clock: number; iceLv: number; log: MarketLog }, log: MarketLog): number {
  if (!items.length) return 0;
  const { total } = quoteSale(items, island, { ...ctx, log });
  // note the sales for 수요 the way a trade does
  const per = new Map<string, number>();
  for (const h of items) per.set(h.fishId, (per.get(h.fishId) ?? 0) + 1);
  for (const [fishId, k] of per) {
    const key = `${island}:${fishId}`;
    const d = balance().economy.demand;
    const e = log.demand[key];
    const recent = e ? Math.max(0, e[0] - (ctx.now - e[1]) / 60_000 / d.recoverMinPerFish) : 0;
    log.demand[key] = [recent + k, ctx.now];
  }
  return total;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const g0 = (x: number) => Math.round(x).toLocaleString("ko-KR");
let fails = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label} — ${detail}`);
  if (!ok) fails++;
};

console.log(`경제 시뮬레이션 · ${DAYS}일 × ${HOURS_PER_DAY}시간 · 입질 성공 ${LAND_RATE * 100}% · 시간당 ${FISH_PER_HOUR}마리 기준 · 미끼 지렁이\n`);
for (const sea of SEAS) {
  const markets = marketsIn(sea);
  const singles = markets.map((m) => ({ name: `${ISLANDS.find((i) => i.id === m)!.name}만`, pick: () => [m, ...markets.filter((x) => x !== m)] }) as Strategy);
  const best: Strategy = { name: "그때그때 제일 비싼 섬", pick: () => "best" };
  // calibrate: stretch the cast model until it lands FISH_PER_HOUR
  const raw = play(sea, singles[0]!);
  const k = raw.fish / raw.hours / FISH_PER_HOUR;
  const rows = [...singles, best].map((s) => ({ s, r: play(sea, s, { k }) }));
  const perH = (r: Result) => r.gold / r.hours;
  // the baseline: 물장터 in 옥빛 (§9), elsewhere the best single island
  const singleRows = rows.filter((x) => x.s !== best);
  const baseRow = sea === "jade" && markets.includes("water_market") ? singleRows.find((x) => x.s.name.startsWith("물장터"))! : singleRows.reduce((a, b) => (perH(b.r) > perH(a.r) ? b : a));
  console.log(`■ ${SEA_KO[sea]} 바다 (창고 ${holdCap(GEAR[sea].holdLv)}칸, 얼음 Lv${GEAR[sea].iceLv}, 선체 Lv${GEAR[sea].hullLv}) — 섬: ${markets.map((m) => ISLANDS.find((i) => i.id === m)!.name).join(", ")}`);
  for (const { s, r } of rows) {
    const net = (r.gold - r.bait - r.repair) / r.hours;
    console.log(`  ${s.name.padEnd(14)} 시간당 ${g0(perH(r)).padStart(6)}G (순 ${g0(net).padStart(6)}G) · ${Math.round(r.fish / r.hours)}마리/시간 · 1마리 ${g0(r.gold / r.fish)}G · vs 기준 ${pct(perH(r) / perH(baseRow.r) - 1)}`);
  }
  const b = rows.find((x) => x.s === best)!.r;
  const net = (b.gold - b.bait - b.repair) / b.hours;
  const stay = TARGET[sea].spend / net;
  // single point + one market: how much demand (포화) bites compared with spreading the sales
  const onePoint = play(sea, baseRow.s, { onePoint: true, k });
  console.log(`  (모델 그대로면 ${Math.round(raw.fish / raw.hours)}마리/시간 → ${FISH_PER_HOUR}마리/시간에 맞춤)`);
  console.log(`  비용: 미끼 ${pct(b.bait / b.gold)} · 수리 ${pct(b.repair / b.gold)} (수입 대비)`);
  console.log(`  목표 지출 ${g0(TARGET[sea].spend)}G까지 약 ${stay.toFixed(1)}시간 (목표 ${TARGET[sea].hours}시간)`);
  const others = rows.filter((x) => x !== baseRow && x.s !== best);
  if (sea === "jade") check("기준선(" + baseRow.s.name + ")이 다른 한 섬만 쓰는 것보다 낫거나 같다", others.every((x) => perH(x.r) <= perH(baseRow.r) * 1.0001), others.map((x) => `${x.s.name} ${pct(perH(x.r) / perH(baseRow.r) - 1)}`).join(", ") || "비교할 섬 없음");
  const gain = perH(b) / perH(baseRow.r) - 1;
  check(sea === "jade" ? "시세·특가를 보고 팔면 약 +7%" : "시세·특가를 보고 팔면 +12~20%", sea === "jade" ? gain > 0.03 && gain < 0.12 : gain >= 0.1 && gain <= 0.22, pct(gain));
  check("체류 시간이 목표의 ±30% 안", Math.abs(stay / TARGET[sea].hours - 1) <= 0.3, `${stay.toFixed(1)}h / ${TARGET[sea].hours}h`);
  check("시간당 수리비가 수입의 5% 이내", b.repair / b.gold <= 0.05, pct(b.repair / b.gold));
  console.log(`  (참고) 한 포인트만 돌 때: 시간당 ${g0(perH(onePoint))}G (${pct(perH(onePoint) / perH(baseRow.r) - 1)})\n`);
}
console.log(fails ? `${fails}개 기준을 벗어났어요 — balance.jsonc 조정 후보` : "모든 기준 통과");

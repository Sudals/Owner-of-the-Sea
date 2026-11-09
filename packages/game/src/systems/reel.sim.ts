// Headless tuning for the tension minigame (design §13 M3 "손맛 튜닝").
//   npx tsx src/systems/reel.sim.ts
// Two simulated players who watch the 유지 구간: a careful one (keeps the needle near the
// middle of the zone, 0.15 s reaction) and a sloppy one (lets it wander to the zone's edges,
// 0.3 s reaction). Reports catch rate, time, snaps and the zone width per fish group.
import { FISH } from "@sea/shared";
import { Reel } from "./reel";

type Policy = { name: string; margin: number; delay: number };
const POLICIES: Policy[] = [
  { name: "careful", margin: 0.2, delay: 0.15 },
  { name: "sloppy", margin: 0.42, delay: 0.3 },
];
const DT = 1 / 60;
const RUNS = 400;

function play(power: number, erratic: number, boss: boolean, policy: Policy, rodLv = 1, lineLv = 1) {
  const reel = new Reel({ power, erratic, boss, rodLv, lineLv, castPower: 0.6 });
  const width = reel.zone[1] - reel.zone[0];
  let decided = true;
  let lag = 0;
  while (!reel.outcome && reel.t < 180) {
    // aim at the zone's middle; react (late) when the needle drifts toward an edge
    const [lo, hi] = reel.zone, mid = (lo + hi) / 2, m = (hi - lo) * policy.margin;
    const want: boolean = reel.tension < mid - m ? true : reel.tension > mid + m ? false : decided;
    if (want !== decided) {
      lag += DT;
      if (lag >= policy.delay) { decided = want; lag = 0; }
    } else lag = 0;
    reel.update(DT, decided);
  }
  return { outcome: reel.outcome ?? "escaped", t: reel.t, width, inZone: reel.zoneTime / Math.max(0.01, reel.t) };
}

const groups: Record<string, { power: number; erratic: number; boss: boolean }[]> = { common: [], uncommon: [], rare: [], legendary: [], boss: [] };
for (const f of FISH) (groups[f.rarity] ??= []).push({ power: f.power, erratic: f.erratic, boss: f.rarity === "boss" });

for (const gear of [{ rodLv: 1, lineLv: 1 }, { rodLv: 3, lineLv: 3 }]) {
  console.log(`\n── rod Lv${gear.rodLv} / line Lv${gear.lineLv}`);
  for (const policy of POLICIES) {
    const cells: string[] = [];
    for (const [rarity, fish] of Object.entries(groups)) {
      let caught = 0, time = 0, snapped = 0, n = 0, width = 0, inZone = 0;
      for (const f of fish)
        for (let i = 0; i < RUNS; i++) {
          const r = play(f.power, f.erratic, f.boss, policy, gear.rodLv, gear.lineLv);
          n++;
          width += r.width;
          inZone += r.inZone;
          if (r.outcome === "caught") { caught++; time += r.t; }
          if (r.outcome === "snapped") snapped++;
        }
      cells.push(`${rarity} ${((caught / n) * 100).toFixed(0)}% ${(time / Math.max(1, caught)).toFixed(1)}s snap ${((snapped / n) * 100).toFixed(0)}% zone ${((width / n) * 100).toFixed(0)}% in ${((inZone / n) * 100).toFixed(0)}%`);
    }
    console.log(`${policy.name.padEnd(8)} ${cells.join(" | ")}`);
  }
}

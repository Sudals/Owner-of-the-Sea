// Headless tuning for the tension minigame (design §13 M3 "손맛 튜닝").
//   npx tsx src/systems/reel.sim.ts
// Two simulated players: a careful one (hold below 60% tension, release above 80%, 0.15 s
// reaction) and a sloppy one (55%/85%, 0.3 s). Reports catch rate and time per fish group.
import { FISH } from "@sea/shared";
import { Reel } from "./reel";

type Policy = { name: string; low: number; high: number; delay: number };
const POLICIES: Policy[] = [
  { name: "careful", low: 0.6, high: 0.8, delay: 0.15 },
  { name: "sloppy", low: 0.55, high: 0.85, delay: 0.3 },
];
const DT = 1 / 60;
const RUNS = 400;

function play(power: number, erratic: number, boss: boolean, policy: Policy, rodLv = 1, lineLv = 1) {
  const reel = new Reel({ power, erratic, boss, rodLv, lineLv, castPower: 0.6 });
  let holding = true;
  let decided = true;
  let lag = 0;
  while (!reel.outcome && reel.t < 180) {
    // decide with a reaction delay
    const want: boolean = reel.tension < policy.low ? true : reel.tension > policy.high ? false : decided;
    if (want !== decided) {
      lag += DT;
      if (lag >= policy.delay) { decided = want; lag = 0; }
    } else lag = 0;
    holding = decided;
    reel.update(DT, holding);
  }
  return { outcome: reel.outcome ?? "escaped", t: reel.t };
}

const groups: Record<string, { power: number; erratic: number; boss: boolean }[]> = { common: [], uncommon: [], rare: [], legendary: [], boss: [] };
for (const f of FISH) (groups[f.rarity] ??= []).push({ power: f.power, erratic: f.erratic, boss: f.rarity === "boss" });

for (const gear of [{ rodLv: 1, lineLv: 1 }, { rodLv: 3, lineLv: 3 }]) {
  console.log(`\n── rod Lv${gear.rodLv} / line Lv${gear.lineLv}`);
  for (const policy of POLICIES) {
    const cells: string[] = [];
    for (const [rarity, fish] of Object.entries(groups)) {
      let caught = 0, time = 0, snapped = 0, n = 0;
      for (const f of fish)
        for (let i = 0; i < RUNS; i++) {
          const r = play(f.power, f.erratic, f.boss, policy, gear.rodLv, gear.lineLv);
          n++;
          if (r.outcome === "caught") { caught++; time += r.t; }
          if (r.outcome === "snapped") snapped++;
        }
      cells.push(`${rarity} ${((caught / n) * 100).toFixed(0)}% ${(time / Math.max(1, caught)).toFixed(1)}s (snap ${((snapped / n) * 100).toFixed(0)}%)`);
    }
    console.log(`${policy.name.padEnd(8)} ${cells.join(" | ")}`);
  }
}

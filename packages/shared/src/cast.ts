import { FISH_BY_ID } from "./data/fish";
import { applyMod, DEEP_TILE_BONUS, FISH_GRADES, SIZE_BANDS, SIZE_GRADES, ZONE_ODDS, type FishGrade, type Odds, type SizeGrade } from "./data/odds";
import { POLLUTANT_BY_SEA, type FishingPoint } from "./data/points";
import { OMEN } from "./data/scoring";
import { seeded, weighted } from "./rng";

// One cast = one seeded roll (design §4-1, §4-8, §11-3):
//   fish grade (zone odds × point × deep tile) → species of that grade living here
//   → size grade (same odds) → size inside that grade's band → wait time.
// The client plays it out; the server recomputes the same roll from the seed to verify a save.

export type CastRoll = { fishId: string; sizeCm: number; sizeGrade: SizeGrade; waitSec: number };
export type CastOptions = {
  /** The cast an active omen landed on (see omenCastIndex) bites the sea's pollutant (§4-5). */
  pollutant?: boolean;
  /** Cast made on a dark deep-sea tile of the top-down map (§4-8). Defaults to the point's flag. */
  deep?: boolean;
};

/** Effective odds at a point (zone table × point tweak × deep-tile bonus). */
export function oddsAt(point: FishingPoint, deep = point.deep ?? false): Odds {
  return applyMod(ZONE_ODDS[point.sea], point.odds, deep ? DEEP_TILE_BONUS : undefined);
}

export function rollCast(seedHex: string, castIndex: number, point: FishingPoint, opts: CastOptions = {}): CastRoll {
  const r = seeded(seedHex, "cast", castIndex);
  const odds = oddsAt(point, opts.deep ?? point.deep ?? false);

  let fishId: string;
  if (opts.pollutant) fishId = POLLUTANT_BY_SEA[point.sea];
  else {
    let grade = weighted(r, FISH_GRADES.map((g) => [g, odds.grade[g]] as const));
    let pool = speciesOf(point, grade);
    // a grade nobody here belongs to falls back one grade down
    for (let gi = FISH_GRADES.indexOf(grade); !pool.length && gi > 0; ) {
      grade = FISH_GRADES[--gi]!;
      pool = speciesOf(point, grade);
    }
    fishId = pool[Math.floor(r() * pool.length)] ?? point.pool[0]!;
  }

  const sizeGrade = weighted(r, SIZE_GRADES.map((g) => [g, odds.size[g]] as const));
  const [lo, hi] = SIZE_BANDS[sizeGrade];
  const [min, max] = FISH_BY_ID[fishId]!.size;
  const sizeCm = Math.round((min + (max - min) * (lo + r() * (hi - lo))) * 10) / 10;
  const waitSec = 2 + r() * 6; // design §4-1: 2–8 s
  return { fishId, sizeCm, sizeGrade, waitSec };
}

function speciesOf(point: FishingPoint, grade: FishGrade): string[] {
  return point.pool.filter((id) => FISH_BY_ID[id]?.rarity === grade);
}

/** Size grade of an arbitrary size for a species (e.g. to re-derive it server-side). */
export function sizeGradeOf(fishId: string, sizeCm: number): SizeGrade {
  const [min, max] = FISH_BY_ID[fishId]!.size;
  const f = (sizeCm - min) / Math.max(1e-9, max - min);
  for (let i = SIZE_GRADES.length - 1; i >= 0; i--) if (f >= SIZE_BANDS[SIZE_GRADES[i]!][0]) return SIZE_GRADES[i]!;
  return "D";
}

/** An omen guarantees a pollutant within the next OMEN.guaranteedWithinCasts casts; the seed picks which. */
export function omenCastIndex(seedHex: string, omenStartIndex: number): number {
  return omenStartIndex + Math.floor(seeded(seedHex, "omen", omenStartIndex)() * OMEN.guaranteedWithinCasts);
}

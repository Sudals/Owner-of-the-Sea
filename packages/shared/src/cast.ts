import { balance } from "./balance";
import { FISH_BY_ID } from "./data/fish";
import { applyMod, DEEP_TILE_BONUS, FISH_GRADES, STORM_BONUS, SIZE_BANDS, SIZE_GRADES, ZONE_ODDS, type FishGrade, type Odds, type SizeGrade } from "./data/odds";
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
  /** Cast made inside a storm (§3-3). */
  storm?: boolean;
  /** Bait on the hook (Economy.md §4-1): an item id, or "none" for a bare hook. Default: 지렁이. */
  bait?: string;
};

export const BARE_HOOK = "none";

/** Is a cast in "deep water" for baits that only work there (발광 미끼: 남빛·먹빛·심해 칸)? */
const deepWater = (point: FishingPoint, deep: boolean) => deep || point.sea === "indigo" || point.sea === "ink";

/** Effective odds at a point (zone table × point tweak × deep-tile bonus × storm bonus). */
export function oddsAt(point: FishingPoint, deep = point.deep ?? false, storm = false): Odds {
  return applyMod(ZONE_ODDS[point.sea], point.odds, deep ? DEEP_TILE_BONUS : undefined, storm ? STORM_BONUS : undefined);
}

export function rollCast(seedHex: string, castIndex: number, point: FishingPoint, opts: CastOptions = {}): CastRoll {
  const r = seeded(seedHex, "cast", castIndex);
  const b = balance();
  const deep = opts.deep ?? point.deep ?? false;
  const bait = b.fishing.bait[opts.bait ?? "bait_worm"] ?? {};
  const baitWorks = !bait.onlyDeep || deepWater(point, deep);
  const odds = applyMod(oddsAt(point, deep, opts.storm ?? false), baitWorks ? { grade: bait.grade, size: bait.size } : undefined);

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
    // 대형 미끼: big species are likelier (same single draw as the uniform pick)
    const big = baitWorks && bait.largeFish && bait.largeFish !== 1 ? bait.largeFish : 0;
    fishId = big
      ? weighted(r, pool.map((id) => [id, isLarge(id) ? big : 1] as const))
      : (pool[Math.floor(r() * pool.length)] ?? point.pool[0]!);
  }

  const sizeGrade = weighted(r, SIZE_GRADES.map((g) => [g, odds.size[g]] as const));
  const [lo, hi] = SIZE_BANDS[sizeGrade];
  const [min, max] = FISH_BY_ID[fishId]!.size;
  const sizeCm = Math.round((min + (max - min) * (lo + r() * (hi - lo))) * 10) / 10;
  const [w0, w1] = b.fishing.waitSec; // design §4-1: 2–8 s
  const waitSec = (w0 + r() * (w1 - w0)) * (bait.waitMul ?? 1); // a bare hook waits longer
  const junk = opts.pollutant ? null : rollTrash(seedHex, castIndex, point);
  if (junk) return { ...junk, waitSec };
  return { fishId, sizeCm, sizeGrade, waitSec };
}

/** 쓰레기 instead of the fish (balance fishing.trash). Its own seeded stream, so a cast that isn't
 *  trash rolls exactly as it would without trash (and a balance without the section never does). */
function rollTrash(seedHex: string, castIndex: number, point: FishingPoint): { fishId: string; sizeCm: number; sizeGrade: SizeGrade } | null {
  const t = balance().fishing.trash;
  if (!t) return null;
  const rt = seeded(seedHex, "trash", castIndex);
  const chance = t.chance[point.sea] + (point.kind === "dock" ? t.dockBonus : 0);
  if (rt() >= chance) return null;
  const kinds = Object.entries(t.kinds).map(([id, k]) => [id, k.weight * (k.bySea?.[point.sea] ?? 1)] as const).filter(([, w]) => w > 0);
  if (!kinds.length) return null;
  const fishId = weighted(rt, kinds);
  const [min, max] = t.kinds[fishId]!.sizeCm;
  return { fishId, sizeCm: Math.round((min + (max - min) * rt()) * 10) / 10, sizeGrade: "B" };
}

/** 대형: the middle of the species' size range is at least economy.largeFromCm. */
function isLarge(fishId: string): boolean {
  const f = FISH_BY_ID[fishId];
  return !!f && (f.size[0] + f.size[1]) / 2 >= balance().economy.largeFromCm;
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

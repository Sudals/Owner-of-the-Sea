import { balanceSchema, balanceVersion, defaultBalance, setBalance, type Balance } from "@sea/shared";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/pool";
import { gameConfig } from "../db/schema";

// balance.jsonc as applied to the DB (`pnpm balance:apply`). The newest row is what new sessions
// and shop trades use; each fishing session remembers the version it opened under, so its casts
// are always re-rolled with the same numbers the client used. Version 0 = the default bundled
// with this build (before anything was applied).
//
// The latest version is also made the process-wide balance (every request refreshes it, see
// index.ts), so shop rules, hull/fuel limits and new sessions all read it through balance().
// Pinned per-session rolls swap in their own version synchronously with withBalance().

const LATEST_TTL_MS = 30_000;
let latest: { version: number; data: Balance; at: number } | null = null;
const byVersion = new Map<number, Balance>();

export async function latestBalance(): Promise<{ version: number; data: Balance }> {
  if (latest && Date.now() - latest.at < LATEST_TTL_MS) return latest;
  const [row] = await db.select().from(gameConfig).orderBy(desc(gameConfig.version)).limit(1);
  const data = row ? cached(row.version, row.data) : defaultBalance();
  latest = { version: row?.version ?? 0, data, at: Date.now() };
  if (balanceVersion() !== latest.version) setBalance(data, latest.version);
  return latest;
}

export async function balanceAt(version: number): Promise<Balance> {
  if (version <= 0) return defaultBalance();
  const hit = byVersion.get(version);
  if (hit) return hit;
  const [row] = await db.select().from(gameConfig).where(eq(gameConfig.version, version));
  return row ? cached(row.version, row.data) : defaultBalance();
}

function cached(version: number, raw: unknown): Balance {
  const hit = byVersion.get(version);
  if (hit) return hit;
  const data = balanceSchema.parse(raw);
  byVersion.set(version, data);
  return data;
}

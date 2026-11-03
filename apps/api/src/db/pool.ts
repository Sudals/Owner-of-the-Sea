import { attachDatabasePool } from "@neon/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Neon Functions (design §10-0): one pg Pool per isolate at module scope, reused across
// requests. DATABASE_URL (pooled) is injected by Neon; `neon dev` injects it locally.

function connectionString(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  // pg already treats sslmode=require as verify-full; make it explicit (silences a deprecation warning).
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

export const pool = new Pool({ connectionString: connectionString(), max: 5 });
// Idle disconnects become silent instead of an uncaughtException that kills the isolate.
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pool-backed db or an open transaction. */
export type DbLike = Db | Tx;

/** Unwraps drizzle's query error to the underlying pg error (code, constraint, …). */
export function pgErrorOf(e: unknown): { code?: string; constraint?: string } {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return err?.cause?.code ? err.cause : (err ?? {});
}

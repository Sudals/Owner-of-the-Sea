import { createHmac, randomBytes } from "node:crypto";
import { RECOVERY_ALPHABET } from "@sea/shared";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, type DbLike } from "../db/pool";
import { accounts, sessions } from "../db/schema";

// Design §5-1: random 32-byte device token; the DB stores only its keyed hash
// (HMAC-SHA256 with SESSION_PEPPER, so a leaked table alone can't be replayed).
// There is no password to sign in again with, so the token lives long: 365 days, sliding on use.

export const SESSION_TTL_DAYS = 365;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // base64url of 32 bytes

function pepper(): string {
  const p = process.env.SESSION_PEPPER;
  if (!p) throw new Error("SESSION_PEPPER is not set");
  return p;
}

export function hashToken(token: string): string {
  return createHmac("sha256", pepper()).update(token).digest("hex");
}

/** 이어하기 코드: 80 random bits as 16 Crockford base32 chars, XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(10);
  let bits = 0, acc = 0, out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += RECOVERY_ALPHABET[(acc >> bits) & 31];
    }
  }
  return out.match(/.{4}/g)!.join("-");
}

/** Keyed hash of a normalized code (domain-separated from session tokens). */
export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", pepper()).update(`recovery:${code}`).digest("hex");
}

export async function createSession(
  tx: DbLike,
  accountId: string,
  userAgent: string | null,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const [row] = await tx
    .insert(sessions)
    .values({
      accountId,
      tokenHash: hashToken(token),
      expiresAt: sql`now() + make_interval(days => ${SESSION_TTL_DAYS})`,
      userAgent: userAgent?.slice(0, 256) ?? null,
    })
    .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
  return { token, sessionId: row!.id, expiresAt: row!.expiresAt };
}

export type ActiveSession = { sessionId: string; accountId: string; banned: boolean };

/** Looks up a live session by bearer token and slides its expiry — a single UPDATE … RETURNING. */
export async function touchSession(token: string): Promise<ActiveSession | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db
    .update(sessions)
    .set({
      expiresAt: sql`now() + make_interval(days => ${SESSION_TTL_DAYS})`,
      lastSeenAt: sql`now()`,
    })
    .from(accounts)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, sql`now()`), eq(accounts.id, sessions.accountId)))
    .returning({ sessionId: sessions.id, accountId: sessions.accountId, banned: accounts.banned });
  return row ?? null;
}

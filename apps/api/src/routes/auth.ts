import { loginRequest, OMEN, passwordChangeRequest, signupRequest, START_ISLAND_ID, STARTING_PLAYER, type AccountDto } from "@sea/shared";
import { and, eq, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password";
import { requireAuth, type AuthedEnv } from "../auth/requireAccount";
import { createSession } from "../auth/session";
import { clearThrottle, LIMITS, lockedUntil, recordFailure, retryAfterSec, throttleKeys } from "../auth/throttle";
import { db, pgErrorOf } from "../db/pool";
import { accounts, endless, players, sessions, unlocks, type Account } from "../db/schema";
import { apiError, clientIp, internalError, readJson } from "../http";

// Design §5: POST /api/auth/{signup,login,logout,logout-all,password}

export const toAccountDto = (a: Account): AccountDto => ({
  id: a.id,
  username: a.username,
  nickname: a.nickname,
  createdAt: a.createdAt.toISOString(),
});

const lockedResponse = (until: Date) =>
  apiError(429, "locked", "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.", { retryAfterSec: retryAfterSec(until) });

export const authRoutes = new Hono<AuthedEnv>();

authRoutes.post("/signup", async (c) => {
  const body = await readJson(c.req.raw, signupRequest);
  if (body instanceof Response) return body;
  try {
    // friendly pre-check; the UNIQUE constraints below are the real guard against races
    const taken = await db
      .select({ username: accounts.username, nickname: accounts.nickname })
      .from(accounts)
      .where(or(eq(accounts.username, body.username), eq(accounts.nickname, body.nickname)));
    if (taken.some((t) => t.username.toLowerCase() === body.username))
      return apiError(409, "username_taken", "이미 사용 중인 아이디예요.", { fields: { username: "이미 사용 중인 아이디예요." } });
    if (taken.some((t) => t.nickname.toLowerCase() === body.nickname.toLowerCase()))
      return apiError(409, "nickname_taken", "이미 사용 중인 닉네임이에요.", { fields: { nickname: "이미 사용 중인 닉네임이에요." } });

    const passwordHash = await hashPassword(body.password);
    const { account, session } = await db.transaction(async (tx) => {
      const [account] = await tx
        .insert(accounts)
        .values({ username: body.username, nickname: body.nickname, passwordHash, lastLoginAt: new Date() })
        .returning();
      await tx.insert(players).values({ accountId: account!.id, locationId: START_ISLAND_ID, ...STARTING_PLAYER });
      await tx.insert(endless).values({ accountId: account!.id, nextThreshold: OMEN.firstThreshold, thresholdStep: OMEN.firstThreshold });
      await tx.insert(unlocks).values({ accountId: account!.id, islandId: START_ISLAND_ID });
      const session = await createSession(tx, account!.id, c.req.header("user-agent") ?? null);
      return { account: account!, session };
    });
    return c.json({ token: session.token, expiresAt: session.expiresAt.toISOString(), account: toAccountDto(account) }, 201);
  } catch (e) {
    const pe = pgErrorOf(e);
    if (pe.code === "23505") {
      const nick = pe.constraint?.includes("nickname");
      return nick
        ? apiError(409, "nickname_taken", "이미 사용 중인 닉네임이에요.", { fields: { nickname: "이미 사용 중인 닉네임이에요." } })
        : apiError(409, "username_taken", "이미 사용 중인 아이디예요.", { fields: { username: "이미 사용 중인 아이디예요." } });
    }
    return internalError("auth/signup", e);
  }
});

authRoutes.post("/login", async (c) => {
  const body = await readJson(c.req.raw, loginRequest);
  if (body instanceof Response) return body;
  try {
    const keys = throttleKeys(body.username, clientIp(c.req.raw));
    const until = await lockedUntil([keys.login, ...(keys.ip ? [keys.ip] : [])]);
    if (until) return lockedResponse(until);

    const [account] = await db.select().from(accounts).where(eq(accounts.username, body.username));
    const ok = await verifyPassword(account?.passwordHash, body.password); // constant work even when unknown
    if (!account || !ok) {
      const locks = await Promise.all([
        recordFailure(keys.login, LIMITS.login),
        keys.ip ? recordFailure(keys.ip, LIMITS.ip) : Promise.resolve(null),
      ]);
      const lock = locks.find((l): l is Date => l instanceof Date);
      if (lock) return lockedResponse(lock);
      return apiError(401, "invalid_credentials", "아이디 또는 비밀번호가 올바르지 않아요.");
    }
    if (account.banned) return apiError(403, "banned", "이용이 제한된 계정이에요.");

    await clearThrottle(keys.login);
    const [updated] = await db.update(accounts).set({ lastLoginAt: new Date() }).where(eq(accounts.id, account.id)).returning();
    const session = await createSession(db, account.id, c.req.header("user-agent") ?? null);
    return c.json({ token: session.token, expiresAt: session.expiresAt.toISOString(), account: toAccountDto(updated ?? account) });
  } catch (e) {
    return internalError("auth/login", e);
  }
});

authRoutes.post("/logout", requireAuth, async (c) => {
  await db.delete(sessions).where(eq(sessions.id, c.get("session").sessionId));
  return c.json({ ok: true });
});

authRoutes.post("/logout-all", requireAuth, async (c) => {
  const gone = await db.delete(sessions).where(eq(sessions.accountId, c.get("session").accountId)).returning({ id: sessions.id });
  return c.json({ ok: true, revoked: gone.length });
});

authRoutes.post("/password", requireAuth, async (c) => {
  const body = await readJson(c.req.raw, passwordChangeRequest);
  if (body instanceof Response) return body;
  const { accountId, sessionId } = c.get("session");
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account) return apiError(401, "unauthorized", "로그인이 필요해요.");
    const key = throttleKeys(account.username, null).login;
    const until = await lockedUntil([key]);
    if (until) return lockedResponse(until);
    if (!(await verifyPassword(account.passwordHash, body.current))) {
      const lock = await recordFailure(key, LIMITS.login);
      if (lock) return lockedResponse(lock);
      return apiError(401, "invalid_credentials", "기존 비밀번호가 올바르지 않아요.", { fields: { current: "기존 비밀번호가 올바르지 않아요." } });
    }
    const passwordHash = await hashPassword(body.next);
    const revoked = await db.transaction(async (tx) => {
      await tx.update(accounts).set({ passwordHash }).where(eq(accounts.id, accountId));
      // every other device is signed out; this one stays signed in
      const gone = await tx
        .delete(sessions)
        .where(and(eq(sessions.accountId, accountId), ne(sessions.id, sessionId)))
        .returning({ id: sessions.id });
      return gone.length;
    });
    await clearThrottle(key);
    return c.json({ ok: true, revokedOtherSessions: revoked });
  } catch (e) {
    return internalError("auth/password", e);
  }
});

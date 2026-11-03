import { OMEN, recoverRequest, START, START_ISLAND_ID, startRequest, STARTING_PLAYER, type AccountDto } from "@sea/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthedEnv } from "../auth/requireAccount";
import { createSession, hashRecoveryCode, newRecoveryCode } from "../auth/session";
import { LIMITS, lockedUntil, recordHit, retryAfterSec, throttleKey } from "../auth/throttle";
import { db, pgErrorOf } from "../db/pool";
import { accounts, endless, inventory, players, sessions, unlocks, type Account } from "../db/schema";
import { apiError, clientIp, internalError, readJson } from "../http";

// Design §5-2 — name only, until Steam:
//   POST /api/auth/start          { name } → new player + device token + 이어하기 코드
//   POST /api/auth/recover        { code } → device token for an existing player (another PC)
//   POST /api/auth/recovery-code  (Bearer) → a fresh 이어하기 코드; the old one stops working
//   POST /api/auth/logout         (Bearer) → forget this device

export const toAccountDto = (a: Account): AccountDto => ({
  id: a.id,
  name: a.nickname,
  createdAt: a.createdAt.toISOString(),
});

const NAME_TAKEN = "이미 누군가 쓰고 있는 이름이에요.";
const nameTaken = () => apiError(409, "name_taken", NAME_TAKEN, { fields: { name: NAME_TAKEN } });
const lockedResponse = (until: Date, message: string) => apiError(429, "locked", message, { retryAfterSec: retryAfterSec(until) });

export const authRoutes = new Hono<AuthedEnv>();

authRoutes.post("/start", async (c) => {
  const body = await readJson(c.req.raw, startRequest);
  if (body instanceof Response) return body;
  const key = throttleKey("start", clientIp(c.req.raw));
  try {
    const until = key ? await lockedUntil([key]) : null;
    if (until) return lockedResponse(until, "새 이름을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요.");
    // friendly pre-check; the UNIQUE constraint below is the real guard against races
    const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.nickname, body.name));
    if (taken) return nameTaken();

    const code = newRecoveryCode();
    const { account, session } = await db.transaction(async (tx) => {
      const [account] = await tx
        .insert(accounts)
        .values({ nickname: body.name, recoveryHash: hashRecoveryCode(code), lastLoginAt: new Date() })
        .returning();
      await tx.insert(players).values({ accountId: account!.id, locationId: START_ISLAND_ID, ...STARTING_PLAYER });
      await tx.insert(endless).values({ accountId: account!.id, nextThreshold: OMEN.firstThreshold, thresholdStep: OMEN.firstThreshold });
      await tx.insert(unlocks).values({ accountId: account!.id, islandId: START_ISLAND_ID });
      // Economy.md §6-2: 50G and 20 worms to start
      if (START.worms > 0) await tx.insert(inventory).values({ accountId: account!.id, itemId: "bait_worm", qty: START.worms });
      const session = await createSession(tx, account!.id, c.req.header("user-agent") ?? null);
      return { account: account!, session };
    });
    if (key) await recordHit(key, LIMITS.start);
    return c.json(
      { token: session.token, expiresAt: session.expiresAt.toISOString(), account: toAccountDto(account), recoveryCode: code },
      201,
    );
  } catch (e) {
    if (pgErrorOf(e).code === "23505") return nameTaken();
    return internalError("auth/start", e);
  }
});

authRoutes.post("/recover", async (c) => {
  const body = await readJson(c.req.raw, recoverRequest);
  if (body instanceof Response) return body;
  const key = throttleKey("recover", clientIp(c.req.raw));
  const locked = (until: Date) => lockedResponse(until, "코드를 너무 많이 틀렸어요. 잠시 후 다시 시도해 주세요.");
  try {
    const until = key ? await lockedUntil([key]) : null;
    if (until) return locked(until);
    const [account] = await db.select().from(accounts).where(eq(accounts.recoveryHash, hashRecoveryCode(body.code)));
    if (!account) {
      const lock = key ? await recordHit(key, LIMITS.recover) : null;
      if (lock) return locked(lock);
      return apiError(401, "invalid_code", "맞는 기록을 찾지 못했어요. 코드를 다시 확인해 주세요.", { fields: { code: "코드를 다시 확인해 주세요." } });
    }
    if (account.banned) return apiError(403, "banned", "이용이 제한된 계정이에요.");
    const [updated] = await db.update(accounts).set({ lastLoginAt: new Date() }).where(eq(accounts.id, account.id)).returning();
    const session = await createSession(db, account.id, c.req.header("user-agent") ?? null);
    return c.json({ token: session.token, expiresAt: session.expiresAt.toISOString(), account: toAccountDto(updated ?? account) });
  } catch (e) {
    return internalError("auth/recover", e);
  }
});

authRoutes.post("/recovery-code", requireAuth, async (c) => {
  const { accountId } = c.get("session");
  try {
    const code = newRecoveryCode();
    await db.update(accounts).set({ recoveryHash: hashRecoveryCode(code) }).where(eq(accounts.id, accountId));
    return c.json({ recoveryCode: code });
  } catch (e) {
    return internalError("auth/recovery-code", e);
  }
});

authRoutes.post("/logout", requireAuth, async (c) => {
  await db.delete(sessions).where(eq(sessions.id, c.get("session").sessionId));
  return c.json({ ok: true });
});

import { createMiddleware } from "hono/factory";
import { apiError } from "../http";
import { touchSession, type ActiveSession } from "./session";

/** Bearer-token check (design §5-2). Returns the active session, or a 401/403 Response. */
export async function requireAccount(req: Request): Promise<ActiveSession | Response> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return apiError(401, "unauthorized", "로그인이 필요해요.");
  const session = await touchSession(match[1]!);
  if (!session) return apiError(401, "unauthorized", "로그인이 만료됐어요. 다시 로그인해 주세요.");
  if (session.banned) return apiError(403, "banned", "이용이 제한된 계정이에요.");
  return session;
}

export type AuthedEnv = { Variables: { session: ActiveSession } };

/** Hono middleware: rejects unauthenticated requests, exposes `c.get("session")`. */
export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
  const session = await requireAccount(c.req.raw);
  if (session instanceof Response) return session;
  c.set("session", session);
  await next();
});

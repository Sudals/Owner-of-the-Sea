import type { ApiErrorCode } from "@sea/shared/schemas";
import type { z } from "zod";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra: { fields?: Record<string, string>; retryAfterSec?: number } = {},
): Response {
  const headers = extra.retryAfterSec ? { "Retry-After": String(extra.retryAfterSec) } : undefined;
  return Response.json({ error: { code, message, ...extra } }, { status, headers });
}

/** Parses and validates a JSON body; returns the data or a 400 Response. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, "invalid_json", "요청 본문이 올바른 JSON이 아니에요.");
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return apiError(400, "invalid_input", "입력값을 확인해 주세요.", { fields });
}

/** Client IP from the proxy headers, or null when the platform doesn't tell us. */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim() || null;
  return req.headers.get("x-real-ip");
}

export function internalError(scope: string, e: unknown): Response {
  console.error(`[${scope}]`, e);
  return apiError(500, "internal", "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

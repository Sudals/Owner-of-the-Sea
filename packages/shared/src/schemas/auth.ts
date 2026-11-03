import { z } from "zod";

// Identity until the Steam release — design §5. A player types a name and plays: no password.
// This device keeps a long-lived token; an "이어하기 코드" moves the save to another PC.
// Shared by the client (lobby name entry) and the server routes.

export const NAME_RE = /^[가-힣a-zA-Z0-9]{2,12}$/;
export const NAME_MAX = 12;

/** 2–12 chars of Hangul syllables, Latin letters, digits. Unique (case-insensitive), shown on leaderboards. */
export const nameSchema = z
  .string()
  .trim()
  .regex(NAME_RE, { error: "이름은 2~12자의 한글, 영문, 숫자만 쓸 수 있어요." });

// ── 이어하기 코드 ──
// 16 Crockford base32 chars (80 bits) in groups of four: XXXX-XXXX-XXXX-XXXX.
// No I/L/O/U, so it survives being read aloud or copied by hand.

export const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECOVERY_RE = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

/** Uppercases, drops spaces/dashes, maps look-alikes (I/L→1, O→0), regroups by four. */
export function normalizeRecoveryCode(input: string): string {
  const raw = input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  return raw.match(/.{1,4}/g)?.join("-") ?? "";
}

export const recoveryCodeSchema = z
  .string()
  .max(64)
  .transform(normalizeRecoveryCode)
  .pipe(z.string().regex(RECOVERY_RE, { error: "이어하기 코드 16자리를 확인해 주세요." }));

// ── Requests ──

export const startRequest = z.object({ name: nameSchema });
export const recoverRequest = z.object({ code: recoveryCodeSchema });

export type StartRequest = z.infer<typeof startRequest>;
export type RecoverRequest = z.infer<typeof recoverRequest>;

// ── Responses ──

export const accountDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
});

export const authResponse = z.object({
  token: z.string(),
  expiresAt: z.string(),
  account: accountDto,
  /** Only when a code is (re)issued: `/start` and `/recovery-code`. The server keeps just its hash. */
  recoveryCode: z.string().optional(),
});

export type AccountDto = z.infer<typeof accountDto>;
export type AuthResponse = z.infer<typeof authResponse>;

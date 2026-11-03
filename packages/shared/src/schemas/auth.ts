import { z } from "zod";

// Account rules — design §5-1. Shared by client forms and server routes.

export const USERNAME_RE = /^[a-z0-9_]{4,20}$/;
export const NICKNAME_RE = /^[가-힣a-zA-Z0-9]{2,12}$/;

/** 4–20 chars, lowercase letters/digits/_. Case-insensitive: input is lowercased. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, { error: "아이디는 4~20자의 영문, 숫자, _만 쓸 수 있어요." });

/** 8–64 chars, must mix letters and digits. */
export const passwordSchema = z
  .string()
  .min(8, { error: "비밀번호는 8자 이상이어야 해요." })
  .max(64, { error: "비밀번호는 64자 이하여야 해요." })
  .regex(/[A-Za-z]/, { error: "비밀번호에 영문을 하나 이상 넣어 주세요." })
  .regex(/[0-9]/, { error: "비밀번호에 숫자를 하나 이상 넣어 주세요." });

/** 2–12 chars of Hangul syllables, Latin letters, digits. Shown on leaderboards. */
export const nicknameSchema = z
  .string()
  .trim()
  .regex(NICKNAME_RE, { error: "닉네임은 2~12자의 한글, 영문, 숫자만 쓸 수 있어요." });

export const signupRequest = z.object({
  username: usernameSchema,
  password: passwordSchema,
  nickname: nicknameSchema,
});

// Login only bounds the input; format rules would leak which part is wrong.
export const loginRequest = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const passwordChangeRequest = z
  .object({
    current: z.string().min(1).max(128),
    next: passwordSchema,
  })
  .refine((d) => d.current !== d.next, {
    error: "새 비밀번호가 기존 비밀번호와 같아요.",
    path: ["next"],
  });

export type SignupRequest = z.infer<typeof signupRequest>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequest>;

// ── Responses ──

export const accountDto = z.object({
  id: z.string().uuid(),
  username: z.string(),
  nickname: z.string(),
  createdAt: z.string(),
});

export const authResponse = z.object({
  token: z.string(),
  expiresAt: z.string(),
  account: accountDto,
});

export type AccountDto = z.infer<typeof accountDto>;
export type AuthResponse = z.infer<typeof authResponse>;

import { z } from "zod";

/** Every API error has this shape: { error: { code, message, fields?, retryAfterSec? } } */
export const API_ERROR_CODES = [
  "invalid_json",
  "invalid_input",
  "name_taken",
  "invalid_code",
  "locked",
  "unauthorized",
  "banned",
  "forbidden",
  "not_found",
  "bad_spot",
  "offline",
  "internal",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorResponse = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    retryAfterSec: z.number().int().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponse>;

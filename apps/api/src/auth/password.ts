import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

// argon2id with OWASP's recommended minimum: 19 MiB memory, 2 iterations, 1 lane (design §5-1).
// WASM (hash-wasm) instead of the native @node-rs/argon2: the Neon CLI can't stage native
// `externalPackages` when deploying from Windows (it spawns `npm` without a shell). Output is
// the standard PHC string ($argon2id$v=19$m=19456,t=2,p=1$…), so either library verifies it.
const PARAMS = { iterations: 2, memorySize: 19_456, parallelism: 1, hashLength: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2id({ password, salt: randomBytes(16), ...PARAMS, outputType: "encoded" });
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When the account doesn't exist, still runs a full verify against a
 * dummy hash so response time doesn't reveal which usernames exist.
 */
export async function verifyPassword(storedHash: string | undefined, password: string): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= hashPassword("dummy-password-for-timing-0");
    await argon2Verify({ password, hash: await dummyHash }).catch(() => false);
    return false;
  }
  try {
    return await argon2Verify({ password, hash: storedHash });
  } catch {
    return false;
  }
}

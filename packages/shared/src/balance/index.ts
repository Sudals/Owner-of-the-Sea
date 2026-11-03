import DEFAULT from "./balance.default.json";
import { balanceSchema, type Balance } from "./schema";

// The one source of every probability, stat and price in the game (balance.jsonc at the repo
// root → `pnpm balance:apply` → DB game_config + this bundled default).
//
//  · The demo and offline play use the bundled default.
//  · The full build loads the server's current version at start (setBalance).
//  · The server computes each fishing session with the version it opened under (withBalance),
//    so changing numbers never invalidates casts already made.
//
// Modules read values at call time (`balance()` / `live(...)` views), never copy them at load.

export { balanceSchema, ITEM_KINDS, type Balance } from "./schema";

let current: Balance = DEFAULT as unknown as Balance;
let currentVersion = 0;

export const balance = (): Balance => current;
export const balanceVersion = (): number => currentVersion;
export const defaultBalance = (): Balance => DEFAULT as unknown as Balance;

/** Swap in a validated balance (client start, after GET /api/config). */
export function setBalance(b: unknown, version: number): void {
  current = balanceSchema.parse(b);
  currentVersion = version;
}

/** Run synchronous code under another balance (server: a session's pinned version). */
export function withBalance<T>(b: Balance, fn: () => T): T {
  const prev = current;
  current = b;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

/** Recomputed only when the balance object changes. */
export function derived<T>(fn: (b: Balance) => T): () => T {
  let key: Balance | null = null;
  let value!: T;
  return () => {
    if (key !== current) {
      key = current;
      value = fn(current);
    }
    return value;
  };
}

/** A read-only view that always shows the current balance — keeps `HULLS[1].hp`, `FISH.filter(...)`
 *  call sites working while the numbers behind them can change. Pass `[]` as the shape for arrays. */
export function live<T extends object>(get: () => T, shape: object = {}): T {
  return new Proxy(shape as T, {
    get: (_t, k) => {
      const target = get();
      const v = Reflect.get(target, k, target);
      return typeof v === "function" && Array.isArray(target) ? v.bind(target) : v;
    },
    has: (_t, k) => Reflect.has(get(), k),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, k) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), k);
      return d && { ...d, configurable: k === "length" && Array.isArray(shape) ? false : true };
    },
  });
}

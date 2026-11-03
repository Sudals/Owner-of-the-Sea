// Seeded randomness shared by client and server (design §7-1 rule 3, §11-3): the same seed
// must produce the same roster and picks on both sides, so this is integer-only math with
// no Math.random and no platform-dependent floats beyond the final division.

/** FNV-1a 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 stream: returns floats in [0, 1). */
export function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent stream for (seed, purpose, index) — e.g. ("roster", 0) or ("cast", 7). */
export function seeded(seedHex: string, purpose: string, index = 0): () => number {
  return stream(hash32(`${seedHex}|${purpose}|${index}`));
}

/** Pick a key from integer/float weights. */
export function weighted<T>(r: () => number, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let x = r() * total;
  for (const [v, w] of entries) {
    x -= Math.max(0, w);
    if (x < 0) return v;
  }
  return entries[entries.length - 1]![0];
}

/** 128-bit random seed as hex (uses Web Crypto, available in browsers, Node 19+, Neon Functions). */
export function newSeedHex(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

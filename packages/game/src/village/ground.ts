import { lutHex } from "../assets";
import type { Ground, VillageDef } from "./maps";

// Bakes a village's ground into one image, once: textured grass, sand, dirt, decks, rock and
// salt pans, soft edges between soft grounds, foam where water meets land, a front rim and a
// shadow where a raft deck meets the water. Day colors — time of day is a tint on top.

export const TL = 16;

type Col = Parameters<typeof lutHex>[0];
const rgbCache = new Map<string, [number, number, number]>();
function rgb(name: Col): [number, number, number] {
  let c = rgbCache.get(name);
  if (!c) {
    const h = lutHex(name);
    rgbCache.set(name, (c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]));
  }
  return c;
}

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

/** Grounds that blend into each other at their edges. */
const SOFT = new Set<Ground>([".", ",", "s", ":", "w"]);
const isWater = (t: Ground) => t === "~";

function texel(t: Ground, x: number, y: number): Col {
  switch (t) {
    case "~": {
      if (y % 7 === 0 && (x + Math.floor(y / 7) * 9) % 13 < 3) return "foam1"; // still wave streaks
      return bayer(x, y) < 0.22 ? "jade2" : "jade3";
    }
    case ".":
    case ",": {
      // calm patches (4 px cells), a few lighter blades
      const n = hash(x >> 2, y >> 2, 3);
      if (t === "," && hash(x, y, 9) < 0.03) return (["coral", "yellow", "white", "violet2", "peach"] as Col[])[Math.floor(hash(x, y, 10) * 5)]!;
      if (hash(x, y, 4) < 0.012 && (y & 1) === 0) return "green3";
      return n < 0.1 ? (bayer(x, y) < 0.5 ? "green1" : "green2") : n > 0.86 ? (bayer(x, y) < 0.5 ? "green3" : "green2") : "green2";
    }
    case "s":
      return hash(x, y, 5) < 0.08 ? "sand1" : hash(x, y, 6) < 0.012 ? "white" : "sand2";
    case ":":
      return hash(x, y, 7) < 0.025 ? "gray2" : hash(x >> 1, y >> 1, 8) < 0.3 ? "wood" : "sand1";
    case "o": {
      const row = Math.floor(y / 5), cx = (x + (row % 2) * 3) % 6;
      if (y % 5 === 4 || cx === 5) return "gray1";
      return cx === 0 && y % 5 === 0 ? "white" : "gray2";
    }
    case "=": {
      const plank = Math.floor(y / 4);
      if (y % 4 === 3) return "bark2"; // seam between planks
      const joint = (x + plank * 7) % 24;
      if (joint === 0) return "bark2";
      if (joint === 2 && y % 4 === 1) return "bark1"; // nail
      return plank % 3 === 1 ? (bayer(x, y) < 0.3 ? "sand1" : "wood") : "wood";
    }
    case "r": {
      // stones: rows of rounded boulders, lit from the top-left
      const row = Math.floor(y / 6), off = (row % 2) * 4;
      const cx = (x + off) % 8, cy = y % 6;
      if (cx === 7 || cy === 5) return "gray1"; // gaps between stones
      if ((cx === 0 && cy === 0) || (cx === 6 && cy === 4)) return "gray1"; // rounded corners
      if (cy === 0 || cx === 0) return hash(Math.floor((x + off) / 8), row, 11) < 0.5 ? "white" : "gray2";
      if (cy === 4 || cx === 6) return "gray1";
      return "gray2";
    }
    case "w":
      return hash(x, y, 13) < 0.1 ? "foam2" : (x + y) % 9 === 0 ? "foam1" : "white";
  }
}

/** Darker shade a land texel takes right at the water's edge (a bevel). */
const EDGE: Partial<Record<Ground, Col>> = { ".": "green1", ",": "green1", s: "sand1", ":": "wood", r: "gray1", w: "foam1" };

export function bakeGround(def: VillageDef): HTMLCanvasElement {
  const Wp = def.w * TL, Hp = def.h * TL;
  const tileAt = (px: number, py: number): Ground => {
    const tx = Math.floor(px / TL), ty = Math.floor(py / TL);
    return def.ground[ty]?.[tx] ?? "~";
  };
  const canvas = document.createElement("canvas");
  canvas.width = Wp;
  canvas.height = Hp;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(Wp, Hp);
  const d = img.data;
  for (let y = 0; y < Hp; y++)
    for (let x = 0; x < Wp; x++) {
      const t = tileAt(x, y);
      let c: Col = texel(t, x, y);
      if (isWater(t)) {
        // foam along land, shadow under a deck (the deck stands above the water)
        const up = tileAt(x, y - 1), up2 = tileAt(x, y - 2), up3 = tileAt(x, y - 3);
        if (up === "=" || up2 === "=" || up3 === "=") c = up === "=" ? "jade1" : "jade2";
        else {
          let near = 9;
          for (let k = 1; k <= 2 && near === 9; k++)
            for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]] as const) {
              const n = tileAt(x + dx, y + dy);
              if (!isWater(n) && n !== "=") near = Math.min(near, k);
            }
          if (near === 1) c = "white";
          else if (near === 2) c = bayer(x, y) < 0.6 ? "foam2" : c;
        }
      } else if (t === "=") {
        // the raft's front face where it meets the water below, a dark rim at its sides
        const below = tileAt(x, y + 1), below2 = tileAt(x, y + 2);
        if (isWater(below)) c = "bark1";
        else if (isWater(below2)) c = "bark2";
        else if (isWater(tileAt(x - 1, y)) || isWater(tileAt(x + 1, y))) c = "bark2";
      } else {
        // a bevel at the water's edge; soft grounds fray into their neighbors
        let water = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (isWater(tileAt(x + dx, y + dy))) water = true;
        if (water) c = EDGE[t] ?? c;
        else if (SOFT.has(t)) {
          const lx = x % TL, ly = y % TL;
          const sides: [number, number, number][] = [[-1, 0, lx], [1, 0, TL - 1 - lx], [0, -1, ly], [0, 1, TL - 1 - ly]];
          for (const [dx, dy, dist] of sides) {
            if (dist > 3) continue;
            const n = tileAt(x + dx * (dist + 1), y + dy * (dist + 1));
            if (n === t || !SOFT.has(n)) continue;
            if (hash(x, y, 21) < (4 - dist) / 8) c = texel(n, x, y);
          }
        }
      }
      const [r, g, b] = rgb(c);
      const i = (y * Wp + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

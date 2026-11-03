import { C, darker } from "../palette";
import { disc, ellipse, hline, line, polygon, rect, thickLine, vline } from "../lib/draw";
import { Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";

// The young angler (design §0-3), 32×48, facing right (toward the sea).
// Built "paper-doll" style from parts so every pose stays on-model.
// The rod is NOT baked in: the game draws it from the `hand` anchor at `rod`° so it
// can bend with line tension. `fish` (catch pose) is where the caught fish is held.

const FW = 32, FH = 48;

const COL = {
  hat: C.jade2, hatDark: C.jade1, hatLight: C.jade3, band: C.coral,
  hair: C.bark1,
  skin: C.skin2, skinDark: C.skin1,
  coat: C.yellow, coatDark: C.sand1, coatDeep: C.wood,
  scarf: C.coral, scarfDark: C.red2,
  pants: C.deep2, pantsDark: C.deep1,
  boot: C.bark2, bootDark: C.bark1,
};

type Arm = { sh: number; el: number }; // shoulder & elbow angles, degrees (0 = right, 90 = down)
type Pose = {
  dy?: number; // whole-body bob
  lean?: number; // torso/head x shift
  back: Arm;
  front: Arm;
  rod: number; // rod angle for the game, degrees (−90 = straight up)
  face?: "normal" | "focus" | "happy";
  stride?: number; // front foot forward px
};

const UPPER = 6, FORE = 5;

function armPoints(sx: number, sy: number, a: Arm) {
  const r = (d: number) => (d * Math.PI) / 180;
  const ex = sx + Math.cos(r(a.sh)) * UPPER, ey = sy + Math.sin(r(a.sh)) * UPPER;
  const hx = ex + Math.cos(r(a.el)) * FORE, hy = ey + Math.sin(r(a.el)) * FORE;
  return { ex, ey, hx, hy };
}

function drawArm(img: Img, sx: number, sy: number, a: Arm, coat: number, coatDark: number, border?: number) {
  const { ex, ey, hx, hy } = armPoints(sx, sy, a);
  if (border) {
    // a darker rim so the sleeve reads in front of the same-colored coat
    thickLine(img, sx, sy, ex, ey, 2.1, border);
    thickLine(img, ex, ey, hx, hy, 1.9, border);
  }
  thickLine(img, sx, sy, ex, ey, 1.25, coat);
  thickLine(img, ex, ey, hx, hy, 1.1, coat);
  // sleeve shading on the lower edge of the forearm
  line(img, ex, ey + 1, hx, hy + 1, coatDark);
  // cuff + hand
  disc(img, hx, hy, 1.3, COL.skin);
  img.set(Math.round(hx), Math.round(hy) + 1, COL.skinDark);
  return { hx, hy };
}

export function renderAngler(p: Pose): { img: Img; hand: [number, number]; fish: [number, number] } {
  const img = new Img(FW, FH);
  const dy = p.dy ?? 0, lean = p.lean ?? 0;
  const sx = 15 + lean, sy = 21 + dy; // shoulder pivot

  // back arm first (darker coat so it reads as behind)
  const backHand = drawArm(img, sx - 1, sy, p.back, COL.coatDark, COL.coatDeep);

  // ── legs & boots ──
  const stride = p.stride ?? 0;
  // back leg
  rect(img, 12, 32 + dy, 4, 10 - dy, COL.pantsDark);
  // front leg
  rect(img, 16 + stride, 32 + dy, 4, 10 - dy, COL.pants);
  vline(img, 16 + stride, 33 + dy, 41, COL.pantsDark);
  // boots
  rect(img, 11, 42, 5, 4, COL.bootDark);
  rect(img, 16 + stride, 42, 6, 4, COL.boot);
  hline(img, 16 + stride, 21 + stride, 42, darker(COL.boot, 0) === COL.boot ? COL.boot : COL.boot);
  hline(img, 17 + stride, 20 + stride, 43, C.wood); // boot highlight
  hline(img, 11, 21 + stride, 46, COL.bootDark); // sole

  // ── raincoat (torso) ──
  const tx = 11 + lean, ty = 19 + dy;
  polygon(img, [[tx + 1, ty], [tx + 10, ty], [tx + 11.5, ty + 15], [tx - 0.5, ty + 15]], (x, y) => {
    if (x <= tx + 1) return COL.coatDark; // back side in shade
    if (y >= ty + 13) return COL.coatDark; // hem
    return COL.coat;
  });
  // front zipper + buttons, pocket
  vline(img, tx + 8, ty + 3, ty + 13, COL.coatDark);
  img.set(tx + 9, ty + 6, COL.coatDeep);
  img.set(tx + 9, ty + 10, COL.coatDeep);
  hline(img, tx + 3, tx + 6, ty + 9, COL.coatDark);
  // belt-ish shadow under coat
  hline(img, tx, tx + 11, ty + 15, COL.pantsDark);

  // ── scarf ──
  rect(img, tx + 2, ty - 1, 8, 2, COL.scarf);
  hline(img, tx + 2, tx + 9, ty + 1, COL.scarfDark);
  rect(img, tx + 1, ty + 1, 2, 4, COL.scarf); // tail hanging at the back
  img.set(tx + 1, ty + 4, COL.scarfDark);

  // ── head ──
  const hx = 16 + lean, hy = 12 + dy;
  rect(img, hx - 2, hy + 3, 4, ty - hy - 2, COL.skinDark); // neck joins head to scarf
  ellipse(img, hx, hy, 4.6, 4.8, (x) => (x <= hx - 3 ? COL.skinDark : COL.skin));
  // hair at the back of the head and nape
  polygon(img, [[hx - 5, hy - 3], [hx - 1, hy - 4], [hx - 1, hy + 1], [hx - 3, hy + 4], [hx - 5, hy + 2]], COL.hair);
  img.set(hx - 1, hy + 1, COL.skinDark); // ear
  img.set(hx - 1, hy, COL.skinDark);
  // nose
  img.set(hx + 5, hy + 1, COL.skin);
  img.set(hx + 5, hy + 2, COL.skinDark);
  // face
  const face = p.face ?? "normal";
  if (face === "happy") {
    img.set(hx + 2, hy - 1, C.ink);
    img.set(hx + 3, hy - 2, C.ink);
    img.set(hx + 4, hy - 1, C.ink);
    hline(img, hx + 2, hx + 3, hy + 3, C.red2);
  } else {
    img.set(hx + 3, hy - 1, C.ink);
    img.set(hx + 3, hy, C.ink);
    if (face === "focus") hline(img, hx + 2, hx + 4, hy - 2, C.bark1); // brow
    img.set(hx + 3, hy + 3, COL.skinDark);
  }
  img.set(hx + 2, hy + 1, C.peach); // cheek

  // ── hat (bucket hat) ──
  polygon(img, [[hx - 4, hy - 9], [hx + 3, hy - 9], [hx + 4, hy - 4], [hx - 5, hy - 4]], (x, y) =>
    y === hy - 9 ? COL.hatLight : x <= hx - 3 ? COL.hatDark : COL.hat,
  );
  hline(img, hx - 5, hx + 4, hy - 5, COL.band);
  // brim, longer in front
  polygon(img, [[hx - 7, hy - 4], [hx + 7, hy - 4], [hx + 8, hy - 2.5], [hx - 7, hy - 2.5]], (x) => (x < hx - 3 ? COL.hatDark : COL.hat));
  hline(img, hx - 6, hx + 7, hy - 3, COL.hatDark);

  // ── front arm last ──
  const frontHand = drawArm(img, sx + 2, sy, p.front, COL.coat, COL.coatDark, COL.coatDeep);

  const out = img.outline(C.ink);
  // re-stamp hands so the outline doesn't swallow them
  void backHand;
  const hand: [number, number] = [Math.round(frontHand.hx), Math.round(frontHand.hy)];
  const fish: [number, number] = [Math.round((frontHand.hx + backHand.hx) / 2), Math.round(Math.min(frontHand.hy, backHand.hy)) - 2];
  return { img: out, hand, fish };
}

// Pose table — design §6-2: Idle, 차징, 던지기, 대기, 챔질, 감기, 획득 (2–4 frames each).
export const POSES: Record<string, Pose[]> = {
  idle: [
    { back: { sh: 70, el: 10 }, front: { sh: 65, el: -10 }, rod: -50 },
    { dy: 1, back: { sh: 72, el: 12 }, front: { sh: 67, el: -8 }, rod: -48 },
  ],
  charge: [
    { lean: -1, back: { sh: -120, el: -160 }, front: { sh: -110, el: -150 }, rod: -125, face: "focus", stride: 1 },
    { lean: -2, back: { sh: -128, el: -168 }, front: { sh: -118, el: -160 }, rod: -140, face: "focus", stride: 1 },
  ],
  cast: [
    { lean: -1, back: { sh: -95, el: -100 }, front: { sh: -85, el: -90 }, rod: -95, face: "focus", stride: 1 },
    { lean: 0, back: { sh: -45, el: -30 }, front: { sh: -35, el: -20 }, rod: -35, face: "focus", stride: 2 },
    { lean: 1, back: { sh: 10, el: 15 }, front: { sh: 5, el: 5 }, rod: 0, stride: 2 },
  ],
  wait: [
    { back: { sh: 60, el: -5 }, front: { sh: 55, el: -25 }, rod: -35 },
    { dy: 1, back: { sh: 62, el: -3 }, front: { sh: 57, el: -23 }, rod: -33 },
  ],
  hook: [
    { lean: -1, back: { sh: -70, el: -110 }, front: { sh: -60, el: -100 }, rod: -105, face: "focus", stride: 1 },
    { lean: -2, back: { sh: -85, el: -125 }, front: { sh: -75, el: -115 }, rod: -120, face: "focus", stride: 1 },
  ],
  reel: [
    { back: { sh: 50, el: -20 }, front: { sh: 40, el: -40 }, rod: -40, face: "focus" },
    { back: { sh: 40, el: -45 }, front: { sh: 40, el: -40 }, rod: -41, face: "focus" },
    { back: { sh: 30, el: -10 }, front: { sh: 40, el: -40 }, rod: -40, face: "focus" },
    { back: { sh: 45, el: 15 }, front: { sh: 40, el: -40 }, rod: -39, face: "focus" },
  ],
  // Holding the fish up in front of the chest (arms are too short to go overhead).
  catch: [
    { back: { sh: 20, el: -40 }, front: { sh: 10, el: -55 }, rod: 60, face: "happy" },
    { dy: -1, back: { sh: 15, el: -50 }, front: { sh: 5, el: -65 }, rod: 62, face: "happy" },
  ],
};

export function buildAngler(): SheetItem[] {
  const items: SheetItem[] = [];
  for (const [name, frames] of Object.entries(POSES))
    frames.forEach((p, i) => {
      const { img, hand, fish } = renderAngler(p);
      items.push({ name: `${name}_${i}`, img, anchor: { hand, fish, rod: [p.rod, 0] } });
    });
  return items;
}

/** Preview only: draws the rod the way the game will, so poses can be judged. */
export function withRod(item: SheetItem, len = 22): Img {
  const pad = 26;
  const out = new Img(item.img.w + pad * 2, item.img.h + pad);
  out.blit(item.img, pad, pad);
  const [hx, hy] = item.anchor!.hand!;
  const a = (item.anchor!.rod![0] * Math.PI) / 180;
  line(out, pad + hx, pad + hy, pad + hx + Math.cos(a) * len, pad + hy + Math.sin(a) * len, C.bark1);
  line(out, pad + hx, pad + hy, pad + hx + Math.cos(a) * 5, pad + hy + Math.sin(a) * 5, C.ink);
  return out;
}

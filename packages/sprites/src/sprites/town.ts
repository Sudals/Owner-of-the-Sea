import { C } from "../palette";
import { dither, disc, ellipse, hline, line, polygon, rect, vline } from "../lib/draw";
import { grid, Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";

// Villages seen from above (3/4 view, like the old handheld RPGs): the player and the villagers
// walking in four directions, and the buildings, stalls and props a village map is made of.
// Ground tiles are not here — the game bakes them per village from its tile map.

const ol = (img: Img) => img.outline(C.ink);

// ── people (16×24): one template per facing, colors swapped per person ──────────────
//  H/h/B hat (main, dark, band) — no hat: the hair · R/r hair · S/s skin · E eye
//  T/t top · A front accent (apron, zipper, scarf) · L/l legs · F feet · W beard
const DOWN = [
  `
  ................
  ......HHHH......
  .....HHHHHH.....
  .....hBBBBh.....
  ...HHHHHHHHHH...
  ....hRSSSSRh....
  .....SSSSSS.....
  .....SESSES.....
  .....SSSSSS.....
  ......SWWS......
  .....TTTTTT.....
  ....TTTAATTT....
  ...TTTTAATTTT...
  ...TtTTAATTtT...
  ...TtTTAATTtT...
  ...SttTAATttS...
  .....tttttt.....
  .....LL..LL.....
  .....LL..LL.....
  .....LL..LL.....
  .....Ll..lL.....
  ....FFF..FFF....
  ................
  ................
`,
  `
  ................
  ......HHHH......
  .....HHHHHH.....
  .....hBBBBh.....
  ...HHHHHHHHHH...
  ....hRSSSSRh....
  .....SSSSSS.....
  .....SESSES.....
  .....SSSSSS.....
  ......SWWS......
  .....TTTTTT.....
  ....TTTAATTT....
  ...TTTTAATTTT...
  ...TtTTAATTtT...
  ...StTTAATTtT...
  .....tTAATttS...
  .....tttttt.....
  .....LL..LL.....
  .....LL..LL.....
  .....LL..Ll.....
  .....LL..FFF....
  .....Ll.........
  ....FFF.........
  ................
`,
];
const UP = [
  `
  ................
  ......HHHH......
  .....HHHHHH.....
  .....hBBBBh.....
  ...HHHHHHHHHH...
  ....hRRRRRRh....
  .....RRRRRR.....
  .....RRRRRR.....
  .....rRRRRr.....
  ......SssS......
  .....TTTTTT.....
  ....TTTTTTTT....
  ...TTTTttTTTT...
  ...TtTTttTTtT...
  ...TtTTttTTtT...
  ...SttTttTttS...
  .....tttttt.....
  .....LL..LL.....
  .....LL..LL.....
  .....LL..LL.....
  .....lL..Ll.....
  ....FFF..FFF....
  ................
  ................
`,
  `
  ................
  ......HHHH......
  .....HHHHHH.....
  .....hBBBBh.....
  ...HHHHHHHHHH...
  ....hRRRRRRh....
  .....RRRRRR.....
  .....RRRRRR.....
  .....rRRRRr.....
  ......SssS......
  .....TTTTTT.....
  ....TTTTTTTT....
  ...TTTTttTTTT...
  ...TtTTttTTtT...
  ...TtTTttTTtS...
  ...SttTttTt.....
  .....tttttt.....
  .....LL..LL.....
  .....LL..LL.....
  .....Ll..LL.....
  ....FFF..LL.....
  .........lL.....
  .........FFF....
  ................
`,
];
const RIGHT = [
  `
  ................
  ......HHHH......
  .....HHHHHH.....
  .....hBBBBBh....
  ....hHHHHHHHHH..
  .....RRSSSSS....
  .....RSSSSSSS...
  .....RSSSSESs...
  .....RSSSSSSS...
  ......SSWWS.....
  ......TTTTT.....
  .....TTTTTAA....
  .....TTTTTAA....
  .....TtTTTAA....
  .....TtSTTAA....
  .....ttTTtAA....
  ......ttttt.....
  ......LLLL......
  ......LLLL......
  ......LLLL......
  ......lLLl......
  ......FFFFF.....
  ................
  ................
`,
  `
  ................
  ......HHHH......
  .....HHHHHH.....
  .....hBBBBBh....
  ....hHHHHHHHHH..
  .....RRSSSSS....
  .....RSSSSSSS...
  .....RSSSSESs...
  .....RSSSSSSS...
  ......SSWWS.....
  ......TTTTT.....
  .....TTTTTAA....
  ....TTTTTTAA....
  ....TtTTTTAA....
  ....St.TTTAAS...
  ......tTTtAA....
  ......ttttt.....
  .....LL..LL.....
  ....LL....LL....
  ....LL....LL....
  ...lL......Ll...
  ..FFF......FFF..
  ................
  ................
`,
];

export type Look = {
  hat: [number, number, number] | null; // main, dark, band — null: hair on top
  hair: [number, number];
  skin?: [number, number];
  top: [number, number];
  accent: number;
  legs: [number, number];
  feet: number;
  beard?: number;
  /** without a hat: how the hair sits */
  hairStyle?: "short" | "bun" | "long";
  /** children are two rows shorter */
  small?: boolean;
};

/** Rows 1–4 of each facing for a bare head (the templates carry a hat there). */
const BARE: Record<"down" | "up" | "right", string[]> = {
  down: ["......RRRR......", ".....RRRRRR.....", "....RRRRRRRR....", "....RRRRRRRR...."],
  up: ["......RRRR......", ".....RRRRRR.....", "....RRRRRRRR....", "....RRRRRRRR...."],
  right: ["......RRRR......", ".....RRRRRR.....", "....RRRRRRRR....", "....RRRRRRR....."],
};

function bareHead(rows: string, dir: "down" | "up" | "right", style: Look["hairStyle"]): string {
  const lines = rows.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => l.trim());
  BARE[dir].forEach((r, i) => (lines[1 + i] = r));
  if (style === "bun") lines[1] = dir === "right" ? ".....rRR........" : "......rRRr......";
  if (style === "long")
    for (let y = 5; y <= 10; y++) {
      const row = lines[y]!.split("");
      if (dir === "right") row[4] = "R";
      else (row[4] = "R"), (row[11] = "R");
      lines[y] = row.join("");
    }
  return lines.join(String.fromCharCode(10));
}

function person(look: Look, rows: string, dir: "down" | "up" | "right"): Img {
  if (!look.hat) rows = bareHead(rows, dir, look.hairStyle);
  const [sk, skd] = look.skin ?? [C.skin2, C.skin1];
  const [hm, hd, hb] = look.hat ?? [look.hair[0], look.hair[1], look.hair[0]];
  const legend: Record<string, number> = {
    H: hm, h: hd, B: hb, R: look.hair[0], r: look.hair[1], S: sk, s: skd, E: C.ink,
    T: look.top[0], t: look.top[1], A: look.accent, L: look.legs[0], l: look.legs[1], F: look.feet,
    W: look.beard ?? sk,
  };
  let img = grid(rows, legend);
  if (look.small) {
    // drop a body row and a leg row, keep the feet on the ground line
    const out = new Img(img.w, img.h);
    let dy = img.h - 1;
    for (let y = img.h - 1; y >= 0; y--) {
      if (y === 16 || y === 18) continue;
      for (let x = 0; x < img.w; x++) out.set(x, dy, img.get(x, y));
      dy--;
    }
    img = out;
  }
  return ol(img);
}

function flip(img: Img): Img {
  const out = new Img(img.w, img.h);
  out.blit(img, 0, 0, { flipX: true });
  return out;
}

/** 4 facings × 3 frames: stand, step, step (the other foot). */
function walker(id: string, look: Look): SheetItem[] {
  const out: SheetItem[] = [];
  const sets: Record<"down" | "up" | "right", string[]> = { down: DOWN, up: UP, right: RIGHT };
  for (const dir of ["down", "up", "right"] as const) {
    const stand = person(look, sets[dir][0]!, dir);
    const step = person(look, sets[dir][1]!, dir);
    // the other step: the mirror image for front/back, the stride again for the side
    const step2 = dir === "right" ? person(look, sets[dir][0]!, dir) : flip(step);
    out.push({ name: `${id}_${dir}_0`, img: stand }, { name: `${id}_${dir}_1`, img: step }, { name: `${id}_${dir}_2`, img: step2 });
    if (dir === "right") out.push({ name: `${id}_left_0`, img: flip(stand) }, { name: `${id}_left_1`, img: flip(step) }, { name: `${id}_left_2`, img: flip(step2) });
  }
  return out;
}

/** Everyone who walks a village. The player looks like the angler on the dock. */
export const PEOPLE: Record<string, Look> = {
  pc: { hat: [C.jade2, C.jade1, C.coral], hair: [C.bark1, C.bark1], top: [C.yellow, C.sand1], accent: C.coral, legs: [C.deep2, C.deep1], feet: C.bark2 },
  granny: { hat: null, hairStyle: "bun", hair: [C.gray2, C.gray1], top: [C.violet2, C.violet1], accent: C.white, legs: [C.violet1, C.violet1], feet: C.bark1 },
  malsun: { hat: [C.red2, C.red1, C.coral], hair: [C.bark1, C.bark1], top: [C.coral, C.red2], accent: C.white, legs: [C.deep2, C.deep1], feet: C.bark2 },
  oldman: { hat: [C.sand2, C.sand1, C.wood], hair: [C.gray2, C.gray1], top: [C.white, C.gray2], accent: C.sand1, legs: [C.bark2, C.bark1], feet: C.bark1, beard: C.white },
  kid: { hat: [C.sea2, C.sea1, C.white], hair: [C.bark1, C.bark1], top: [C.yellow, C.sand1], accent: C.coral, legs: [C.deep2, C.deep1], feet: C.red1, small: true },
  man: { hat: null, hair: [C.bark1, C.bark1], top: [C.sea1, C.deep2], accent: C.sea2, legs: [C.bark2, C.bark1], feet: C.bark1 },
  woman: { hat: null, hairStyle: "long", hair: [C.wood, C.bark2], top: [C.green2, C.green1], accent: C.sand2, legs: [C.green1, C.green1], feet: C.bark2 },
  fisher: { hat: [C.navy, C.deep1, C.navy], hair: [C.bark1, C.bark1], top: [C.deep2, C.navy], accent: C.gray2, legs: [C.gray1, C.navy], feet: C.bark1, beard: C.gray2 },
};

// ── buildings (3/4 view: roof on top, front wall with the door below) ───────────────

type HouseOpts = { w: number; roofH: number; wallH: number; roof: [number, number]; wall: [number, number]; door?: number; windows?: number; chimney?: boolean };

/** A brick chimney on the roof's right side; the game puffs smoke from its top (sprite w − 11, 3). */
function chimney(img: Img): void {
  const x = img.w - 15;
  rect(img, x - 1, 4, 8, 10, C.ink);
  rect(img, x, 5, 6, 9, C.red2);
  for (let y = 6; y < 13; y += 2) hline(img, x, x + 5, y, C.red1);
  for (let y = 5; y < 13; y += 2) img.set(x + 2 + ((y >> 1) % 2) * 2, y, C.red1);
  rect(img, x - 1, 3, 8, 2, C.gray1);
  hline(img, x - 1, x + 6, 3, C.gray2);
}

function house(o: HouseOpts): Img {
  const W = o.w + 4, H = o.roofH + o.wallH + 2;
  const img = new Img(W, H);
  const x0 = 2, wallTop = o.roofH;
  // front wall
  rect(img, x0, wallTop, o.w, o.wallH, o.wall[0]);
  vline(img, x0, wallTop, wallTop + o.wallH - 1, o.wall[1]);
  vline(img, x0 + o.w - 1, wallTop, wallTop + o.wallH - 1, o.wall[1]);
  for (let x = x0; x < x0 + o.w; x++) if ((x * 7) % 5 === 0) img.set(x, wallTop + o.wallH - 2, o.wall[1]);
  hline(img, x0, x0 + o.w - 1, wallTop + o.wallH - 1, C.bark1); // footing
  // windows and door
  const doorW = 8, doorX = x0 + Math.floor(o.w / 2) - doorW / 2;
  const nWin = o.windows ?? 2;
  for (let k = 0; k < nWin; k++) {
    const wx = k === 0 ? x0 + 4 : x0 + o.w - 4 - 7;
    if (Math.abs(wx + 3 - (doorX + 4)) < 9) continue;
    rect(img, wx, wallTop + 4, 7, 6, C.wood);
    rect(img, wx + 1, wallTop + 5, 5, 4, C.foam1);
    vline(img, wx + 3, wallTop + 5, wallTop + 8, C.wood);
    img.set(wx + 1, wallTop + 5, C.white);
  }
  if (o.door !== -1) {
    rect(img, doorX, wallTop + o.wallH - 12, doorW, 11, C.bark1);
    rect(img, doorX + 1, wallTop + o.wallH - 11, doorW - 2, 10, o.door ?? C.bark2);
    img.set(doorX + doorW - 3, wallTop + o.wallH - 6, C.yellow);
  }
  // roof: a hip roof seen from above-front, eaves overhanging the wall
  const [r0, r1] = o.roof;
  polygon(img, [[0, o.roofH + 1], [6, 2], [W - 7, 2], [W - 1, o.roofH + 1]], (x, y) => {
    const band = (y - 2) % 4 === 3;
    return band ? r1 : dither(x, y, ((y - 2) / o.roofH) * 0.35, r0, r1);
  });
  hline(img, 6, W - 7, 2, r1);
  hline(img, 6, W - 7, 1, C.ink);
  hline(img, 0, W - 1, o.roofH + 1, r1);
  hline(img, 0, W - 1, o.roofH + 2, C.ink); // the eave's shadow line on the wall
  if (o.chimney) chimney(img);
  return ol(img);
}

/** Grandfather's house: shuttered, the door boarded up, the roof mended with odd shingles. */
function grandpaHouse(): Img {
  const img = house({ w: 40, roofH: 20, wallH: 22, roof: [C.sea1, C.deep2], wall: [C.sand2, C.sand1], windows: 2 });
  for (const [x, y] of [[10, 8], [26, 6], [17, 13], [31, 12]] as const) rect(img, x, y, 4, 3, C.wood); // mended roof
  for (const wx of [6, 33]) {
    rect(img, wx, 26, 7, 6, C.bark2); // shutters
    vline(img, wx + 3, 26, 31, C.bark1);
  }
  const dx = 18, dy = 31; // boards across the door
  line(img, dx - 1, dy, dx + 8, dy + 8, C.wood);
  line(img, dx - 1, dy + 8, dx + 8, dy, C.wood);
  for (const [x, y] of [[dx - 1, dy], [dx + 8, dy], [dx - 1, dy + 8], [dx + 8, dy + 8]] as const) img.set(x, y, C.gray1);
  for (let x = 3; x < 42; x++) if ((x * 5) % 7 < 3) img.set(x, 42, C.green1); // moss
  return img;
}

/** The salt storehouse: a white barn with a wide braced door, salt spilling out. */
function saltStore(): Img {
  const W = 58, H = 50;
  const img = new Img(W, H);
  rect(img, 4, 22, 50, 25, C.white);
  vline(img, 4, 22, 46, C.gray2);
  vline(img, 53, 22, 46, C.gray2);
  for (let y = 24; y < 46; y += 4) hline(img, 5, 52, y, C.foam2);
  hline(img, 4, 53, 46, C.gray1);
  rect(img, 20, 28, 18, 18, C.bark2);
  rect(img, 21, 29, 16, 17, C.wood);
  line(img, 21, 29, 36, 45, C.bark2);
  line(img, 21, 45, 36, 29, C.bark2);
  vline(img, 28, 29, 45, C.bark1);
  polygon(img, [[0, 24], [29, 2], [57, 24]], (x, y) => ((y - 2) % 4 === 3 ? C.gray1 : C.gray2));
  hline(img, 0, 57, 24, C.gray1);
  hline(img, 1, 56, 25, C.ink);
  disc(img, 29, 15, 3, C.navy);
  disc(img, 29, 15, 2, C.foam1);
  polygon(img, [[8, 47], [14, 41], [19, 47]], (x) => (x < 14 ? C.white : C.foam2));
  ellipse(img, 44, 43, 4, 3, C.sand2);
  hline(img, 42, 46, 41, C.bark2);
  return ol(img);
}

function laundry(): Img {
  const img = new Img(36, 24);
  vline(img, 2, 3, 22, C.bark1);
  vline(img, 33, 3, 22, C.bark1);
  for (let x = 3; x < 33; x++) img.set(x, 4 + Math.round(Math.sin(((x - 2) / 31) * Math.PI) * 2), C.gray2);
  const cloth: [number, number, number, number, number][] = [[6, 5, 6, 8, C.coral], [14, 6, 5, 9, C.white], [21, 6, 7, 7, C.sea2], [29, 5, 3, 6, C.yellow]];
  for (const [x, y, w, h, c] of cloth) {
    rect(img, x, y, w, h, c);
    hline(img, x, x + w - 1, y + h - 1, c === C.white ? C.gray2 : C.ink);
    img.set(x + 1, y, C.bark2);
    img.set(x + w - 2, y, C.bark2);
  }
  return ol(img);
}

function fence(): Img {
  const img = new Img(18, 12);
  for (const x of [1, 16]) {
    vline(img, x, 1, 10, C.bark1);
    img.set(x, 0, C.wood);
  }
  hline(img, 1, 16, 3, C.wood);
  hline(img, 1, 16, 7, C.wood);
  hline(img, 1, 16, 4, C.bark2);
  hline(img, 1, 16, 8, C.bark2);
  return ol(img);
}

function garden(): Img {
  const img = new Img(34, 20);
  rect(img, 1, 2, 32, 16, C.bark2);
  for (let y = 3; y < 17; y += 4) {
    hline(img, 1, 32, y, C.wood);
    for (let x = 3; x < 31; x += 5) {
      if ((x + y) % 2) {
        disc(img, x, y + 1, 1.6, C.green2);
        img.set(x, y, C.green3);
      } else {
        vline(img, x, y, y + 1, C.green2);
        img.set(x - 1, y, C.green3);
        img.set(x + 1, y, C.green3);
      }
    }
  }
  return img;
}

function well(): Img {
  const img = new Img(22, 26);
  vline(img, 3, 3, 16, C.bark1);
  vline(img, 18, 3, 16, C.bark1);
  polygon(img, [[0, 6], [11, 0], [21, 6]], C.red1);
  hline(img, 0, 21, 6, C.red2);
  vline(img, 11, 7, 12, C.gray1);
  rect(img, 9, 12, 5, 4, C.wood);
  ellipse(img, 11, 19, 9, 5, (x, y, nx, ny) => (Math.hypot(nx, ny) < 0.6 ? C.deep2 : ny < 0 ? C.gray2 : C.gray1));
  ellipse(img, 11, 18, 5, 2, C.deep1);
  for (const x of [4, 8, 13, 17]) img.set(x, 22, C.gray1);
  return ol(img);
}

function bench(): Img {
  const img = new Img(22, 12);
  rect(img, 1, 3, 20, 3, C.wood);
  hline(img, 1, 20, 3, C.sand1);
  hline(img, 1, 20, 6, C.bark2);
  for (const x of [3, 18]) vline(img, x, 7, 10, C.bark1);
  return ol(img);
}

function sacks(): Img {
  const img = new Img(20, 14);
  for (const [cx, cy, c] of [[6, 8, C.sand2], [14, 8, C.sand1], [10, 5, C.sand2]] as const) {
    ellipse(img, cx, cy, 4.5, 3.5, (x, y, nx, ny) => (ny < -0.3 ? C.white : c));
    img.set(cx, cy - 3, C.bark2);
  }
  return ol(img);
}

function fishRack(): Img {
  const img = new Img(28, 22);
  vline(img, 2, 2, 20, C.bark1);
  vline(img, 25, 2, 20, C.bark1);
  hline(img, 2, 25, 3, C.bark2);
  for (let k = 0; k < 5; k++) {
    const x = 5 + k * 4, c = k % 2 ? C.gray2 : C.sea2;
    vline(img, x, 4, 5, C.sand1);
    rect(img, x - 1, 6, 3, 6, c);
    img.set(x, 12, c);
    img.set(x - 1, 13, c);
    img.set(x + 1, 13, c);
    img.set(x, 7, C.ink);
  }
  return ol(img);
}

function cart(): Img {
  const img = new Img(28, 18);
  rect(img, 3, 6, 20, 6, C.wood);
  hline(img, 3, 22, 6, C.sand1);
  hline(img, 3, 22, 11, C.bark1);
  polygon(img, [[5, 7], [13, 1], [21, 7]], (x) => (x < 13 ? C.white : C.foam2));
  line(img, 22, 9, 27, 7, C.bark1);
  for (const x of [7, 18]) {
    disc(img, x, 14, 2.6, C.bark2);
    img.set(x, 14, C.bark1);
  }
  return ol(img);
}

function pot(): Img {
  const img = new Img(10, 13);
  rect(img, 2, 7, 6, 5, C.coral);
  hline(img, 1, 8, 7, C.red2);
  disc(img, 5, 4, 3, C.green2);
  img.set(4, 2, C.yellow);
  img.set(6, 3, C.coral);
  return ol(img);
}

function ball(): Img {
  const img = new Img(8, 8);
  disc(img, 4, 4, 2.8, C.white);
  vline(img, 4, 2, 6, C.coral);
  hline(img, 2, 6, 4, C.coral);
  return ol(img);
}

function rods(): Img {
  const img = new Img(12, 26);
  line(img, 3, 24, 8, 1, C.bark2);
  line(img, 6, 24, 10, 3, C.wood);
  img.set(8, 1, C.coral);
  img.set(10, 3, C.coral);
  rect(img, 2, 22, 6, 3, C.gray1);
  return ol(img);
}

const SHOP_SIGNS = {
  bag: (img: Img, x: number, y: number) => {
    rect(img, x, y + 2, 6, 5, C.sand2);
    hline(img, x + 1, x + 4, y + 1, C.bark2);
    img.set(x, y + 1, C.bark2);
    img.set(x + 5, y + 1, C.bark2);
  },
  wrench: (img: Img, x: number, y: number) => {
    line(img, x, y + 6, x + 5, y + 1, C.gray2);
    disc(img, x + 5, y + 1, 1.4, C.gray2);
    img.set(x + 5, y + 1, 0);
  },
};

function shop(roof: [number, number], awning: number, sign: keyof typeof SHOP_SIGNS): Img {
  const img = house({ w: 44, roofH: 22, wallH: 24, roof, wall: [C.sand2, C.sand1], windows: 2 });
  const y = 22 + 9; // awning over the door
  for (let x = 14; x < 34; x++) {
    const c = Math.floor((x - 14) / 3) % 2 === 0 ? awning : C.white;
    vline(img, x, y, y + 3, c);
    if (x % 3 === 1) img.set(x, y + 4, c);
  }
  hline(img, 13, 34, y - 1, C.ink);
  // hanging sign
  rect(img, 36, 24, 10, 10, C.wood);
  rect(img, 37, 25, 8, 8, C.sand2);
  SHOP_SIGNS[sign](img, 38, 25);
  vline(img, 41, 22, 23, C.bark1);
  return ol(img);
}

function shed(): Img {
  // open-front boat shed: a dark bay with a hull on blocks, tools on the wall
  const img = house({ w: 44, roofH: 18, wallH: 24, roof: [C.gray2, C.gray1], wall: [C.wood, C.bark2], door: -1, windows: 0 });
  rect(img, 9, 24, 30, 19, C.bark1);
  rect(img, 10, 25, 28, 18, C.navy);
  ellipse(img, 24, 37, 11, 4, (x, y, nx, ny) => (ny < -0.2 ? C.coral : C.red2)); // hull
  hline(img, 14, 34, 37, C.white);
  rect(img, 15, 40, 3, 3, C.wood);
  rect(img, 30, 40, 3, 3, C.wood);
  SHOP_SIGNS.wrench(img, 12, 26);
  // planks on the side wall
  for (let y = 26; y < 42; y += 3) hline(img, 3, 7, y, C.bark2);
  return ol(img);
}

function stall(awning: number, goods: "fish" | "goods"): Img {
  // tall enough that the keeper standing behind the counter shows between awning and counter
  const W = 42, H = 46, top = 1, counter = 34;
  const img = new Img(W, H);
  // posts
  vline(img, 3, top + 8, H - 3, C.bark1);
  vline(img, 38, top + 8, H - 3, C.bark1);
  // counter
  rect(img, 1, counter, 40, 10, C.wood);
  hline(img, 1, 40, counter, C.sand1);
  hline(img, 1, 40, counter + 9, C.bark1);
  for (let x = 6; x < 40; x += 6) vline(img, x, counter + 1, counter + 8, C.bark2);
  // goods on the counter
  if (goods === "fish") {
    for (let k = 0; k < 4; k++) {
      const x = 6 + k * 8, c = k % 2 ? C.sea2 : C.gray2;
      ellipse(img, x + 3, counter - 1, 3.4, 1.4, c);
      img.set(x, counter - 1, c);
      img.set(x - 1, counter - 2, c);
      img.set(x - 1, counter, c);
      img.set(x + 5, counter - 1, C.ink);
    }
    rect(img, 31, counter - 6, 8, 6, C.foam1); // ice box
    hline(img, 31, 38, counter - 6, C.white);
  } else {
    rect(img, 6, counter - 6, 6, 6, C.sand2);
    rect(img, 13, counter - 4, 5, 4, C.sea2);
    rect(img, 20, counter - 7, 4, 7, C.coral);
    rect(img, 26, counter - 5, 7, 5, C.jade3);
    disc(img, 35, counter - 3, 2, C.yellow);
  }
  // awning
  for (let x = 0; x < W; x++) {
    const c = Math.floor(x / 4) % 2 === 0 ? awning : C.white;
    vline(img, x, top + 1, top + 8, c);
    if (x % 4 === 1 || x % 4 === 2) img.set(x, top + 9, c);
  }
  hline(img, 0, W - 1, top, C.ink);
  hline(img, 0, W - 1, top + 1, awning === C.red2 ? C.red1 : C.deep2);
  return ol(img);
}

function pump(): Img {
  const img = new Img(18, 30);
  rect(img, 3, 6, 10, 20, C.red2);
  vline(img, 3, 6, 25, C.coral);
  vline(img, 12, 6, 25, C.red1);
  rect(img, 5, 9, 6, 5, C.foam1); // gauge window
  img.set(6, 10, C.white);
  hline(img, 5, 10, 16, C.red1);
  rect(img, 2, 26, 12, 3, C.gray1);
  rect(img, 4, 3, 8, 4, C.gray2);
  hline(img, 4, 11, 3, C.white);
  // hose and nozzle
  line(img, 13, 12, 16, 18, C.ink);
  vline(img, 16, 18, 22, C.ink);
  rect(img, 15, 21, 2, 3, C.gray1);
  return ol(img);
}

function board(): Img {
  const img = new Img(26, 26);
  vline(img, 4, 14, 24, C.bark1);
  vline(img, 21, 14, 24, C.bark1);
  rect(img, 1, 2, 24, 15, C.wood);
  rect(img, 2, 3, 22, 13, C.sand1);
  // notices pinned on it
  for (const [x, y, w, h, c] of [[4, 5, 6, 7, C.white], [11, 4, 5, 5, C.foam2], [17, 6, 6, 6, C.white], [12, 10, 5, 5, C.peach]] as const) {
    rect(img, x, y, w, h, c);
    img.set(x + Math.floor(w / 2), y, C.red2);
    for (let yy = y + 2; yy < y + h - 1; yy += 2) hline(img, x + 1, x + w - 2, yy, C.gray2);
  }
  hline(img, 1, 24, 2, C.bark2);
  return ol(img);
}

function lighthouse(): Img {
  const img = new Img(28, 70);
  const cx = 14;
  for (let y = 14; y < 66; y++) {
    const half = 5 + Math.floor((y - 14) / 12);
    const band = Math.floor((y - 14) / 8) % 2 === 0 ? C.white : C.red2;
    hline(img, cx - half, cx + half, y, band);
    img.set(cx + half, y, band === C.white ? C.gray2 : C.red1);
    img.set(cx + half - 1, y, band === C.white ? C.gray2 : C.red1);
  }
  rect(img, cx - 4, 56, 8, 10, C.bark2); // door
  rect(img, cx - 3, 57, 6, 9, C.bark1);
  rect(img, cx - 7, 8, 15, 7, C.navy); // lamp room
  rect(img, cx - 5, 9, 11, 5, C.yellow);
  img.set(cx - 4, 10, C.white);
  hline(img, cx - 8, cx + 8, 15, C.ink); // gallery
  polygon(img, [[cx - 8, 8], [cx, 1], [cx + 8, 8]], C.red1);
  hline(img, cx - 9, cx + 9, 66, C.gray1);
  return ol(img);
}

function belltower(): Img {
  const img = new Img(40, 78);
  // stone shaft
  rect(img, 6, 24, 28, 50, C.gray2);
  for (let y = 26; y < 74; y += 4) for (let x = 6 + ((y / 4) % 2) * 3; x < 34; x += 7) hline(img, x, x + 4, y, C.gray1);
  vline(img, 6, 24, 73, C.white);
  vline(img, 33, 24, 73, C.gray1);
  // the bell in its open arch
  rect(img, 12, 10, 16, 14, C.navy);
  polygon(img, [[12, 12], [20, 6], [28, 12]], C.navy);
  polygon(img, [[16, 20], [17, 14], [20, 12], [23, 14], [24, 20]], C.yellow);
  hline(img, 15, 25, 21, C.sand1);
  img.set(20, 22, C.sand1);
  // roof
  polygon(img, [[3, 10], [20, 0], [37, 10]], C.red1);
  hline(img, 3, 37, 10, C.red2);
  // door and a window, the water line of the drowned school below
  rect(img, 16, 62, 8, 12, C.bark1);
  rect(img, 17, 63, 6, 11, C.bark2);
  rect(img, 17, 38, 6, 8, C.navy);
  rect(img, 18, 39, 4, 6, C.foam1);
  hline(img, 6, 33, 74, C.sea1);
  hline(img, 6, 33, 75, C.sea2);
  return ol(img);
}

// ── props ───────────────────────────────────────────────────────────────────────────

function tree(): Img {
  const img = new Img(32, 38);
  rect(img, 14, 24, 4, 12, C.bark2);
  vline(img, 17, 24, 35, C.bark1);
  ellipse(img, 16, 15, 13, 12, (x, y, nx, ny) => {
    const r = Math.hypot(nx, ny);
    if (r > 0.98 && (x + y) % 3 === 0) return 0; // ragged leafy edge
    return ny < -0.35 - nx * 0.2 ? C.green3 : ny < 0.25 ? dither(x, y, 0.35, C.green2, C.green3) : C.green1;
  });
  for (const [x, y] of [[10, 10], [19, 8], [22, 15], [12, 17]] as const) img.set(x, y, C.green3);
  return ol(img);
}

function bush(): Img {
  const img = new Img(18, 13);
  ellipse(img, 9, 7, 8, 5, (x, y, nx, ny) => (ny < -0.3 ? C.green3 : ny < 0.3 ? C.green2 : C.green1));
  for (const [x, y, c] of [[5, 5, C.coral], [11, 4, C.yellow], [13, 7, C.coral]] as const) img.set(x, y, c);
  return ol(img);
}

function rock(): Img {
  const img = new Img(16, 12);
  ellipse(img, 8, 7, 7, 4.5, (x, y, nx, ny) => (ny < -0.4 ? C.white : nx + ny < 0 ? C.gray2 : C.gray1));
  return ol(img);
}

function crate(): Img {
  const img = new Img(15, 15);
  rect(img, 1, 1, 13, 13, C.wood);
  rect(img, 1, 1, 13, 4, C.sand1);
  hline(img, 1, 13, 5, C.bark2);
  line(img, 2, 6, 12, 13, C.bark2);
  vline(img, 1, 1, 13, C.bark2);
  vline(img, 13, 1, 13, C.bark2);
  return ol(img);
}

function barrel(): Img {
  const img = new Img(13, 17);
  rect(img, 2, 3, 9, 12, C.wood);
  ellipse(img, 6.5, 3, 4.5, 1.6, C.bark2);
  ellipse(img, 6.5, 3, 3, 0.8, C.bark1);
  hline(img, 2, 10, 6, C.gray1);
  hline(img, 2, 10, 12, C.gray1);
  vline(img, 2, 3, 14, C.bark2);
  vline(img, 10, 3, 14, C.bark2);
  return ol(img);
}

function lamp(): Img {
  const img = new Img(10, 26);
  vline(img, 4, 7, 23, C.ink);
  vline(img, 5, 7, 23, C.gray1);
  rect(img, 2, 2, 6, 6, C.navy);
  rect(img, 3, 3, 4, 4, C.yellow);
  hline(img, 1, 8, 1, C.ink);
  hline(img, 2, 7, 24, C.gray1);
  return ol(img);
}

function flowers(): Img {
  const img = new Img(16, 9);
  for (const [x, y, c] of [[2, 4, C.coral], [5, 2, C.yellow], [8, 5, C.white], [11, 3, C.coral], [13, 6, C.violet2], [6, 6, C.peach]] as const) {
    vline(img, x, y + 1, 8, C.green1);
    img.set(x, y, c);
    img.set(x - 1, y, c);
    img.set(x + 1, y, c);
    img.set(x, y - 1, c);
  }
  return img;
}

function saltHeap(): Img {
  const img = new Img(22, 13);
  polygon(img, [[1, 12], [11, 1], [21, 12]], (x) => (x < 11 ? C.white : x < 15 ? C.foam2 : C.gray2));
  return ol(img);
}

function pinwheel(frame: number): Img {
  const img = new Img(14, 28);
  vline(img, 7, 7, 26, C.gray2);
  const cols = [C.coral, C.yellow, C.sea2, C.white];
  const cx = 7, cy = 7;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + (frame ? Math.PI / 4 : 0);
    const ux = Math.cos(a), uy = Math.sin(a);
    polygon(img, [[cx, cy], [cx + ux * 6 - uy * 2, cy + uy * 6 + ux * 2], [cx + ux * 6 + uy * 2, cy + uy * 6 - ux * 2]], cols[k]!);
  }
  img.set(cx, cy, C.ink);
  return ol(img);
}

function netRack(): Img {
  const img = new Img(26, 20);
  vline(img, 2, 2, 18, C.bark1);
  vline(img, 23, 2, 18, C.bark1);
  hline(img, 2, 23, 3, C.bark2);
  for (let y = 4; y < 16; y++) for (let x = 3; x < 23; x++) if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) img.set(x, y, C.jade3);
  disc(img, 8, 8, 1.4, C.coral);
  disc(img, 17, 12, 1.4, C.coral);
  return ol(img);
}

function rowboat(): Img {
  const img = new Img(34, 16);
  ellipse(img, 17, 8, 15, 6, (x, y, nx, ny) => (Math.abs(nx) > 0.82 && Math.abs(ny) < 0.5 ? C.white : ny < -0.4 ? C.coral : C.red2));
  ellipse(img, 17, 8, 12, 3.6, (x, y, nx, ny) => (Math.abs(nx) < 0.12 ? C.bark2 : C.wood));
  return ol(img);
}

function drum(): Img {
  const img = new Img(13, 17);
  rect(img, 2, 3, 9, 12, C.red2);
  vline(img, 3, 3, 14, C.coral);
  vline(img, 10, 3, 14, C.red1);
  hline(img, 2, 10, 7, C.red1);
  hline(img, 2, 10, 11, C.red1);
  ellipse(img, 6.5, 3, 4.5, 1.6, C.gray2);
  img.set(8, 3, C.ink);
  return ol(img);
}

export function buildTown(): SheetItem[] {
  const out: SheetItem[] = [];
  for (const [id, look] of Object.entries(PEOPLE)) out.push(...walker(`p_${id}`, look));
  out.push(
    { name: "b_house_red", img: house({ w: 44, roofH: 22, wallH: 22, roof: [C.red2, C.red1], wall: [C.white, C.gray2], chimney: true }) },
    { name: "b_house_blue", img: house({ w: 40, roofH: 20, wallH: 22, roof: [C.sea1, C.deep2], wall: [C.sand2, C.sand1], chimney: true }) },
    { name: "b_house_brown", img: house({ w: 44, roofH: 22, wallH: 22, roof: [C.wood, C.bark2], wall: [C.white, C.gray2], chimney: true }) },
    { name: "b_house_green", img: house({ w: 40, roofH: 20, wallH: 22, roof: [C.jade2, C.jade1], wall: [C.sand2, C.sand1], chimney: true }) },
    { name: "b_grandpa", img: grandpaHouse() },
    { name: "b_saltstore", img: saltStore() },
    { name: "o_laundry", img: laundry() },
    { name: "o_fence", img: fence() },
    { name: "o_garden", img: garden() },
    { name: "o_well", img: well() },
    { name: "o_bench", img: bench() },
    { name: "o_sacks", img: sacks() },
    { name: "o_fishrack", img: fishRack() },
    { name: "o_cart", img: cart() },
    { name: "o_pot", img: pot() },
    { name: "o_ball", img: ball() },
    { name: "o_rods", img: rods() },
    { name: "b_shop", img: shop([C.sea1, C.deep2], C.sea2, "bag") },
    { name: "b_shop_salt", img: shop([C.gray2, C.gray1], C.sea1, "bag") },
    { name: "b_shed", img: shed() },
    { name: "b_stall_fish", img: stall(C.red2, "fish") },
    { name: "b_stall_goods", img: stall(C.sea1, "goods") },
    { name: "b_pump", img: pump() },
    { name: "b_board", img: board() },
    { name: "b_lighthouse", img: lighthouse() },
    { name: "b_belltower", img: belltower() },
    { name: "o_tree", img: tree() },
    { name: "o_bush", img: bush() },
    { name: "o_rock", img: rock() },
    { name: "o_crate", img: crate() },
    { name: "o_barrel", img: barrel() },
    { name: "o_drum", img: drum() },
    { name: "o_lamp", img: lamp() },
    { name: "o_flowers", img: flowers() },
    { name: "o_saltheap", img: saltHeap() },
    { name: "o_pinwheel_0", img: pinwheel(0) },
    { name: "o_pinwheel_1", img: pinwheel(1) },
    { name: "o_netrack", img: netRack() },
    { name: "o_rowboat", img: rowboat() },
  );
  return out;
}

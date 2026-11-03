import { C } from "../palette";
import { disc, ellipse, hline, line, polygon, rect, vline, dither } from "../lib/draw";
import { grid, Img } from "../lib/image";
import type { SheetItem } from "../lib/sheet";

// Float (찌), hook, trash (design §6-2 쓰레기) and relics (유물).

const L = {
  k: C.ink, n: C.navy, g: C.gray1, G: C.gray2, w: C.white, f: C.foam1, F: C.foam2,
  s: C.sea3, S: C.sea2, b: C.sea1, d: C.deep2, r: C.red2, R: C.red1, c: C.coral, p: C.peach,
  y: C.yellow, o: C.sand1, O: C.sand2, W: C.wood, B: C.bark2, K: C.bark1,
  j: C.jade2, J: C.jade1, h: C.jade3, e: C.green2, E: C.green1, v: C.violet2, V: C.violet1,
};

const ol = (img: Img) => img.outline(C.ink);

// ── float (찌): idle / bob / bite ──
const FLOAT = `
  .c.
  .c.
  crc
  .w.
  yOy
  yyo
  yyo
  yyo
  .y.
  .K.
  .K.
`;
function floats(): SheetItem[] {
  const base = grid(FLOAT, L);
  const mk = (sink: number) => {
    // `sink` px of the float are below the waterline; the game masks it, we keep the full sprite
    const img = new Img(base.w, base.h + 2);
    img.blit(base, 0, 1 + sink);
    return ol(img);
  };
  return [
    { name: "float_idle", img: mk(0), anchor: { line: [2, 1], waterline: [2, 6] } },
    { name: "float_bob", img: mk(1), anchor: { line: [2, 2], waterline: [2, 6] } },
  ];
}

const HOOK = `
  ..GG
  ...G
  ...G
  ...G
  G..G
  GG.G
  .GG.
`;

// ── trash ──
const BAG = `
  ...F.....F...
  ..F.F...F.F..
  ..F.F...F.F..
  .FFFFFFFFFFF.
  FwwwwwwwwwwwF
  FwwwwwwwwfwwF
  FwwwFwwwwwfwF
  FwwwwFwwwwwwF
  FFwwwwwwwwwFF
  .FwwwwwwwwfF.
  .FfwwwwwwwFF.
  ..FFwwwwwFF..
  ...FFFFFFF...
`;
const BOTTLE = `
  ..bbb..
  ..bbb..
  ..FwF..
  .FFwFF.
  FFFwFFf
  FFFFFFf
  ssssSSs
  sSSSSSs
  ssssSSs
  FFFFFFf
  FwFFFFf
  FwFFFFf
  FFFFFFf
  .Fffff.
`;

function tire(): Img {
  const img = new Img(22, 22);
  ellipse(img, 11, 11, 10, 10, (x, y, nx, ny) => {
    const r = Math.hypot(nx, ny);
    if (r < 0.42) return 0;
    const ang = Math.atan2(ny, nx);
    if (r > 0.86 && Math.round((ang / Math.PI) * 8) % 2 === 0) return C.gray1; // tread
    if (r < 0.55) return C.gray1; // rim lip
    return nx + ny < -0.6 ? C.gray1 : C.navy;
  });
  disc(img, 11, 11, 3.4, 0);
  for (const [x, y] of [[5, 5], [6, 4], [4, 6]] as const) img.set(x, y, C.gray2);
  return ol(img);
}

function net(): Img {
  const img = new Img(24, 18);
  polygon(img, [[2, 8], [6, 3], [12, 2], [19, 4], [22, 9], [19, 15], [11, 16], [4, 14]], (x, y) =>
    (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? C.jade3 : (x * 7 + y * 3) % 5 === 0 ? C.jade1 : 0,
  );
  // tangled rope + floats
  line(img, 1, 12, 6, 9, C.sand1);
  line(img, 18, 3, 23, 1, C.sand1);
  disc(img, 8, 6, 1.6, C.coral);
  img.set(7, 5, C.peach);
  disc(img, 17, 12, 1.6, C.coral);
  img.set(16, 11, C.peach);
  return ol(img);
}

function drum(): Img {
  const img = new Img(18, 24);
  rect(img, 1, 3, 16, 19, C.red2);
  for (let y = 3; y < 22; y++) {
    img.set(2, y, C.coral);
    img.set(3, y, dither(3, y, 0.5, C.red2, C.coral));
    img.set(15, y, C.red1);
    img.set(16, y, C.red1);
  }
  hline(img, 1, 16, 8, C.red1);
  hline(img, 1, 16, 16, C.red1);
  ellipse(img, 8.5, 3, 8, 2.2, C.gray2);
  ellipse(img, 8.5, 3, 5, 1.2, C.gray1);
  ellipse(img, 8.5, 22, 8, 1.6, C.red1);
  // hazard diamond
  polygon(img, [[8.5, 9.5], [11.5, 12.5], [8.5, 15.5], [5.5, 12.5]], C.yellow);
  vline(img, 8, 11, 13, C.ink);
  img.set(8, 14, C.ink);
  // rust + oil drip
  img.set(13, 19, C.wood); img.set(12, 20, C.bark2); img.set(4, 18, C.wood);
  vline(img, 11, 4, 7, C.ink); vline(img, 11, 9, 10, C.ink); img.set(12, 5, C.ink);
  return ol(img);
}

// ── relics (16×16 icons) ──
function trafficLight(): Img {
  const img = new Img(14, 16);
  rect(img, 3, 0, 7, 13, C.navy);
  vline(img, 3, 0, 12, C.gray1);
  for (const [cy, c] of [[2.5, C.coral], [6.5, C.yellow], [10.5, C.jade3]] as const) {
    disc(img, 6.5, cy, 1.6, c);
    hline(img, 4, 9, Math.floor(cy) - 2, C.ink); // visor
  }
  img.set(6, 2, C.peach);
  rect(img, 6, 13, 2, 3, C.gray1);
  return ol(img);
}

const SIGN = `
  WWWWWWWWWWWWWW
  WOOOOOOOOOOOOW
  WOccOccOOcOOOW
  WOcOOOcOccOcOW
  WOccOccOOcOOOW
  WOOOOOOOOOOOOW
  WOoOOooOOOoOOW
  WWWWWWWWWWWWWW
  ..g........g..
  ..g........g..
  ..g........g..
`;
function phone(): Img {
  const img = new Img(10, 16);
  rect(img, 1, 0, 8, 16, C.ink);
  rect(img, 2, 2, 6, 10, C.sea2);
  for (let y = 2; y < 12; y++) for (let x = 2; x < 8; x++) if ((x + y) % 5 === 0) img.set(x, y, C.sea3);
  line(img, 3, 3, 6, 9, C.foam2); // crack
  img.set(5, 6, C.white);
  hline(img, 4, 5, 13, C.gray1);
  img.set(4, 1, C.gray1);
  return ol(img);
}
const LEDGER = `
  BBBBBBBBBBBO
  BKKKKKKKKKBO
  BKOOOOOOOKBO
  BKOggggOOKBO
  BKOOOOOOOKBO
  BKKKKKKKKKBO
  BBBBBBBBBBBO
  BBBBBBBBccBO
  BBBBBBBcrrcO
  BBBBBBBcrrcO
  BBBBBBBBccBO
  BBBBBBBBBBBO
  BBBBBBBBBBBO
  KKKKKKKKKKKO
`;
// Headline, a photo, and lines of text; the top-right corner is dog-eared.
const NEWSPAPER = `
  wwwwwwwwwwwG..
  wkkkkkkkkkwGG.
  wkkkkkkkkkwwGG
  wwwwwwwwwwwwwG
  wGGGGGwgggggwG
  wGgggGwwwwwwwG
  wGggGGwgggggwG
  wGGGGGwwwwwwwG
  wwwwwwwgggggwG
  wggggwwwwwwwwG
  wwwwwwwgggggwG
  wggggwwwwwwwwG
  GGGGGGGGGGGGGG
`;

export function buildProps(): SheetItem[] {
  return [
    ...floats(),
    { name: "hook", img: ol(grid(HOOK, L)) },
    { name: "trash_bag", img: ol(grid(BAG, L)) },
    { name: "trash_bottle", img: ol(grid(BOTTLE, L)) },
    { name: "trash_tire", img: tire() },
    { name: "trash_net", img: net() },
    { name: "trash_drum", img: drum() },
    { name: "relic_traffic_light", img: trafficLight() },
    { name: "relic_sign", img: ol(grid(SIGN, L)) },
    { name: "relic_phone", img: phone() },
    { name: "relic_ledger", img: ol(grid(LEDGER, L)) },
    { name: "relic_newspaper", img: ol(grid(NEWSPAPER, L)) },
  ];
}

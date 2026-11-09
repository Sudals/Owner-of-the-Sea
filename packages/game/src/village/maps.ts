// Village maps (top-down, 16 px tiles): the ground, the buildings and props, the people, and the
// spots where you do business. Each village is built from a few shapes (an island blob, paths,
// raft decks) so the layouts stay easy to read and change.
//   ground  ~ water · . grass · , flowers · s sand · : dirt path · o stone · = wooden deck
//           r rock · w salt pan
// Services only appear when the island's market offers them (balance.jsonc economy.markets).
// A stall keeper stands on the stall's own row: drawn behind it, shown between awning and counter.

export type Ground = "~" | "." | "," | "s" | ":" | "o" | "=" | "r" | "w";
export type Facing = "down" | "up" | "left" | "right";
export type Service = "market" | "shop" | "fuel" | "repair" | "gift" | "talk" | "leave";

/** A sprite from the town sheet, its bottom-center on tile (x, y). `foot` = solid tiles (w × h) up from there. */
export type Prop = { sprite: string; x: number; y: number; foot?: [number, number]; anim?: string[]; light?: boolean };
/** A villager standing (or walking a loop of tiles). `look` = p_<look>_<dir>_<frame>. */
export type Npc = { id: string; look: string; name: string; x: number; y: number; dir: Facing; walk?: [number, number][] };
/** Where the player stands to do something, and what it is. */
export type Poi = { id: string; x: number; y: number; services: Service[]; who: string; npc?: string; lines?: string[] };

export type VillageDef = {
  id: string;
  w: number;
  h: number;
  ground: Ground[][];
  props: Prop[];
  npcs: Npc[];
  pois: Poi[];
  /** Where you step off the boat (facing up, into the village). */
  spawn: [number, number];
};

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

class Grid {
  readonly g: Ground[][];
  constructor(
    readonly w: number,
    readonly h: number,
    fill: Ground = "~",
  ) {
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }
  set(x: number, y: number, t: Ground): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y]![x] = t;
  }
  get(x: number, y: number): Ground {
    return this.g[y]?.[x] ?? "~";
  }
  fill(x0: number, y0: number, x1: number, y1: number, t: Ground): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
    return this;
  }
  /** An ellipse with a wobbly edge. `onlyOver` limits it to tiles of those kinds. */
  blob(cx: number, cy: number, rx: number, ry: number, t: Ground, seed = 1, onlyOver?: Ground[]): this {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++)
      for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const a = Math.atan2(y - cy, x - cx);
        const wob = 1 + (Math.sin(a * 3 + seed) * 0.06 + Math.sin(a * 5 + seed * 2) * 0.05);
        if (((x - cx) / (rx * wob)) ** 2 + ((y - cy) / (ry * wob)) ** 2 > 1) continue;
        if (onlyOver && !onlyOver.includes(this.get(x, y))) continue;
        this.set(x, y, t);
      }
    return this;
  }
  /** A path along straight legs between the points (`w` tiles wide). */
  path(pts: [number, number][], t: Ground, w = 1): this {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!;
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let k = 0; k < w; k++) this.set(x, y0 + k, t);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let k = 0; k < w; k++) this.set(x1 + k, y, t);
    }
    return this;
  }
  /** Scatter flowers over grass. */
  flowers(seed: number, share = 0.06): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y) === "." && hash(x, y, seed) < share) this.set(x, y, ",");
    return this;
  }
}

const W = 40, H = 26;

// ── 빨간등대: a rocky islet, 덕배 할멈's house, grandfather's house, the lighthouse ──
function redLighthouse(): VillageDef {
  const g = new Grid(W, H)
    .blob(20, 12, 15.5, 9.6, "r", 1)
    .blob(20, 11.4, 13.2, 7.6, ".", 2)
    .blob(20.5, 19.2, 5.5, 2.4, "s", 3)
    .path([[20, 19], [20, 12], [12, 12], [12, 8]], ":")
    .path([[20, 12], [27, 12], [27, 16]], ":")
    .fill(19, 20, 20, 25, "=")
    .flowers(11, 0.07);
  return {
    id: "red_lighthouse",
    w: W,
    h: H,
    ground: g.g,
    spawn: [20, 22],
    props: [
      { sprite: "b_lighthouse", x: 10, y: 7, foot: [2, 2] },
      { sprite: "b_house_red", x: 16, y: 10, foot: [3, 2] },
      { sprite: "b_house_blue", x: 24, y: 10, foot: [3, 2] },
      { sprite: "b_shed", x: 29, y: 16, foot: [3, 2] },
      { sprite: "b_board", x: 15, y: 15, foot: [1, 1] },
      { sprite: "o_tree", x: 8, y: 12, foot: [1, 1] },
      { sprite: "o_tree", x: 30, y: 9, foot: [1, 1] },
      { sprite: "o_tree", x: 13, y: 17, foot: [1, 1] },
      { sprite: "o_tree", x: 23, y: 16, foot: [1, 1] },
      { sprite: "o_bush", x: 19, y: 9, foot: [1, 1] },
      { sprite: "o_bush", x: 32, y: 13, foot: [1, 1] },
      { sprite: "o_flowers", x: 22, y: 11 },
      { sprite: "o_flowers", x: 14, y: 11 },
      { sprite: "o_rock", x: 6, y: 9, foot: [1, 1] },
      { sprite: "o_rock", x: 34, y: 15, foot: [1, 1] },
      { sprite: "o_lamp", x: 18, y: 19, foot: [1, 1], light: true },
      { sprite: "o_lamp", x: 22, y: 19, foot: [1, 1], light: true },
      { sprite: "o_crate", x: 31, y: 17, foot: [1, 1] },
      { sprite: "o_barrel", x: 32, y: 17, foot: [1, 1] },
      { sprite: "o_netrack", x: 25, y: 19, foot: [2, 1] },
      { sprite: "o_rowboat", x: 23, y: 23 },
    ],
    npcs: [
      { id: "granny", look: "granny", name: "덕배 할멈", x: 18, y: 11, dir: "down" },
      { id: "fixer", look: "fisher", name: "동네 아저씨", x: 30, y: 18, dir: "left" },
      { id: "walker", look: "woman", name: "마을 사람", x: 13, y: 13, dir: "right", walk: [[13, 13], [19, 13], [19, 18], [19, 13]] },
    ],
    pois: [
      { id: "granny", x: 18, y: 12, services: ["market", "gift"], who: "덕배 할멈", npc: "granny" },
      { id: "repair", x: 29, y: 18, services: ["repair"], who: "동네 아저씨 · 배 수리", npc: "fixer" },
      { id: "grandpa", x: 24, y: 11, services: ["talk"], who: "할아버지의 집", lines: ["할아버지가 살던 집이다. 문이 잠겨 있다.", "언젠가 열쇠를 찾으면 들어갈 수 있을 것 같다."] },
      { id: "board", x: 15, y: 16, services: ["talk"], who: "게시판", lines: ["「물고기 값은 섬마다, 날마다 달라요」", "「물장터는 동쪽, 소금꽃섬은 남동쪽 바다」"] },
      { id: "lighthouse", x: 10, y: 8, services: ["talk"], who: "빨간 등대", lines: ["할아버지가 지키던 등대. 밤마다 아직 불이 켜진다."] },
      { id: "pier", x: 20, y: 24, services: ["leave"], who: "선착장" },
    ],
  };
}

// ── 물장터: rafts and old hulls lashed together on the water ──
function waterMarket(): VillageDef {
  const g = new Grid(W, H)
    .fill(9, 5, 31, 18, "=")
    .fill(14, 12, 16, 14, "~")
    .fill(25, 13, 27, 14, "~")
    .fill(3, 9, 8, 14, "=")
    .fill(32, 8, 37, 12, "=")
    .fill(19, 19, 20, 25, "=");
  return {
    id: "water_market",
    w: W,
    h: H,
    ground: g.g,
    spawn: [20, 22],
    props: [
      { sprite: "b_stall_fish", x: 15, y: 9, foot: [3, 1] },
      { sprite: "b_stall_goods", x: 24, y: 9, foot: [3, 1] },
      { sprite: "b_shed", x: 5, y: 12, foot: [3, 2] },
      { sprite: "b_pump", x: 35, y: 10, foot: [1, 1] },
      { sprite: "o_drum", x: 36, y: 10, foot: [1, 1] },
      { sprite: "o_drum", x: 34, y: 9, foot: [1, 1] },
      { sprite: "b_board", x: 11, y: 7, foot: [1, 1] },
      { sprite: "b_house_brown", x: 28, y: 7, foot: [3, 2] },
      { sprite: "o_crate", x: 18, y: 8, foot: [1, 1] },
      { sprite: "o_crate", x: 21, y: 8, foot: [1, 1] },
      { sprite: "o_barrel", x: 12, y: 10, foot: [1, 1] },
      { sprite: "o_barrel", x: 29, y: 12, foot: [1, 1] },
      { sprite: "o_netrack", x: 11, y: 17, foot: [2, 1] },
      { sprite: "o_netrack", x: 29, y: 17, foot: [2, 1] },
      { sprite: "o_lamp", x: 18, y: 18, foot: [1, 1], light: true },
      { sprite: "o_lamp", x: 21, y: 18, foot: [1, 1], light: true },
      { sprite: "o_lamp", x: 10, y: 14, foot: [1, 1], light: true },
      { sprite: "o_rowboat", x: 5, y: 18 },
      { sprite: "o_rowboat", x: 35, y: 16 },
      { sprite: "o_rowboat", x: 26, y: 22 },
    ],
    npcs: [
      { id: "malsun", look: "malsun", name: "말순", x: 15, y: 9, dir: "down" },
      { id: "goods", look: "woman", name: "잡화 좌판", x: 24, y: 9, dir: "down" },
      { id: "fixer", look: "fisher", name: "배 고치는 아저씨", x: 8, y: 13, dir: "left" },
      { id: "walker", look: "man", name: "장꾼", x: 12, y: 16, dir: "right", walk: [[12, 16], [23, 16], [23, 11], [23, 16]] },
    ],
    pois: [
      { id: "market", x: 15, y: 10, services: ["market"], who: "말순 · 생선 좌판", npc: "malsun" },
      { id: "shop", x: 24, y: 10, services: ["shop"], who: "잡화 좌판", npc: "goods" },
      { id: "repair", x: 5, y: 13, services: ["repair"], who: "배 고치는 아저씨", npc: "fixer" },
      { id: "fuel", x: 35, y: 11, services: ["fuel"], who: "주유기" },
      { id: "board", x: 11, y: 8, services: ["talk"], who: "장터 게시판", lines: ["「오늘의 특가는 좌판 앞에 적어 둡니다」", "「한 가지만 잔뜩 가져오면 값이 내려가요」"] },
      { id: "pier", x: 20, y: 24, services: ["leave"], who: "선착장" },
    ],
  };
}

// ── 소금꽃섬: salt pans on a sandy island, pinwheels turning in the wind ──
function saltFlower(): VillageDef {
  const g = new Grid(W, H).blob(20, 12, 17, 10.4, "s", 4).blob(20, 11, 15, 8.4, ".", 5, ["s"]);
  // salt pans in a dike grid
  for (let y = 4; y <= 9; y++) for (let x = 7; x <= 19; x++) if (g.get(x, y) !== "~") g.set(x, y, x % 3 === 0 || y % 3 === 0 ? "s" : "w");
  g.path([[21, 20], [21, 11], [9, 11]], ":")
    .path([[21, 14], [30, 14], [30, 17]], ":")
    .fill(20, 21, 21, 25, "=")
    .flowers(21, 0.04);
  return {
    id: "salt_flower",
    w: W,
    h: H,
    ground: g.g,
    spawn: [21, 22],
    props: [
      { sprite: "b_shop_salt", x: 14, y: 14, foot: [3, 2] },
      { sprite: "b_stall_fish", x: 26, y: 10, foot: [3, 1] },
      { sprite: "b_house_brown", x: 29, y: 7, foot: [3, 2] },
      { sprite: "b_house_green", x: 9, y: 17, foot: [3, 2] },
      { sprite: "b_shed", x: 32, y: 17, foot: [3, 2] },
      { sprite: "b_pump", x: 24, y: 20, foot: [1, 1] },
      { sprite: "o_drum", x: 25, y: 20, foot: [1, 1] },
      { sprite: "b_board", x: 18, y: 16, foot: [1, 1] },
      { sprite: "o_pinwheel_0", x: 9, y: 9, foot: [1, 1], anim: ["o_pinwheel_0", "o_pinwheel_1"] },
      { sprite: "o_pinwheel_0", x: 21, y: 6, foot: [1, 1], anim: ["o_pinwheel_1", "o_pinwheel_0"] },
      { sprite: "o_pinwheel_0", x: 33, y: 11, foot: [1, 1], anim: ["o_pinwheel_0", "o_pinwheel_1"] },
      { sprite: "o_saltheap", x: 10, y: 10, foot: [1, 1] },
      { sprite: "o_saltheap", x: 17, y: 10, foot: [1, 1] },
      { sprite: "o_saltheap", x: 23, y: 8, foot: [1, 1] },
      { sprite: "o_tree", x: 34, y: 14, foot: [1, 1] },
      { sprite: "o_bush", x: 5, y: 14, foot: [1, 1] },
      { sprite: "o_crate", x: 28, y: 11, foot: [1, 1] },
      { sprite: "o_lamp", x: 19, y: 20, foot: [1, 1], light: true },
      { sprite: "o_lamp", x: 23, y: 17, foot: [1, 1], light: true },
      { sprite: "o_rowboat", x: 16, y: 23 },
    ],
    npcs: [
      { id: "oldman", look: "oldman", name: "강노인", x: 26, y: 10, dir: "down" },
      { id: "fixer", look: "man", name: "수리공", x: 34, y: 17, dir: "left" },
      { id: "walker", look: "woman", name: "소금 일꾼", x: 9, y: 12, dir: "right", walk: [[9, 12], [17, 12], [17, 11], [9, 11]] },
    ],
    pois: [
      { id: "market", x: 26, y: 11, services: ["market"], who: "강노인 · 생선 매입", npc: "oldman" },
      { id: "shop", x: 14, y: 15, services: ["shop"], who: "소금 가게" },
      { id: "repair", x: 32, y: 18, services: ["repair"], who: "수리공", npc: "fixer" },
      { id: "fuel", x: 24, y: 21, services: ["fuel"], who: "주유기" },
      { id: "board", x: 18, y: 17, services: ["talk"], who: "게시판", lines: ["「소금에 절인 생선은 이 섬에서 제값」", "「얼음 창고는 소금 가게에서」"] },
      { id: "pier", x: 21, y: 24, services: ["leave"], who: "선착장" },
    ],
  };
}

// ── 종탑섬: the bell tower of a drowned school, children living on rafts around it ──
function bellTower(): VillageDef {
  const g = new Grid(W, H)
    .fill(10, 6, 30, 18, "=")
    .fill(10, 6, 12, 8, "~")
    .fill(28, 16, 30, 18, "~")
    .fill(17, 13, 18, 14, "~")
    .fill(19, 19, 20, 25, "=");
  return {
    id: "bell_tower",
    w: W,
    h: H,
    ground: g.g,
    spawn: [20, 22],
    props: [
      { sprite: "b_belltower", x: 20, y: 10, foot: [3, 3] },
      { sprite: "b_stall_fish", x: 14, y: 11, foot: [3, 1] },
      { sprite: "b_stall_goods", x: 26, y: 11, foot: [3, 1] },
      { sprite: "b_shed", x: 13, y: 17, foot: [3, 2] },
      { sprite: "b_board", x: 23, y: 15, foot: [1, 1] },
      { sprite: "o_crate", x: 24, y: 7, foot: [1, 1] },
      { sprite: "o_crate", x: 25, y: 7, foot: [1, 1] },
      { sprite: "o_barrel", x: 16, y: 7, foot: [1, 1] },
      { sprite: "o_netrack", x: 27, y: 14, foot: [2, 1] },
      { sprite: "o_flowers", x: 22, y: 12 },
      { sprite: "o_lamp", x: 18, y: 18, foot: [1, 1], light: true },
      { sprite: "o_lamp", x: 21, y: 18, foot: [1, 1], light: true },
      { sprite: "o_rowboat", x: 7, y: 15 },
      { sprite: "o_rowboat", x: 33, y: 9 },
    ],
    npcs: [
      { id: "bada", look: "kid", name: "아이 바다", x: 14, y: 11, dir: "down" },
      { id: "kid2", look: "kid", name: "좌판 아이", x: 26, y: 11, dir: "down" },
      { id: "fixer", look: "man", name: "목수 아저씨", x: 16, y: 18, dir: "left" },
      { id: "walker", look: "kid", name: "뛰노는 아이", x: 12, y: 15, dir: "right", walk: [[12, 15], [25, 15]] },
    ],
    pois: [
      { id: "market", x: 14, y: 12, services: ["market"], who: "아이 바다 · 생선 좌판", npc: "bada" },
      { id: "shop", x: 26, y: 12, services: ["shop"], who: "아이들의 좌판", npc: "kid2" },
      { id: "repair", x: 13, y: 18, services: ["repair"], who: "목수 아저씨", npc: "fixer" },
      { id: "tower", x: 20, y: 11, services: ["talk"], who: "종탑", lines: ["물에 잠긴 학교의 종탑. 오래된 교과서 냄새가 난다.", "아이들이 이 종을 쳐서 시간을 알린다."] },
      { id: "board", x: 23, y: 16, services: ["talk"], who: "게시판", lines: ["「선체 Lv2는 이 섬에서 팔아요 — 청빛 바다로 가려면 꼭!」"] },
      { id: "pier", x: 20, y: 24, services: ["leave"], who: "선착장" },
    ],
  };
}

const BUILDERS: Record<string, () => VillageDef> = {
  red_lighthouse: redLighthouse,
  water_market: waterMarket,
  salt_flower: saltFlower,
  bell_tower: bellTower,
};

const cache = new Map<string, VillageDef>();
/** The village of an island, or null where there is none yet (the rest open with M7). */
export function villageOf(islandId: string): VillageDef | null {
  if (!BUILDERS[islandId]) return null;
  let v = cache.get(islandId);
  if (!v) cache.set(islandId, (v = BUILDERS[islandId]!()));
  return v;
}

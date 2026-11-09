import { devShiftDays, fuelMax, holdCap, HULLS, ISLAND_BY_ID, ITEMS, kstDate, type ItemId, type Market } from "@sea/shared";
import { lutHex } from "../assets";
import type { Engine, Scene } from "../engine";
import type { Game } from "../game";
import { Fx } from "../render/fx";
import { drawDayTint, isNight } from "../render/tint";
import { button, dim, inRect, panel, text, textWidth } from "../render/ui";
import { InventoryPanel } from "../ui/inventoryPanel";
import { Modal } from "../ui/modal";
import { BIG, MarketPanel, ShopPanel, Trader } from "../ui/trade";
import { bakeGround, TL, type BakedGround } from "../village/ground";
import { villageOf, type Facing, type Npc, type Poi, type Prop, type Service, type VillageDef } from "../village/maps";

// 마을 (design §3-1; Economy.md §5): the village of an island, top-down. You walk it (arrows /
// WASD / click), and the market, shops, fuel, repairs and 덕배 할멈's worms are people and places
// you have to walk up to — Space when the prompt shows. Leaving by the pier goes back to the boat.

const VIEW_W = 640, VIEW_H = 360;
const SPEED = 70; // px/s
const NPC_SPEED = 28;
const PROMPT_BTN = { x: 320 - 140, y: 318, w: 280, h: 20 };

type Walker = { def: Npc; x: number; y: number; dir: Facing; wp: number; wait: number; moving: boolean; t: number };
type Sub = { k: "market"; p: MarketPanel } | { k: "shop"; p: ShopPanel } | { k: "bag"; p: InventoryPanel };

const SERVICE_LABEL: Record<Service, string> = {
  market: "물고기 팔기",
  shop: "물건 사기",
  fuel: "연료 넣기",
  repair: "배 수리",
  gift: "지렁이 받기",
  talk: "살펴보기",
  leave: "배로 돌아가기",
};

/** Tile under a point (feet). */
const tileOf = (px: number, py: number): [number, number] => [Math.floor(px / TL), Math.floor((py - 2) / TL)];
/** Where a walker's feet stand on a tile. */
const feetAt = (tx: number, ty: number): [number, number] => [(tx + 0.5) * TL, ty * TL + 13];

export class VillageScene implements Scene {
  private engine!: Engine;
  private readonly def: VillageDef;
  private ground: BakedGround | null = null;
  /** 1 = can't walk there (water, a building's footprint, a standing villager). */
  private solid: Uint8Array;
  private pc: { x: number; y: number; dir: Facing; moving: boolean; t: number };
  private route: [number, number][] = [];
  private goingTo: Poi | null = null;
  private walkers: Walker[];
  private pois: Poi[];
  private sub: Sub | null = null;
  private pause: { sel: number } | null = null;
  private toast: { text: string; until: number; color?: string } | null = null;
  private bubble: { npc: string; text: string; until: number } | null = null;
  private greeted = new Set<string>();
  private t = 0;
  readonly fx = new Fx();
  private readonly trader: Trader;
  private cam = { x: 0, y: 0 };

  constructor(
    private readonly game: Game,
    readonly islandId: string,
  ) {
    this.def = villageOf(islandId)!;
    const [sx, sy] = feetAt(...this.def.spawn);
    this.pc = { x: sx, y: sy, dir: "up", moving: false, t: 0 };
    this.walkers = this.def.npcs.map((n) => {
      const [x, y] = feetAt(n.x, n.y);
      return { def: n, x, y, dir: n.dir, wp: 0, wait: 0, moving: false, t: 0 };
    });
    this.trader = new Trader(game, islandId, this.fx, (s, bad) => this.say(s, 2.5, bad ? lutHex("coral") : undefined), () => (this.sub ? [BIG.x + BIG.w - 50, BIG.y + 26] : [60, 34]));
    const m = this.market;
    this.pois = this.def.pois.filter((p) => p.services.some((s) => this.offers(s, m)));
    this.solid = new Uint8Array(this.def.w * this.def.h);
    for (let y = 0; y < this.def.h; y++) for (let x = 0; x < this.def.w; x++) if (this.def.ground[y]![x] === "~") this.solid[y * this.def.w + x] = 1;
    for (const p of this.def.props) for (const [x, y] of footTiles(p)) this.solid[y * this.def.w + x] = 1;
  }

  /** For tests and the HUD. */
  get state() {
    return { k: "village" as const, island: this.islandId, panel: this.sub?.k ?? (this.game.engine.modal ? "modal" : null), prompt: this.near()?.id ?? null, tile: tileOf(this.pc.x, this.pc.y) };
  }

  private get market(): Market | null {
    return this.trader.market;
  }

  /** Does this island's market offer the service? (fuel at 빨간등대: no) */
  private offers(s: Service, m: Market | null): boolean {
    switch (s) {
      case "market":
        return !!m && (Object.keys(m.buy).length > 0 || !!m.trashFlat);
      case "shop":
        return !!m && m.shop.length > 0;
      case "fuel":
        return m?.fuel != null;
      case "repair":
        return m?.repair != null;
      case "gift":
        return !!m?.dailyWorms;
      default:
        return true;
    }
  }

  enter(engine: Engine): void {
    this.engine = engine;
    this.ground = bakeGround(this.def);
    this.game.save();
  }

  private say(s: string, seconds = 2.5, color?: string): void {
    this.toast = { text: s, until: this.t + seconds, color };
  }

  // ── tests ──────────────────────────────────────────────────────────────────

  /** Stand on a spot, facing it (tests). */
  warpTo(poiId: string): boolean {
    const p = this.pois.find((x) => x.id === poiId);
    if (!p) return false;
    [this.pc.x, this.pc.y] = feetAt(p.x, p.y);
    this.pc.dir = "up";
    this.route = [];
    return true;
  }

  /** Space where you stand (tests). */
  interact(): void {
    const p = this.near();
    if (p) this.use(p);
  }

  // ── world rules ────────────────────────────────────────────────────────────

  private blockedTile(tx: number, ty: number, ignore?: Walker): boolean {
    if (tx < 0 || ty < 0 || tx >= this.def.w || ty >= this.def.h) return true;
    if (this.solid[ty * this.def.w + tx]) return true;
    for (const w of this.walkers) {
      if (w === ignore) continue;
      const [wx, wy] = tileOf(w.x, w.y);
      if (wx === tx && wy === ty) return true;
    }
    return false;
  }

  /** The player's feet box (8×4) against the map. */
  private blockedAt(x: number, y: number): boolean {
    for (const [dx, dy] of [[-4, -4], [3, -4], [-4, -1], [3, -1]] as const) {
      const tx = Math.floor((x + dx) / TL), ty = Math.floor((y + dy) / TL);
      if (this.blockedTile(tx, ty)) return true;
    }
    return false;
  }

  /** The spot you're standing at, if any. */
  private near(): Poi | null {
    let best: Poi | null = null, bd = 13;
    for (const p of this.pois) {
      const [px, py] = feetAt(p.x, p.y);
      const d = Math.hypot(this.pc.x - px, this.pc.y - py);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  /** Shortest walk (tiles) to a tile, or null. */
  private findRoute(tx: number, ty: number): [number, number][] | null {
    const W = this.def.w, H = this.def.h;
    const [sx, sy] = tileOf(this.pc.x, this.pc.y);
    if (sx === tx && sy === ty) return [];
    const prev = new Int32Array(W * H).fill(-1);
    const q = [sy * W + sx];
    prev[sy * W + sx] = sy * W + sx;
    while (q.length) {
      const i = q.shift()!;
      const x = i % W, y = (i / W) | 0;
      if (x === tx && y === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy, ni = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[ni]! >= 0 || this.blockedTile(nx, ny)) continue;
        prev[ni] = i;
        q.push(ni);
      }
    }
    const goal = ty * W + tx;
    if (prev[goal]! < 0) return null;
    const out: [number, number][] = [];
    for (let i = goal; i !== sy * W + sx; i = prev[i]!) out.unshift([i % W, (i / W) | 0]);
    return out;
  }

  // ── doing things ───────────────────────────────────────────────────────────

  private use(p: Poi): void {
    this.route = [];
    this.goingTo = null;
    const npc = p.npc ? this.walkers.find((w) => w.def.id === p.npc) : null;
    if (npc) npc.dir = faceToward(npc.x, npc.y, this.pc.x, this.pc.y);
    this.pc.dir = npc ? faceToward(this.pc.x, this.pc.y, npc.x, npc.y) : "up";
    const m = this.market;
    const services = p.services.filter((s) => this.offers(s, m));
    if (services.length === 1) return this.run(services[0]!, p);
    // the keeper's line, a sentence per row so it fits the dialog
    const said = m && p.npc && services.includes("market") ? m.line.split(/(?<=[.?!])\s+/).filter(Boolean) : [];
    this.game.engine.modal = new Modal({
      title: p.who,
      lines: said.length ? said : ["무엇을 할까?"],
      buttons: [...services.map((s) => ({ id: s, label: s === "gift" && this.trader.giftGiven() ? "지렁이 (오늘 받음)" : SERVICE_LABEL[s] })), { id: "bye", label: "그만두기" }],
      cancel: "bye",
      onPick: (id) => {
        this.game.engine.modal = null;
        if (id !== "bye") this.run(id as Service, p);
      },
    });
  }

  private run(s: Service, p: Poi): void {
    const m = this.market;
    switch (s) {
      case "market":
        this.sub = { k: "market", p: new MarketPanel(this.trader) };
        return;
      case "shop":
        this.sub = { k: "shop", p: new ShopPanel(this.trader, p.who) };
        return;
      case "fuel": {
        const q = this.trader.fuelQuote(), w = this.game.world;
        if (q.why) return this.say(`연료 ${Math.ceil(w.fuel)}/${fuelMax(w)} · ${q.why}`, 2);
        return this.confirm(p.who, [`연료 ${Math.ceil(w.fuel)} / ${fuelMax(w)}`, `가득 채우기 +${q.qty} · ${q.cost}G`, ...(this.game.backend.gold() < q.cost ? ["(골드가 모자라면 살 수 있는 만큼만)"] : [])], "채우기", () => {
          if (this.trader.trade({ kind: "fuel" })) this.trader.flush();
        });
      }
      case "repair": {
        const q = this.trader.repairQuote(), w = this.game.world;
        if (q.why) return this.say(`선체 ${Math.ceil(w.hullHp)}/${HULLS[w.hullLv].hp} · ${q.why}`, 2);
        return this.confirm(p.who, [`선체 ${Math.ceil(w.hullHp)} / ${HULLS[w.hullLv].hp}`, `전부 고치기 +${q.hp} · ${q.cost}G`], "고치기", () => {
          if (this.trader.trade({ kind: "repair" })) {
            this.trader.flush();
            this.fx.burst(this.pc.x, this.pc.y - 20, 14, { colors: ["white", "yellow"], speed: [20, 50], life: [0.4, 0.8] });
          }
        });
      }
      case "gift":
        if (this.trader.giftGiven()) return this.say(`${m?.keeper ?? ""}: "오늘 몫은 벌써 줬다. 내일 또 오렴."`, 2.5);
        if (this.trader.trade({ kind: "gift" })) this.trader.flush();
        return;
      case "talk":
        this.game.engine.modal = new Modal({ title: p.who, lines: p.lines ?? [], buttons: [{ id: "ok", label: "닫기" }], cancel: "ok", onPick: () => void (this.game.engine.modal = null) });
        return;
      case "leave":
        return this.game.toIsland(this.islandId);
    }
  }

  private confirm(title: string, lines: string[], ok: string, then: () => void): void {
    this.game.engine.modal = new Modal({
      title,
      lines,
      buttons: [
        { id: "ok", label: ok },
        { id: "no", label: "그만두기" },
      ],
      cancel: "no",
      onPick: (id) => {
        this.game.engine.modal = null;
        if (id === "ok") then();
      },
    });
  }

  // ── update ─────────────────────────────────────────────────────────────────

  update(dt: number, engine: Engine): void {
    this.t += dt;
    this.fx.update(dt);
    this.game.tick(dt, false);
    if (this.toast && this.t > this.toast.until) this.toast = null;
    if (this.bubble && this.t > this.bubble.until) this.bubble = null;
    if (engine.dev) this.devKeys(engine);
    this.stepWalkers(dt);
    if (this.sub) {
      this.sub.p.update(engine);
      if (this.sub.p.closed) {
        this.sub = null;
        this.trader.flush();
      }
      return;
    }
    if (this.pause) return this.updatePause(engine);
    const input = engine.input;
    if (input.hit("Escape")) return void (this.pause = { sel: 0 });
    if (input.hit("KeyI")) return void (this.sub = { k: "bag", p: new InventoryPanel(this.game) });

    // clicks: the prompt, a person or place (walk there, then use it), or the ground (walk there)
    if (input.clicked) {
      const c = input.clicked;
      const here = this.near();
      if (here && inRect(c, this.promptRect())) return this.use(here);
      const wx = this.cam.x + c.x, wy = this.cam.y + c.y;
      const target = this.poiAt(wx, wy);
      if (target) {
        const r = this.findRoute(target.x, target.y);
        if (r) {
          this.route = r;
          this.goingTo = target;
          if (!r.length) this.use(target);
        }
      } else {
        const [tx, ty] = [Math.floor(wx / TL), Math.floor(wy / TL)];
        const r = this.findRoute(tx, ty) ?? this.nearbyRoute(tx, ty);
        if (r) {
          this.route = r;
          this.goingTo = null;
        }
      }
    } else if (input.pressed) {
      const here = this.near();
      if (here) return this.use(here);
    }

    // walking: keys win over a clicked route
    let vx = 0, vy = 0;
    const a = input.axis();
    if (Math.hypot(a.x, a.y) > 0.1) {
      this.route = [];
      this.goingTo = null;
      vx = a.x;
      vy = a.y;
    } else if (this.route.length) {
      const [tx, ty] = feetAt(...this.route[0]!);
      const dx = tx - this.pc.x, dy = ty - this.pc.y, d = Math.hypot(dx, dy);
      if (d < 1.5) {
        this.route.shift();
        if (!this.route.length && this.goingTo) {
          const g = this.goingTo;
          this.goingTo = null;
          [this.pc.x, this.pc.y] = [tx, ty];
          return this.use(g);
        }
      } else {
        vx = dx / d;
        vy = dy / d;
      }
    }
    this.pc.moving = Math.hypot(vx, vy) > 0.05;
    if (this.pc.moving) {
      this.pc.t += dt;
      this.pc.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      const nx = this.pc.x + vx * SPEED * dt, ny = this.pc.y + vy * SPEED * dt;
      if (!this.blockedAt(nx, this.pc.y)) this.pc.x = nx;
      if (!this.blockedAt(this.pc.x, ny)) this.pc.y = ny;
    } else this.pc.t = 0;

    // a market keeper says their piece the first time you come near
    const m = this.market;
    if (m) {
      for (const p of this.pois) {
        if (!p.npc || !p.services.includes("market") || this.greeted.has(p.npc)) continue;
        const w = this.walkers.find((x) => x.def.id === p.npc);
        if (w && Math.hypot(w.x - this.pc.x, w.y - this.pc.y) < 3 * TL) {
          this.greeted.add(p.npc);
          this.bubble = { npc: p.npc, text: m.line, until: this.t + 4.5 };
        }
      }
    }
    this.cam = this.camera();
  }

  /** A route to the closest reachable tile next to (tx, ty) — clicking a house walks up to it. */
  private nearbyRoute(tx: number, ty: number): [number, number][] | null {
    let best: [number, number][] | null = null;
    for (let r = 1; r <= 2 && !best; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (this.blockedTile(tx + dx, ty + dy)) continue;
          const route = this.findRoute(tx + dx, ty + dy);
          if (route && (!best || route.length < best.length)) best = route;
        }
    return best;
  }

  /** The person or place under a world point (an NPC's body, or the thing a spot stands in front of). */
  private poiAt(wx: number, wy: number): Poi | null {
    for (const p of this.pois) {
      const npc = p.npc ? this.walkers.find((w) => w.def.id === p.npc) : null;
      if (npc && Math.abs(wx - npc.x) <= 8 && wy >= npc.y - 24 && wy <= npc.y) return p;
      const tx = Math.floor(wx / TL), ty = Math.floor(wy / TL);
      if (tx === p.x && ty <= p.y && ty >= p.y - 2) return p;
    }
    return null;
  }

  private stepWalkers(dt: number): void {
    for (const w of this.walkers) {
      w.t += dt;
      const path = w.def.walk;
      if (!path || path.length < 2) continue;
      if (w.wait > 0) {
        w.wait -= dt;
        w.moving = false;
        continue;
      }
      const [tx, ty] = feetAt(...path[w.wp]!);
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
      if (d < 1) {
        w.wp = (w.wp + 1) % path.length;
        w.wait = 0.8 + ((w.wp * 7) % 5) * 0.3;
        continue;
      }
      // step aside for nobody — just wait if the player is in the way
      const nx = w.x + (dx / d) * NPC_SPEED * dt, ny = w.y + (dy / d) * NPC_SPEED * dt;
      if (Math.hypot(nx - this.pc.x, ny - this.pc.y) < 12) {
        w.moving = false;
        continue;
      }
      w.x = nx;
      w.y = ny;
      w.moving = true;
      w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    }
  }

  private pauseItems() {
    const x = 320 - 70, w = 140;
    return [
      { id: "resume", label: "계속하기" },
      { id: "bag", label: "창고 · 장비" },
      { id: "leave", label: "배로 돌아가기" },
      { id: "save", label: "저장" },
      { id: "title", label: "로비로 나가기" },
    ].map((it, i) => ({ ...it, rect: { x, y: 140 + i * 26, w, h: 20 } }));
  }

  private updatePause(engine: Engine): void {
    const input = engine.input;
    const items = this.pauseItems();
    if (input.hit("Escape")) return void (this.pause = null);
    const d = input.hit("ArrowDown") + input.hit("KeyS") - input.hit("ArrowUp") - input.hit("KeyW");
    if (d && this.pause) this.pause.sel = (this.pause.sel + d + items.length * 4) % items.length;
    const hover = items.findIndex((it) => inRect(input.clicked, it.rect));
    const go = input.clicked ? hover : input.pressed ? this.pause!.sel : -1;
    switch (items[go]?.id) {
      case "resume":
        this.pause = null;
        return;
      case "bag":
        this.pause = null;
        this.sub = { k: "bag", p: new InventoryPanel(this.game) };
        return;
      case "leave":
        this.pause = null;
        return this.game.toIsland(this.islandId);
      case "save":
        this.pause = null;
        return void this.game.manualSave();
      case "title":
        this.pause = null;
        return this.game.leave("lobby");
    }
  }

  /** Economy.md §9: 골드 지급 (local saves) and 날짜 바꾸기. */
  private devKeys(engine: Engine): void {
    const input = engine.input;
    if (input.hit("KeyG")) {
      if (this.game.backend.devGrant) {
        this.game.backend.devGrant(500);
        this.say("[dev] +500G");
      } else this.say("[dev] 골드 지급은 로컬 저장에서만 돼요");
    }
    if (input.hit("KeyN")) {
      devShiftDays(1);
      this.say(`[dev] 시세 날짜 → ${kstDate(Date.now())}`);
    }
  }

  private camera(): { x: number; y: number } {
    const W = this.def.w * TL, H = this.def.h * TL;
    return {
      x: Math.round(Math.max(0, Math.min(W - VIEW_W, this.pc.x - VIEW_W / 2))),
      y: Math.round(Math.max(0, Math.min(H - VIEW_H, this.pc.y - 8 - VIEW_H / 2))),
    };
  }

  private promptRect() {
    const p = this.near();
    const s = p ? `Space · ${p.who}` : "";
    const w = Math.max(PROMPT_BTN.w, s.length * 8 + 40);
    return { ...PROMPT_BTN, x: 320 - w / 2, w };
  }

  // ── render ─────────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets;
    const shake = this.fx.offset();
    const cam = { x: this.cam.x + shake.x, y: this.cam.y + shake.y };
    ctx.fillStyle = lutHex("jade3");
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.ground) {
      ctx.drawImage(this.ground.ground, -cam.x, -cam.y);
      // the water laps at the shore: two foam rings fading in turn
      const k = (Math.sin(this.t * 1.7) + 1) / 2;
      ctx.globalAlpha = 0.2 + 0.8 * k;
      ctx.drawImage(this.ground.foamIn, -cam.x, -cam.y);
      ctx.globalAlpha = 0.1 + 0.7 * (1 - k);
      ctx.drawImage(this.ground.foamOut, -cam.x, -cam.y);
      ctx.globalAlpha = 1;
    }
    this.drawWaterGlints(ctx, cam);
    this.drawShadows(ctx, cam);

    // everything that stands, back to front
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    for (const p of this.def.props) {
      const name = p.anim ? p.anim[Math.floor(this.t * 4) % p.anim.length]! : p.sprite;
      if (!assets.has("town", name)) continue;
      const f = assets.frame("town", name);
      const [cx, bottom] = anchorOf(p);
      list.push({ y: bottom, draw: () => assets.draw(ctx, "town", name, Math.round(cx - f.w / 2 - cam.x), Math.round(bottom - f.h - cam.y)) });
    }
    for (const w of this.walkers) {
      // a keeper behind a counter stands on a crate, so even the children show over it
      const [tx, ty] = tileOf(w.x, w.y);
      const lift = this.solid[ty * this.def.w + tx] ? 4 : 0;
      list.push({ y: w.y, draw: () => this.drawPerson(ctx, w.def.look, w.x, w.y - lift, w.dir, w.moving ? w.t : 0, cam) });
    }
    list.push({ y: this.pc.y, draw: () => this.drawPerson(ctx, "pc", this.pc.x, this.pc.y, this.pc.dir, this.pc.moving ? this.pc.t : 0, cam) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    this.drawMarkers(ctx, cam);
    drawDayTint(ctx, this.game.clock);
    if (isNight(this.game.clock)) this.drawLights(ctx, cam);
    this.drawLabels(ctx, cam);
    this.fx.draw(ctx, cam.x, cam.y);
    this.drawHud(ctx, engine);

    if (this.sub) this.sub.p.render(ctx, engine);
    if (this.pause) {
      dim(ctx, 0.5);
      panel(ctx, assets, "panel_wood", 320 - 90, 110, 180, 168);
      text(ctx, "마을", 320, 122, { align: "center", color: lutHex("bark1"), shadow: null, font: "bold 12px Galmuri11, monospace" });
      this.pauseItems().forEach((it, i) => button(ctx, assets, i === this.pause!.sel ? "hover" : "normal", it.label, it.rect.x, it.rect.y, it.rect.w, it.rect.h));
    }
    if (this.toast) {
      const tw = Math.min(620, Math.max(160, textWidth(ctx, this.toast.text) + 28));
      const ty = this.sub ? 2 : 40;
      panel(ctx, assets, "panel_sea", 320 - tw / 2, ty, tw, 22);
      text(ctx, this.toast.text, 320, ty + 5, { align: "center", color: this.toast.color, maxW: tw - 20 });
    }
    this.fx.drawScreen(ctx);
    this.game.drawFlash(ctx, assets);
  }

  private drawPerson(ctx: CanvasRenderingContext2D, look: string, x: number, y: number, dir: Facing, t: number, cam: { x: number; y: number }): void {
    const frame = t > 0 ? [1, 0, 2, 0][Math.floor(t * 8) % 4]! : 0;
    // a soft shadow under the feet
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = lutHex("ink");
    ctx.fillRect(Math.round(x - 5 - cam.x), Math.round(y - 2 - cam.y), 10, 2);
    ctx.fillRect(Math.round(x - 4 - cam.x), Math.round(y - 3 - cam.y), 8, 1);
    ctx.globalAlpha = 1;
    this.engine.assets.draw(ctx, "town", `p_${look}_${dir}_${frame}`, Math.round(x - 8 - cam.x), Math.round(y - 22 - cam.y));
  }

  /** Every building, tree and prop casts a soft shadow, leaning back and to the right (the
   *  light comes from the front-left): its own silhouette, flattened onto the ground. */
  private drawShadows(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    const assets = this.engine.assets, ink = lutHex("ink");
    ctx.save();
    ctx.globalAlpha = 0.27;
    for (const p of this.def.props) {
      if (p.sprite === "o_rowboat" || p.sprite === "o_flowers") continue; // lying flat already
      const name = p.anim ? p.anim[0]! : p.sprite;
      if (!assets.has("town", name)) continue;
      const f = assets.frame("town", name);
      const [cx, bottom] = anchorOf(p);
      ctx.save();
      ctx.translate(Math.round(cx - cam.x), Math.round(bottom - cam.y));
      ctx.transform(1, 0, -0.55, 0.32, 0, 0);
      assets.drawSilhouette(ctx, "town", name, -Math.round(f.w / 2), -f.h, ink);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Little glints drifting on the water. */
  private drawWaterGlints(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    ctx.fillStyle = lutHex("white");
    const tx0 = Math.floor(cam.x / TL), ty0 = Math.floor(cam.y / TL);
    for (let ty = ty0; ty <= ty0 + VIEW_H / TL + 1; ty++)
      for (let tx = tx0; tx <= tx0 + VIEW_W / TL + 1; tx++) {
        if (this.def.ground[ty]?.[tx] !== "~") continue;
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        const phase = (this.t * 0.6 + (h % 997) / 140) % 3;
        if (phase > 0.45) continue;
        ctx.fillRect(tx * TL + (h % 11) - cam.x + Math.floor(phase * 4), ty * TL + ((h >> 4) % 13) - cam.y, phase < 0.22 ? 2 : 1, 1);
      }
  }

  /** A bobbing marker over whoever you can talk to here; the spot glows under your feet. */
  private drawMarkers(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    const here = this.near();
    for (const p of this.pois) {
      const npc = p.npc ? this.walkers.find((w) => w.def.id === p.npc) : null;
      const [sx, sy] = npc ? [npc.x, npc.y - 30] : feetAt(p.x, p.y - 2);
      if (p === here || (!npc && p.services[0] !== "talk" && p.services[0] !== "leave")) {
        const bob = Math.round(Math.sin(this.t * 5) * 1.5);
        const x = Math.round(sx - cam.x), y = Math.round(sy - cam.y + bob - (npc ? 0 : 6));
        ctx.fillStyle = lutHex("ink");
        ctx.fillRect(x - 3, y - 1, 7, 3);
        ctx.fillRect(x - 2, y + 2, 5, 1);
        ctx.fillRect(x - 1, y + 3, 3, 1);
        ctx.fillStyle = lutHex(p === here ? "yellow" : "white");
        ctx.fillRect(x - 2, y, 5, 1);
        ctx.fillRect(x - 1, y + 1, 3, 1);
        ctx.fillRect(x, y + 2, 1, 1);
      }
    }
    if (here) {
      const [fx, fy] = feetAt(here.x, here.y);
      ctx.strokeStyle = lutHex("yellow");
      ctx.globalAlpha = 0.6 + Math.sin(this.t * 6) * 0.3;
      ctx.strokeRect(Math.round(fx - 7 - cam.x) + 0.5, Math.round(fy - 9 - cam.y) + 0.5, 14, 10);
      ctx.globalAlpha = 1;
    }
  }

  /** Lamps glow at night. */
  private drawLights(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.def.props) {
      if (!p.light) continue;
      const [cx, bottom] = anchorOf(p);
      const x = cx - cam.x, y = bottom - 22 - cam.y;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 34);
      g.addColorStop(0, "rgba(255, 214, 120, 0.55)");
      g.addColorStop(1, "rgba(255, 214, 120, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 34, y - 34, 68, 68);
    }
    ctx.restore();
  }

  /** The name of whoever you'd talk to (or the nearest person), and what a keeper says. */
  private drawLabels(ctx: CanvasRenderingContext2D, cam: { x: number; y: number }): void {
    const here = this.near();
    let who = here?.npc ? this.walkers.find((w) => w.def.id === here.npc) : undefined;
    if (!who) {
      let bd = 2.4 * TL;
      for (const w of this.walkers) {
        const d = Math.hypot(w.x - this.pc.x, w.y - this.pc.y);
        if (d < bd) (bd = d), (who = w);
      }
    }
    if (who && this.bubble?.npc !== who.def.id) text(ctx, who.def.name, who.x - cam.x, who.y - 40 - cam.y, { align: "center", color: lutHex("white") });
    if (this.bubble) {
      const w = this.walkers.find((x) => x.def.id === this.bubble!.npc);
      if (w) {
        const s = this.bubble.text;
        const bw = Math.min(300, textWidth(ctx, s) + 16);
        const x = Math.round(Math.max(4, Math.min(VIEW_W - bw - 4, w.x - cam.x - bw / 2))), y = Math.round(w.y - 66 - cam.y);
        panel(ctx, this.engine.assets, "panel_paper", x, y, bw, 22);
        text(ctx, s, x + bw / 2, y + 5, { align: "center", color: lutHex("ink"), shadow: null, maxW: bw - 12 });
      }
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, engine: Engine): void {
    const assets = engine.assets, w = this.game.world, be = this.game.backend;
    const bait = Object.entries(be.inventory()).reduce((n, [id, q]) => n + (ITEMS[id as ItemId]?.kind === "bait" ? (q ?? 0) : 0), 0);
    const s = `${be.gold().toLocaleString("ko-KR")}G · 창고 ${be.hold().length}/${holdCap(w.holdLv)} · 연료 ${Math.ceil(w.fuel)}/${fuelMax(w)} · 선체 ${Math.ceil(w.hullHp)}/${HULLS[w.hullLv].hp} · 미끼 ${bait}`;
    const tw = textWidth(ctx, s) + 20;
    panel(ctx, assets, "panel_sea", 8, 8, tw, 22);
    text(ctx, s, 18, 13);
    const isl = ISLAND_BY_ID[this.islandId]!;
    text(ctx, `${isl.name} 마을 · ${w.day}일차 ${this.game.clock.label()}`, 632, 13, { align: "right", color: lutHex("white") });
    const here = this.near();
    if (here && !this.sub && !this.pause && !engine.modal) {
      const r = this.promptRect();
      button(ctx, assets, "hover", `Space · ${here.who}`, r.x, r.y, r.w, r.h);
    } else if (!this.sub && !this.pause) {
      text(ctx, "방향키·클릭 이동 · Space 말 걸기 · I 창고 · Esc 메뉴", 320, 324, { align: "center", color: lutHex("foam2") });
    }
    this.game.drawSaveLabel(ctx, assets, 8, 344);
  }
}

function footTiles(p: Prop): [number, number][] {
  if (!p.foot) return [];
  const [w, h] = p.foot;
  const x0 = p.x - Math.floor(w / 2);
  const out: [number, number][] = [];
  for (let y = p.y - h + 1; y <= p.y; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y]);
  return out;
}

/** Bottom-center of a prop in world px. */
function anchorOf(p: Prop): [number, number] {
  const w = p.foot?.[0] ?? 1;
  const x0 = p.x - Math.floor(w / 2);
  return [(x0 + w / 2) * TL, (p.y + 1) * TL];
}

function faceToward(x: number, y: number, tx: number, ty: number): Facing {
  const dx = tx - x, dy = ty - y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

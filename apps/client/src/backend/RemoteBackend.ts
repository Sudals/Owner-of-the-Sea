import type { CastRecord, FishingSession, GameBackend, Gear, HoldItem, Profile, SaveOutcome, SaveReason, SaveStatus, SessionSpot, WorldState } from "@sea/game";
import type { AuthResponse, HoldItemDto, OpenSessionResponse, SaveRequest, SaveResponse, WorldDto } from "@sea/shared";
import { journalStore, tokenStore, type KeyValueStore } from "./stores";

// Full-build backend (design §7, §11): the server decides, but is called rarely.
//   · fishing: POST /api/session/open gives the seed; casts are rolled and played locally
//   · everything since the last save sits in a local journal (Electron: userData, browser:
//     localStorage) — it survives a crash and is offered back on the next start (§11-5)
//   · commit = POST /api/save with the whole journal in one call; the reply's confirmed state
//     replaces ours (§11-3). A batch keeps its batchId until answered, so a retry is applied once.

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

type Sess = OpenSessionResponse & { savedIndex: number; openedAt: number; closed: boolean };

type Journal = {
  v: 1;
  profile: Profile | null;
  /** Last state the server confirmed. */
  base: { world: WorldState; hold: HoldItem[]; gear: Gear } | null;
  /** Live state (the game mutates `world` in place). */
  world: WorldState | null;
  hold: HoldItem[];
  sessions: Record<string, Sess>; // by sessionId
  /** Casts not yet saved, by sessionId. */
  pending: Record<string, CastRecord[]>;
  dirty: boolean;
  /** A save that was sent but never answered — resent first, same batchId. */
  inflight: SaveRequest | null;
  lastSavedAt: number | null;
};

const freshJournal = (): Journal => ({ v: 1, profile: null, base: null, world: null, hold: [], sessions: {}, pending: {}, dirty: false, inflight: null, lastSavedAt: null });

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
const OFFLINE = "서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.";

const toWorld = (w: WorldDto): WorldState => ({ ...w, hullLv: w.hullLv as WorldState["hullLv"] });
const toHold = (h: HoldItemDto[]): HoldItem[] => h.map((x) => ({ ...x }));

export class RemoteBackend implements GameBackend {
  private j: Journal;
  private worldVersion = 0;

  private constructor(
    private readonly apiBase: string,
    private readonly tokens: KeyValueStore,
    private readonly journal: KeyValueStore,
    private token: string | null,
    saved: Journal | null,
  ) {
    this.j = saved ?? freshJournal();
  }

  static async create(apiBase: string): Promise<RemoteBackend> {
    const tokens = tokenStore(), journal = journalStore();
    const [token, raw] = await Promise.all([tokens.get(), journal.get()]);
    let saved: Journal | null = null;
    try {
      saved = raw ? (JSON.parse(raw) as Journal) : null;
    } catch {
      saved = null;
    }
    const b = new RemoteBackend(apiBase.replace(/\/$/, ""), tokens, journal, token, saved?.v === 1 ? saved : null);
    if (token) await b.refresh().catch((e) => console.warn("[remote] start offline", e));
    return b;
  }

  // ── profile ──

  profile(): Profile | null {
    return this.token ? this.j.profile : null;
  }

  async startNew(name: string): Promise<Profile> {
    const r = await this.api<AuthResponse>("POST", "/auth/start", { name });
    await this.signedIn(r, r.recoveryCode ?? null);
    return this.j.profile!;
  }

  async recover(code: string): Promise<Profile> {
    const r = await this.api<AuthResponse>("POST", "/auth/recover", { code });
    await this.signedIn(r, code);
    return this.j.profile!;
  }

  async resume(): Promise<Profile> {
    if (!this.token || !this.j.profile) throw new Error("이 기기에 저장된 기록이 없어요.");
    try {
      await this.refresh();
    } catch (e) {
      // offline: carry on from the journal if it has a world
      if (!(e instanceof ApiError) && this.j.world) console.warn("[remote] resume offline");
      else throw e;
    }
    this.j.profile.lastPlayedAt = new Date().toISOString();
    this.persist();
    return this.j.profile;
  }

  async forget(): Promise<void> {
    if (this.token) await this.api("POST", "/auth/logout").catch(() => undefined);
    this.token = null;
    this.j = freshJournal();
    await Promise.all([this.tokens.clear(), this.journal.clear()]);
  }

  private async signedIn(r: AuthResponse, recoveryCode: string | null): Promise<void> {
    this.token = r.token;
    await this.tokens.set(r.token);
    const now = new Date().toISOString();
    this.j = freshJournal();
    this.j.profile = { name: r.account.name, createdAt: r.account.createdAt, lastPlayedAt: now, recoveryCode };
    await this.refresh();
  }

  /** GET /api/me → the confirmed state. Unsaved local progress is kept (it may be recovered). */
  private async refresh(): Promise<void> {
    type Me = { account: { name: string; createdAt: string }; world: WorldDto; hold: HoldItemDto[]; gear: Gear };
    let me: Me;
    try {
      me = await this.api<Me>("GET", "/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // the device token is gone (expired / forgotten elsewhere): this device has no save now
        this.token = null;
        await this.tokens.clear();
      }
      throw e;
    }
    const prev = this.j.profile;
    this.j.profile = { name: me.account.name, createdAt: me.account.createdAt, lastPlayedAt: prev?.lastPlayedAt ?? new Date().toISOString(), recoveryCode: prev?.recoveryCode ?? null };
    this.j.base = { world: toWorld(me.world), hold: toHold(me.hold), gear: me.gear };
    if (!this.hasUnsaved()) {
      this.j.world = structuredClone(this.j.base.world);
      this.j.hold = structuredClone(this.j.base.hold);
    }
    this.persist();
  }

  // ── fishing ──

  async openSession(spot: SessionSpot): Promise<FishingSession> {
    const now = Date.now();
    const mine = Object.values(this.j.sessions)
      .filter((s) => s.spotId === spot.spotId && now - s.openedAt < SESSION_TTL_MS)
      .sort((a, b) => b.openedAt - a.openedAt)[0];
    if (mine) {
      // left and came back before the next save: the server still has it open — same seed
      mine.closed = false;
      this.persist();
      return this.toFishing(mine);
    }
    const r = await this.api<OpenSessionResponse>("POST", "/session/open", { spotId: spot.spotId, at: spot.at, clockH: spot.clockH });
    const known = this.j.sessions[r.sessionId];
    const s: Sess = { ...r, savedIndex: r.nextIndex, nextIndex: Math.max(r.nextIndex, known?.nextIndex ?? 0), openedAt: now, closed: false };
    this.j.sessions[r.sessionId] = s;
    this.persist();
    return this.toFishing(s);
  }

  private toFishing(s: Sess): FishingSession {
    return { sessionId: s.sessionId, seed: s.seed, spotId: s.spotId, nextIndex: s.nextIndex, omenFrom: s.omenFrom, conds: s.conds };
  }

  recordCast(sessionId: string, cast: CastRecord): void {
    const s = this.j.sessions[sessionId];
    if (!s) return;
    s.nextIndex = Math.max(s.nextIndex, cast.i + 1);
    (this.j.pending[sessionId] ??= []).push(cast);
    if (cast.result === "caught")
      this.j.hold.push({ id: `${sessionId}:${cast.i}`, fishId: cast.fishId, sizeCm: cast.sizeCm, spotId: s.spotId, caughtAt: new Date(cast.t).toISOString(), freshAt: cast.seaT });
    this.persist();
  }

  closeSession(sessionId: string): void {
    const s = this.j.sessions[sessionId];
    if (!s) return;
    s.closed = true;
    this.persist();
  }

  gear(): Gear {
    return this.j.base?.gear ?? { rodLv: 1, lineLv: 1 };
  }

  hold(): HoldItem[] {
    return this.j.hold;
  }

  dropHold(indices: number[]): void {
    const drop = new Set(indices);
    this.j.hold = this.j.hold.filter((_, i) => !drop.has(i));
    this.j.dirty = true;
    this.persist();
  }

  world(): WorldState {
    if (!this.j.world) this.j.world = this.j.base ? structuredClone(this.j.base.world) : fallbackWorld();
    return this.j.world;
  }

  saveWorld(w: WorldState): void {
    this.j.world = w;
    this.j.dirty = true;
    this.worldVersion++;
    this.persist();
  }

  // ── saving ──

  saveStatus(): SaveStatus {
    const unsavedCaught = Object.values(this.j.pending).reduce((n, cs) => n + cs.filter((c) => c.result === "caught").length, 0);
    return { lastSavedAt: this.j.lastSavedAt, unsavedCaught, dirty: this.j.dirty || this.hasPendingCasts() || !!this.j.inflight };
  }

  pendingRecovery(): boolean {
    return !!this.token && this.hasUnsaved();
  }

  discardUnsaved(): void {
    this.j.pending = {};
    this.j.inflight = null;
    for (const s of Object.values(this.j.sessions)) {
      s.nextIndex = s.savedIndex;
      s.closed = false;
    }
    if (this.j.base) {
      if (this.j.world) Object.assign(this.j.world, structuredClone(this.j.base.world));
      else this.j.world = structuredClone(this.j.base.world);
      this.j.hold = structuredClone(this.j.base.hold);
    }
    this.j.dirty = false;
    this.persist();
  }

  async commit(reason: SaveReason): Promise<SaveOutcome> {
    if (!this.token) return { ok: false, message: "이 기기에 저장된 기록이 없어요." };
    // a save that never got its answer goes first: same batchId, so the server applies it once
    if (this.j.inflight) {
      const r = await this.send(this.j.inflight, -1);
      if (!r.ok) return r;
    }
    const version = this.worldVersion;
    const body = this.batch(reason);
    if (!body) return { ok: true, message: "이미 저장되어 있어요" };
    this.j.inflight = body;
    this.persist();
    return this.send(body, version);
  }

  private batch(reason: SaveReason): SaveRequest | null {
    const sessions = Object.values(this.j.sessions)
      .filter((s) => (this.j.pending[s.sessionId]?.length ?? 0) > 0 || s.closed)
      .map((s) => ({ sessionId: s.sessionId, sig: s.sig, casts: [...(this.j.pending[s.sessionId] ?? [])], closed: s.closed }));
    if (!sessions.length && !this.j.dirty) return null;
    const w = this.world();
    return {
      batchId: crypto.randomUUID(),
      reason,
      sessions,
      world: { at: w.at, hullHp: w.hullHp, fuel: w.fuel, day: w.day, hour: w.hour, seaTime: w.seaTime, chart: w.chart },
      holdIds: this.j.hold.map((h) => h.id).filter((x): x is string => !!x),
    };
  }

  /** POST /api/save and fold the reply in. `version` = world version the batch was built from (-1: unknown). */
  private async send(body: SaveRequest, version: number): Promise<SaveOutcome> {
    let res: SaveResponse;
    try {
      res = await this.api<SaveResponse>("POST", "/save", body);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500 && e.status !== 401) this.j.inflight = null; // a malformed batch never succeeds
      this.persist();
      return { ok: false, message: e instanceof ApiError ? `저장 실패 — ${e.message}` : "저장 실패 — 연결되면 다시 시도해 주세요" };
    }
    this.apply(res, body, version);
    const caught = res.applied.caught, bad = res.rejected.length;
    return {
      ok: true,
      caught,
      rejected: bad,
      message: `저장했다${caught ? ` · 물고기 ${caught}마리 기록` : ""}${bad ? ` · 맞지 않는 기록 ${bad}건 제외` : ""}`,
    };
  }

  private apply(res: SaveResponse, body: SaveRequest, version: number): void {
    // casts this batch carried are settled (accepted or rejected); later ones stay pending
    for (const s of body.sessions) {
      const sent = new Set(s.casts.map((c) => c.i));
      const left = (this.j.pending[s.sessionId] ?? []).filter((c) => !sent.has(c.i));
      if (left.length) this.j.pending[s.sessionId] = left;
      else delete this.j.pending[s.sessionId];
    }
    for (const r of res.sessions) {
      const s = this.j.sessions[r.sessionId];
      if (!s) continue;
      if (r.closed && !this.j.pending[r.sessionId]) {
        delete this.j.sessions[r.sessionId];
        continue;
      }
      s.savedIndex = r.nextIndex;
      const later = this.j.pending[r.sessionId]?.map((c) => c.i + 1) ?? [];
      s.nextIndex = Math.max(r.nextIndex, ...later);
    }
    const confirmed = toWorld(res.world);
    this.j.base = { world: confirmed, hold: toHold(res.hold), gear: res.gear };
    const w = this.world();
    if (version === this.worldVersion) Object.assign(w, structuredClone(confirmed));
    else Object.assign(w, { hullLv: confirmed.hullLv, fuelTank: confirmed.fuelTank, lantern: confirmed.lantern, iceLv: confirmed.iceLv });
    // hold = confirmed + catches recorded after this batch was built
    const unsent = new Set(Object.entries(this.j.pending).flatMap(([sid, cs]) => cs.filter((c) => c.result === "caught").map((c) => `${sid}:${c.i}`)));
    this.j.hold = [...toHold(res.hold), ...this.j.hold.filter((h) => h.id && unsent.has(h.id))];
    this.j.dirty = version !== this.worldVersion;
    this.j.inflight = null;
    this.j.lastSavedAt = Date.now();
    this.persist();
  }

  private hasPendingCasts(): boolean {
    return Object.values(this.j.pending).some((cs) => cs.length > 0);
  }

  private hasUnsaved(): boolean {
    return this.j.dirty || this.hasPendingCasts() || !!this.j.inflight;
  }

  private persist(): void {
    void this.journal.set(JSON.stringify(this.j)).catch((e) => console.warn("[remote] journal", e));
  }

  private async api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.apiBase}${path}`, {
        method,
        signal: ctrl.signal,
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(OFFLINE);
    } finally {
      clearTimeout(timer);
    }
    const json = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    if (!res.ok) throw new ApiError(json?.error?.message ?? `서버 오류 (${res.status})`, res.status, json?.error?.code);
    return json as T;
  }
}

/** Only used if the server state never arrived (offline first start) — same as a new player. */
function fallbackWorld(): WorldState {
  return { at: { kind: "island", id: "red_lighthouse" }, hullLv: 1, hullHp: 100, fuel: 100, fuelTank: false, lantern: false, iceLv: 0, day: 1, hour: 9, seaTime: 0, chart: "" };
}

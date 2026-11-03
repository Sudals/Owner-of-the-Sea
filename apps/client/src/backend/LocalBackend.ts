import type { CastRecord, FishingSession, GameBackend, Gear, HoldItem, Profile } from "@sea/game";
import { newSeedHex } from "@sea/shared";

// Demo-build backend (design §2, §7, §11-5): everything in localStorage, seeds made locally.
// The player is just a name kept in this browser (design §5) — no server, no 이어하기 코드.
// Session rules mirror the server (§11-3, §11-4):
//   · leaving a point closes its session → a fresh seed next time
//   · a session older than 2 h is replaced
//   · quitting without leaving (reload, crash) resumes the same seed at the next cast index
// The full build swaps this for RemoteBackend (M4) with the same interface.

const KEY = "sea.local.v1";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

type StoredSession = FishingSession & { createdAt: number; closed: boolean };
type Store = {
  profile: Profile | null;
  sessions: Record<string, StoredSession>; // by spotId
  journal: { sessionId: string; cast: CastRecord }[];
  hold: HoldItem[];
  gear: Gear;
};

const fresh = (): Store => ({ profile: null, sessions: {}, journal: [], hold: [], gear: { rodLv: 1, lineLv: 1 } });

export class LocalBackend implements GameBackend {
  private store: Store;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.store = this.load();
  }

  async openSession(spotId: string): Promise<FishingSession> {
    const now = Date.now();
    const open = this.store.sessions[spotId];
    if (open && !open.closed && now - open.createdAt < SESSION_TTL_MS) return toSession(open);
    const s: StoredSession = { sessionId: crypto.randomUUID(), seed: newSeedHex(), spotId, nextIndex: 0, omenFrom: null, createdAt: now, closed: false };
    this.store.sessions[spotId] = s;
    this.save();
    return toSession(s);
  }

  recordCast(sessionId: string, cast: CastRecord): void {
    const s = Object.values(this.store.sessions).find((x) => x.sessionId === sessionId);
    if (!s) return;
    s.nextIndex = Math.max(s.nextIndex, cast.i + 1);
    this.store.journal.push({ sessionId, cast });
    if (cast.result === "caught") this.store.hold.push({ fishId: cast.fishId, sizeCm: cast.sizeCm, spotId: s.spotId, caughtAt: new Date(cast.t).toISOString() });
    this.save();
  }

  closeSession(sessionId: string): void {
    const s = Object.values(this.store.sessions).find((x) => x.sessionId === sessionId);
    if (!s) return;
    s.closed = true;
    this.save();
  }

  gear(): Gear {
    return this.store.gear;
  }

  hold(): HoldItem[] {
    return this.store.hold;
  }

  profile(): Profile | null {
    return this.store.profile;
  }

  /** 새 게임 wipes this browser's save and starts over under `name`. */
  async startNew(name: string): Promise<Profile> {
    const now = new Date().toISOString();
    this.store = { ...fresh(), profile: { name, createdAt: now, lastPlayedAt: now } };
    this.save();
    return this.store.profile!;
  }

  async resume(): Promise<Profile> {
    const p = this.store.profile;
    if (!p) throw new Error("이 기기에 저장된 기록이 없어요.");
    p.lastPlayedAt = new Date().toISOString();
    this.save();
    return p;
  }

  async forget(): Promise<void> {
    this.reset();
  }

  /** Dev helper: wipe local progress. */
  reset(): void {
    this.store = fresh();
    this.save();
  }

  private load(): Store {
    try {
      const raw = this.storage?.getItem(KEY);
      return raw ? { ...fresh(), ...(JSON.parse(raw) as Partial<Store>) } : fresh();
    } catch {
      return fresh();
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.store));
    } catch {
      // private mode / quota: keep playing in memory
    }
  }
}

function toSession(s: StoredSession): FishingSession {
  return { sessionId: s.sessionId, seed: s.seed, spotId: s.spotId, nextIndex: s.nextIndex, omenFrom: s.omenFrom };
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Where the full build keeps its device token and its unsaved journal (design §5-1, §11-5).
//   Electron: the preload's `window.desktop` — token encrypted with safeStorage, journal in userData
//   Browser (dev / web full build): localStorage

export type DesktopApi = {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  readJournal(): Promise<string | null>;
  writeJournal(data: string): Promise<void>;
  getVersion(): Promise<string>;
  setFullscreen(on: boolean): Promise<void>;
  quit(): void;
  /** The window's close button: the game decides (save dialog) and then calls quit(). */
  onCloseRequest(cb: () => void): void;
};

export const desktop = (): DesktopApi | null => (window as unknown as { desktop?: DesktopApi }).desktop ?? null;

export interface KeyValueStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

function local(key: string): KeyValueStore {
  return {
    async get() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async set(v) {
      try {
        localStorage.setItem(key, v);
      } catch {
        // storage blocked: keep going in memory
      }
    },
    async clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export function tokenStore(): KeyValueStore {
  const d = desktop();
  if (!d) return local("sea.token.v1");
  return { get: () => d.getToken(), set: (t) => d.setToken(t), clear: () => d.clearToken() };
}

export function journalStore(): KeyValueStore {
  const d = desktop();
  if (!d) return local("sea.journal.v1");
  return { get: () => d.readJournal(), set: (s) => d.writeJournal(s), clear: () => d.writeJournal("") };
}

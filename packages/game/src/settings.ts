// Player settings (design §11-6: 로컬 전용). Stored in this browser / app profile only and never
// sent to the server. Audio levels are kept now and applied once sound lands (M11).

const KEY = "sea.settings.v1";

export type DisplayMode = "fit" | "sharp";
export type SettingsData = {
  /** 0–10 */
  bgm: number;
  /** 0–10 */
  sfx: number;
  /** 화면: fill the window (fit) or whole multiples only (sharp). */
  display: DisplayMode;
};

const DEFAULTS: SettingsData = { bgm: 7, sfx: 7, display: "fit" };

export class Settings {
  data: SettingsData;

  constructor(private readonly storage: Storage | null = localStorageOrNull()) {
    this.data = { ...DEFAULTS };
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SettingsData>;
        for (const k of ["bgm", "sfx"] as const) {
          const v = saved[k];
          if (typeof v === "number" && Number.isFinite(v)) this.data[k] = clampLevel(v);
        }
        if (saved.display === "fit" || saved.display === "sharp") this.data.display = saved.display;
      }
    } catch {
      // unreadable settings fall back to defaults
    }
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = (typeof value === "number" ? clampLevel(value) : value) as SettingsData[K];
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // private mode / blocked storage: keep the value for this run only
    }
  }

  get fullscreen(): boolean {
    return typeof document !== "undefined" && !!document.fullscreenElement;
  }

  /** Must be called from an input handler's step (browsers want a user gesture). */
  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // refused (no gesture, iframe without permission) — nothing to do
    }
  }
}

const clampLevel = (v: number) => Math.max(0, Math.min(10, Math.round(v)));

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

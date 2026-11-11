import type { Settings } from "../settings";
import { musicChain, SongPlayer } from "./player";
import type { SongId } from "./score";
import { SONGS } from "./songs";

// The game's sound out (design §1: WebAudio로 합성; §11-6 settings). Every scene says which song
// fits it (Scene.music); this plays it, crossfading when the song changes, with the 배경음 level
// from 설정. Browsers only let sound start after the player touches a key or the mouse: the first
// one resumes the context. A hidden tab or a minimized window goes quiet.

/** What a scene wants to hear: a song, and how much of its tension layer (fishing: a fish on). */
export type MusicCue = { song: SongId; tension?: number };

const LOOKAHEAD = 0.35; // s of notes scheduled ahead
const TICK_MS = 60;

export class AudioOut {
  private ctx: AudioContext | null = null;
  private chain: ReturnType<typeof musicChain> | null = null;
  private player: SongPlayer | null = null;
  private fading: SongPlayer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private level = -1;
  private night = false;
  private tension = 0;
  private hidden = false;
  private failed = false;

  constructor(private readonly settings: Settings) {
    if (typeof window === "undefined") return;
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, this.unlock, { capture: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** For tests and the dev overlay. */
  get state(): { song: SongId | null; tension: number; level: number; running: boolean; night: boolean } {
    return { song: this.player?.song.id ?? null, tension: this.tension, level: this.level, running: this.ctx?.state === "running", night: this.night };
  }

  /** Every frame: the scene's cue, and whether it's night out (the music goes softer). */
  update(cue: MusicCue | null, night: boolean): void {
    if (!this.ensure()) return;
    const ctx = this.ctx!, now = ctx.currentTime, chain = this.chain!;
    const level = this.settings.data.bgm;
    if (level !== this.level) {
      this.level = level;
      // 0–10 → gain, on a curve that sounds even
      chain.volume.gain.setTargetAtTime(level <= 0 ? 0 : 0.85 * (level / 10) ** 1.7, now, 0.08);
    }
    if (night !== this.night) {
      this.night = night;
      chain.night.frequency.setTargetAtTime(night ? 2400 : 18000, now, 1.2);
    }
    if ((cue?.song ?? null) !== (this.player?.song.id ?? null)) {
      if (this.player) {
        this.player.fadeOut(now);
        this.fading.push(this.player);
      }
      this.player = cue ? new SongPlayer(ctx, SONGS[cue.song], chain.input, now + 0.05, this.fading.length ? 1.8 : 1.2) : null;
      this.tension = 0;
    }
    const t = cue?.tension ?? 0;
    if (this.player && t !== this.tension) {
      this.tension = t;
      this.player.setLayer(t, now);
    }
  }

  /** Render a song offline (tests; previews). Returns the left/right samples. */
  async render(id: SongId, seconds: number, tensionLevel = 0): Promise<{ sampleRate: number; left: Float32Array; right: Float32Array }> {
    const ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    const chain = musicChain(ctx, ctx.destination);
    chain.volume.gain.value = 0.85 * 0.7 ** 1.7; // the default 배경음 level (7)
    const p = new SongPlayer(ctx, SONGS[id], chain.input, 0, 0.01);
    p.setLayer(tensionLevel, 0);
    p.schedule(seconds);
    const buf = await ctx.startRendering();
    return { sampleRate: buf.sampleRate, left: buf.getChannelData(0), right: buf.getChannelData(1) };
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== "undefined") {
      for (const ev of ["pointerdown", "keydown", "touchend"]) window.removeEventListener(ev, this.unlock, { capture: true });
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  /** The context, made on first use (it may start suspended until the player's first input). */
  private ensure(): boolean {
    if (this.ctx) return true;
    if (this.failed || typeof AudioContext === "undefined") return false;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.failed = true;
      return false;
    }
    this.chain = musicChain(this.ctx, this.ctx.destination);
    this.timer = setInterval(() => this.pump(), TICK_MS);
    return true;
  }

  /** Keep the notes coming; drop songs that have faded out. */
  private pump(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const until = ctx.currentTime + LOOKAHEAD;
    this.player?.schedule(until);
    for (const f of this.fading) f.schedule(Math.min(until, f.doneAt));
    this.fading = this.fading.filter((f) => {
      if (ctx.currentTime < f.doneAt) return true;
      f.disconnect();
      return false;
    });
  }

  private readonly unlock = (): void => {
    if (this.hidden) return;
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
  };

  private readonly onVisibility = (): void => {
    this.hidden = document.visibilityState === "hidden";
    if (!this.ctx) return;
    if (this.hidden) void this.ctx.suspend().catch(() => undefined);
    else void this.ctx.resume().catch(() => undefined);
  };
}

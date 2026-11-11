import { hz, STEPS_PER_BAR, type Ev, type Song } from "./score";
import { ambience, DRUM_PITCH, INSTRUMENTS } from "./synth";

// Plays one song on a context: notes are scheduled a little ahead of the clock (a lookahead
// scheduler), so timing stays tight however the frames fall. A song fades in when it starts and
// out when another takes over; its "tension" layer has its own fader.

type Lane = { track: Song["tracks"][number]; out: AudioNode; byStep: Map<number, Ev[]> };

export class SongPlayer {
  /** The song's own fader (crossfades). */
  readonly bus: GainNode;
  private readonly lanes: Lane[] = [];
  private readonly layer: GainNode;
  private readonly stopAmb: ((at: number) => void)[] = [];
  private readonly step: number;
  private next = 0;
  /** Context time this player can be dropped (after fading out). */
  doneAt = Infinity;

  constructor(
    private readonly ctx: BaseAudioContext,
    readonly song: Song,
    out: AudioNode,
    private readonly t0: number,
    fadeIn = 1.2,
  ) {
    this.step = 60 / song.bpm / 4;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0, t0);
    this.bus.gain.linearRampToValueAtTime(1, t0 + fadeIn);
    this.bus.connect(out);
    this.layer = ctx.createGain();
    this.layer.gain.value = 0;
    this.layer.connect(this.bus);
    for (const track of song.tracks) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = track.pan ?? 0;
      pan.connect(track.layer ? this.layer : this.bus);
      const byStep = new Map<number, Ev[]>();
      for (const e of track.events) byStep.set(e.at, [...(byStep.get(e.at) ?? []), e]);
      this.lanes.push({ track, out: pan, byStep });
    }
    for (const a of song.amb) {
      const g = ctx.createGain();
      g.gain.value = a.gain;
      g.connect(this.bus);
      this.stopAmb.push(ambience(ctx, g, a.id, t0));
    }
  }

  /** Schedule every step that starts before `until` (context seconds). */
  schedule(until: number): void {
    while (this.t0 + this.next * this.step < until) this.play(this.next++);
  }

  private play(i: number): void {
    const t = this.t0 + i * this.step;
    if (t >= this.doneAt) return;
    const bar = Math.floor(i / STEPS_PER_BAR) % this.song.bars;
    for (const { track, out, byStep } of this.lanes) {
      if (track.bars && (bar < track.bars[0] || bar >= track.bars[1])) continue;
      const evs = byStep.get(i % track.len);
      if (!evs) continue;
      const play = INSTRUMENTS[track.inst];
      for (const e of evs)
        for (const n of e.notes) {
          const f = n < 0 ? (DRUM_PITCH[track.inst] ?? 1) : hz(n + (track.transpose ?? 0));
          play(this.ctx, out, t, e.dur * this.step, f, e.vel * track.gain);
        }
    }
  }

  /** The tension layer's level (0–1), eased over a moment. */
  setLayer(level: number, at: number): void {
    this.layer.gain.setTargetAtTime(level, at, 0.25);
  }

  /** Fade out from `at`; the player can be dropped once that's done. */
  fadeOut(at: number, dur = 1.6): void {
    this.bus.gain.cancelScheduledValues(at);
    this.bus.gain.setValueAtTime(this.bus.gain.value, at);
    this.bus.gain.linearRampToValueAtTime(0, at + dur);
    for (const s of this.stopAmb) s(at);
    this.doneAt = at + dur + 0.1;
  }

  disconnect(): void {
    this.bus.disconnect();
  }
}

/** The music bus every song plays into: a little room reverb, the night filter, and the volume.
 *  Returns the input to play into plus its controls. */
export function musicChain(ctx: BaseAudioContext, dest: AudioNode): { input: GainNode; volume: GainNode; night: BiquadFilterNode } {
  const input = ctx.createGain();
  const night = ctx.createBiquadFilter();
  night.type = "lowpass";
  night.frequency.value = 18000;
  night.Q.value = 0.3;
  const volume = ctx.createGain();
  volume.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  // dry + a soft room
  const rev = ctx.createConvolver();
  rev.buffer = roomIR(ctx, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  input.connect(night);
  input.connect(rev).connect(wet).connect(night);
  night.connect(comp).connect(volume).connect(dest);
  return { input, volume, night };
}

/** A reverb tail: decaying noise, a little darker as it fades (deterministic). */
function roomIR(ctx: BaseAudioContext, secs: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let s = 777 + ch * 99991, lp = 0;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const x = (s / 4294967296) * 2 - 1;
      const k = i / len;
      lp += (x - lp) * (0.9 - k * 0.7); // darker toward the tail
      d[i] = lp * (1 - k) ** 2.6 * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
  }
  return b;
}

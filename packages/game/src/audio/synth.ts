// The instruments (design §1 사운드: WebAudio로 합성). Each one schedules a single note on a
// context into a destination; its nodes are dropped once they stop. Everything here is soft on
// purpose — triangle and sine bodies, filtered edges, no hard attacks except the drums.

export type InstId = "pluck" | "bell" | "flute" | "pad" | "bass" | "reed" | "kick" | "shaker" | "wood" | "tom";
/** Play one note: at `t` for `dur` seconds, `f` Hz (drums take it as a tuning hint), `vel` = peak gain. */
export type Play = (ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, f: number, vel: number) => void;
export type AmbId = "waves" | "rain" | "wind";

const cents = (c: number) => 2 ** (c / 1200);

/** White noise (deterministic, so offline renders repeat exactly): 2 s for drums and breath, 8 s
 *  for the looping ambiences (a short loop would be heard repeating). */
const noiseCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
export function noise(ctx: BaseAudioContext, secs = 2): AudioBuffer {
  let m = noiseCache.get(ctx);
  if (!m) noiseCache.set(ctx, (m = new Map()));
  let b = m.get(secs);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 12345 + secs;
    for (let i = 0; i < d.length; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    m.set(secs, b);
  }
  return b;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, t: number, end: number, out: AudioNode, level = 1): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  if (level === 1) o.connect(out);
  else {
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(out);
  }
  o.start(t);
  o.stop(end);
  return o;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number, out: AudioNode): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(out);
  return b;
}

/** A gain that rises to `peak` in `a` s, settles to `peak·s` over ~`d` s, and lets go at `end` over ~`r` s. */
function adsr(ctx: BaseAudioContext, out: AudioNode, t: number, end: number, peak: number, a: number, d: number, s: number, r: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(peak * s, t + a, d / 3);
  g.gain.setTargetAtTime(0, Math.max(end, t + a), r / 3);
  g.connect(out);
  return g;
}

/** A plucked string: bright at first, mellowing as it rings; low strings ring longer. */
const pluck: Play = (ctx, out, t, _dur, f, vel) => {
  const len = Math.min(2.4, 0.9 + 160 / f);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(out);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(320, f * 1.6), t + len * 0.5);
  lp.connect(g);
  osc(ctx, "triangle", f, t, t + len, lp);
  osc(ctx, "sawtooth", f * cents(3), t, t + len, lp, 0.16);
};

/** A kalimba-like bell: a pure tone with a bright tine that dies at once. */
const bell: Play = (ctx, out, t, _dur, f, vel) => {
  const len = 2.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(out);
  osc(ctx, "sine", f, t, t + len, g);
  osc(ctx, "sine", f * 2, t, t + len, g, 0.1);
  const tine = ctx.createGain();
  tine.gain.setValueAtTime(vel * 0.32, t);
  tine.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  tine.connect(out);
  osc(ctx, "sine", f * 4.07, t, t + 0.2, tine);
};

/** A wooden flute: breathy start, a little vibrato once the note settles. */
const flute: Play = (ctx, out, t, dur, f, vel) => {
  const end = t + dur, stop = end + 0.5;
  const g = adsr(ctx, out, t, end, vel, 0.07, 0.3, 0.82, 0.22);
  const lp = filter(ctx, "lowpass", 2800, 0.5, g);
  const a = osc(ctx, "sine", f, t, stop, lp);
  const b = osc(ctx, "triangle", f, t, stop, lp, 0.22);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(0, t + 0.18);
  depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.55);
  lfo.connect(depth);
  depth.connect(a.frequency);
  depth.connect(b.frequency);
  lfo.start(t);
  lfo.stop(stop);
  // the breath at the start
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(vel * 0.12, t + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  n.connect(filter(ctx, "bandpass", Math.min(8000, f * 2), 1.5, ng));
  ng.connect(out);
  n.start(t, (t * 0.37) % 1.5, 0.2);
};

/** Soft strings: two detuned saws, darkened, slow to swell and slow to fade. */
const pad: Play = (ctx, out, t, dur, f, vel) => {
  const end = t + dur;
  const g = adsr(ctx, out, t, end, vel, 0.8, 1, 1, 1.4);
  const lp = filter(ctx, "lowpass", 1000, 0.4, g);
  osc(ctx, "sawtooth", f * cents(-7), t, end + 2, lp, 0.5);
  osc(ctx, "sawtooth", f * cents(7), t, end + 2, lp, 0.5);
  osc(ctx, "triangle", f / 2, t, end + 2, lp, 0.35);
};

/** A round bass: triangle and sine, a little thump at the start. */
const bass: Play = (ctx, out, t, dur, f, vel) => {
  const end = t + Math.max(0.08, dur * 0.9);
  const g = adsr(ctx, out, t, end, vel, 0.008, 0.25, 0.65, 0.12);
  const lp = filter(ctx, "lowpass", 420 + f * 2, 0.9, g);
  osc(ctx, "triangle", f, t, end + 0.4, lp);
  osc(ctx, "sine", f, t, end + 0.4, lp, 0.6);
};

/** A small accordion: two slightly beating square reeds behind a felt filter. */
const reed: Play = (ctx, out, t, dur, f, vel) => {
  const end = t + dur;
  const g = adsr(ctx, out, t, end, vel, 0.035, 0.2, 0.78, 0.1);
  const lp = filter(ctx, "lowpass", 1500, 0.8, g);
  osc(ctx, "square", f * cents(4), t, end + 0.3, lp, 0.5);
  osc(ctx, "square", f * cents(-4), t, end + 0.3, lp, 0.5);
};

const kick: Play = (ctx, out, t, _dur, _f, vel) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  g.connect(out);
  const o = osc(ctx, "sine", 120, t, t + 0.34, g);
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
};

const shaker: Play = (ctx, out, t, _dur, _f, vel) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  g.connect(out);
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  n.connect(filter(ctx, "highpass", 6500, 0.7, g));
  n.start(t, (t * 0.71) % 1.8, 0.1);
};

/** A woodblock knock (f = its pitch). */
const wood: Play = (ctx, out, t, _dur, f, vel) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  g.connect(out);
  const o = osc(ctx, "sine", f * 1.25, t, t + 0.1, g);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
  osc(ctx, "triangle", f * 2.4, t, t + 0.04, g, 0.25);
};

/** A low drum, like the 북편 of a janggu: the pitch drops, a touch of skin noise. */
const tom: Play = (ctx, out, t, _dur, f, vel) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  g.connect(out);
  const o = osc(ctx, "sine", f * 1.6, t, t + 0.48, g);
  o.frequency.setValueAtTime(f * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * 0.3, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  ng.connect(out);
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx);
  n.connect(filter(ctx, "bandpass", 700, 1, ng));
  n.start(t, (t * 0.53) % 1.8, 0.08);
};

export const INSTRUMENTS: Record<InstId, Play> = { pluck, bell, flute, pad, bass, reed, kick, shaker, wood, tom };
/** What a drum hit plays at when the pattern doesn't say (Hz). */
export const DRUM_PITCH: Partial<Record<InstId, number>> = { wood: 880, tom: 95, kick: 50, shaker: 1 };

/** A looping sound of the place under the music. Returns a function that fades it out at a time. */
export function ambience(ctx: BaseAudioContext, out: AudioNode, id: AmbId, t: number): (at: number) => void {
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, t);
  bus.gain.linearRampToValueAtTime(1, t + 2.5);
  bus.connect(out);
  const nodes: AudioScheduledSourceNode[] = [];
  const src = (offset: number) => {
    const n = ctx.createBufferSource();
    n.buffer = noise(ctx, 8);
    n.loop = true;
    n.start(t, offset);
    nodes.push(n);
    return n;
  };
  const lfo = (hz: number, depth: number, param: AudioParam, delay = 0) => {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start(t + delay);
    nodes.push(o);
  };
  if (id === "waves") {
    // the swell: low rumble rising and falling, and the hiss of foam a moment behind it
    const g = ctx.createGain();
    g.gain.value = 0.06;
    src(0).connect(filter(ctx, "lowpass", 480, 0.3, g));
    g.connect(bus);
    lfo(0.11, 0.045, g.gain);
    const foam = ctx.createGain();
    foam.gain.value = 0.012;
    src(0.9).connect(filter(ctx, "highpass", 2400, 0.4, foam));
    foam.connect(bus);
    lfo(0.11, 0.01, foam.gain, 2.2);
  } else if (id === "rain") {
    const g = ctx.createGain();
    g.gain.value = 0.045;
    src(0.3).connect(filter(ctx, "highpass", 1300, 0.5, filter(ctx, "lowpass", 7000, 0.5, g)));
    g.connect(bus);
    lfo(0.27, 0.01, g.gain);
  } else {
    // wind: a band of noise whose pitch wanders
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const bp = filter(ctx, "bandpass", 520, 2.2, g);
    src(1.3).connect(bp);
    g.connect(bus);
    lfo(0.06, 300, bp.frequency);
    lfo(0.09, 0.03, g.gain, 1.1);
  }
  return (at: number) => {
    bus.gain.cancelScheduledValues(at);
    bus.gain.setTargetAtTime(0, at, 0.6);
    for (const n of nodes) n.stop(at + 3);
  };
}

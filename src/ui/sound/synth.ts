// Building blocks for the synthesized sound effects (spec section 18): tones, filtered noise, bells,
// wood blocks and thumps. Each one schedules its own audio nodes at an exact audio-clock time and
// lets them stop by themselves, so a cue is a few calls with times and pitches.

export interface Mix {
  ctx: BaseAudioContext;
  /** Dry output of the cue being played. */
  out: AudioNode;
  /** Send to the room reverb. */
  wet: AudioNode;
  /** Two seconds of white noise, shared by every cue. */
  noise: AudioBuffer;
}

const SILENT = 0.0001;

/** A note number to Hz: 69 = A4 = 440 Hz, 72 = C5. */
export const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** A random number in [a, b): dice clicks and coin sparkles vary a little every time. */
export const vary = (a: number, b: number): number => a + Math.random() * (b - a);

/** A gain envelope: a quick rise to `peak`, then an exponential fall to silence over `decay` s. */
function envelope(m: Mix, t: number, peak: number, attack: number, decay: number, wet: number): GainNode {
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + attack + decay);
  g.connect(m.out);
  if (wet > 0) {
    const send = m.ctx.createGain();
    send.gain.value = wet;
    g.connect(send);
    send.connect(m.wet);
  }
  return g;
}

export interface ToneOptions {
  freq: number;
  /** Glide to this frequency over `glide` seconds (default: the whole note). */
  to?: number;
  glide?: number;
  type?: OscillatorType;
  peak: number;
  attack?: number;
  decay: number;
  /** How much goes to the reverb (0 to 1). */
  wet?: number;
  /** A low-pass filter that softens sawtooth and square waves. */
  lowpass?: number;
}

export function tone(m: Mix, t: number, o: ToneOptions): void {
  const attack = o.attack ?? 0.004;
  const osc = m.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? attack + o.decay));
  const g = envelope(m, t, o.peak, attack, o.decay, o.wet ?? 0);
  if (o.lowpass !== undefined) {
    const f = m.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }
  osc.start(t);
  osc.stop(t + attack + o.decay + 0.03);
}

export interface NoiseOptions {
  filter: BiquadFilterType;
  freq: number;
  /** Sweep the filter to this frequency over the sound. */
  to?: number;
  q?: number;
  peak: number;
  attack?: number;
  decay: number;
  wet?: number;
}

export function noise(m: Mix, t: number, o: NoiseOptions): void {
  const attack = o.attack ?? 0.002;
  const src = m.ctx.createBufferSource();
  src.buffer = m.noise;
  src.loop = true;
  const f = m.ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(o.to, t + attack + o.decay);
  f.Q.value = o.q ?? 0.8;
  const g = envelope(m, t, o.peak, attack, o.decay, o.wet ?? 0);
  src.connect(f);
  f.connect(g);
  const length = attack + o.decay + 0.03;
  src.start(t, vary(0, m.noise.duration * 0.9), length);
}

/** Partials of a struck bell or chime: frequency ratio, loudness and how long it rings. */
const BELL = [
  [1, 1, 1],
  [2, 0.42, 0.7],
  [3.01, 0.22, 0.5],
  [4.18, 0.13, 0.35],
  [5.43, 0.08, 0.25],
] as const;

/** A struck metal bell or chime. */
export function bell(m: Mix, t: number, freq: number, o: { peak: number; decay: number; wet?: number }): void {
  for (const [ratio, amp, life] of BELL) {
    if (freq * ratio > 15000) continue;
    tone(m, t, { freq: freq * ratio, peak: o.peak * amp, attack: 0.002, decay: o.decay * life, wet: o.wet });
  }
}

/** Partials of a hollow metal clank (a cell door), lower and less musical than a bell. */
const CLANK = [
  [1, 1, 1],
  [2.52, 0.6, 0.7],
  [4.0, 0.4, 0.45],
  [5.93, 0.25, 0.3],
] as const;

export function clank(m: Mix, t: number, freq: number, o: { peak: number; decay: number; wet?: number }): void {
  for (const [ratio, amp, life] of CLANK) {
    tone(m, t, { freq: freq * ratio, type: 'triangle', peak: o.peak * amp, attack: 0.001, decay: o.decay * life, wet: o.wet });
  }
}

/** A wooden block or mallet: a short sine with a quick pitch drop and a tap of noise. */
export function wood(m: Mix, t: number, freq: number, o: { peak: number; decay?: number; wet?: number }): void {
  const decay = o.decay ?? 0.07;
  tone(m, t, { freq: freq * 1.45, to: freq, glide: 0.012, peak: o.peak, attack: 0.001, decay, wet: o.wet });
  tone(m, t, { freq: freq * 2.76, peak: o.peak * 0.22, attack: 0.001, decay: decay * 0.45 });
  noise(m, t, { filter: 'bandpass', freq: Math.min(9000, freq * 4), q: 2, peak: o.peak * 0.3, attack: 0.001, decay: 0.012 });
}

/** A low thump: a stamp, a die on the table, a door hitting its frame. */
export function thump(m: Mix, t: number, o: { freq?: number; peak: number; decay?: number }): void {
  const freq = o.freq ?? 120;
  const decay = o.decay ?? 0.12;
  tone(m, t, { freq, to: freq * 0.55, glide: decay * 0.8, peak: o.peak, attack: 0.002, decay });
}

/** One die hitting the table or the other die: a bright click with a little body. */
export function clack(m: Mix, t: number, peak: number): void {
  noise(m, t, { filter: 'bandpass', freq: vary(2300, 4300), q: vary(4, 9), peak, attack: 0.001, decay: vary(0.018, 0.034) });
  tone(m, t, { freq: vary(1700, 3100), type: 'triangle', peak: peak * 0.35, attack: 0.001, decay: 0.02 });
}

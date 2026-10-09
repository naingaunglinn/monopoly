// Sound effects (spec section 18). Every sound is synthesized with the Web Audio API as it plays: no
// audio files, nothing to download or license, and it works offline. Browsers allow sound only after
// the player taps, clicks or presses a key, so the AudioContext starts on the first such input.
// On/off and volume are device preferences. A sound never breaks the game: without Web Audio (or
// before that first input) cues are simply not heard.
import { DEFAULT_VOLUME, getPrefs, subscribePrefs, type Prefs } from '../prefs';
import { CUE_NAMES, CUE_TRIM, CUES, cueSeconds, type CueName, type CueParams } from './cues';
import type { Mix } from './synth';

interface Graph {
  master: GainNode;
  /** Input of the room reverb. */
  reverb: GainNode;
  noise: AudioBuffer;
}

interface Playing {
  bus: GainNode;
  send: GainNode;
}

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
const playing = new Set<Playing>();

/** Cues that still play in a background tab; timers there are throttled, so the others would be late. */
const BACKGROUND: ReadonlySet<CueName> = new Set<CueName>(['yourTurn', 'message', 'stamp', 'voiceOn', 'voiceOff']);

/** Perceived loudness follows the square of the slider. */
export function volumeGain(p: Pick<Prefs, 'soundOn' | 'soundVolume'>): number {
  return p.soundOn ? Math.min(1, Math.max(0, p.soundVolume)) ** 2 : 0;
}

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** A small room: decaying stereo noise, so chimes and stamps ring a little. */
function impulse(c: BaseAudioContext, seconds: number, fall: number): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** fall;
  }
  return buf;
}

function whiteNoise(c: BaseAudioContext): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Every cue goes to the master volume, then a gentle limiter (so overlapping sounds never clip). */
function buildGraph(c: BaseAudioContext, gain: number): Graph {
  const master = c.createGain();
  master.gain.value = gain;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter);
  limiter.connect(c.destination);
  const convolver = c.createConvolver();
  convolver.buffer = impulse(c, 1.2, 3);
  const wet = c.createGain();
  wet.gain.value = 0.5;
  convolver.connect(wet);
  wet.connect(master);
  const reverb = c.createGain();
  reverb.connect(convolver);
  return { master, reverb, noise: whiteNoise(c) };
}

/** Starts (or resumes) audio. Called from an input event, which is what browsers require. */
function start(): void {
  if (ctx) {
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    return;
  }
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  if (activation && !activation.isActive) return;
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return;
  try {
    // Game sounds mix with the player's music and follow the phone's silent switch where supported.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type === 'auto') session.type = 'ambient';
    ctx = new AudioContextClass({ latencyHint: 'interactive' });
    graph = buildGraph(ctx, volumeGain(getPrefs()));
    void ctx.resume().catch(() => undefined);
  } catch {
    ctx = null;
    graph = null;
  }
}

let installed = false;

/** Starts audio on the first tap, click or key press (install before the animation skip handlers). */
export function installAudioUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const type of ['pointerup', 'touchend', 'keydown'] as const) window.addEventListener(type, start, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  });
  subscribePrefs(() => {
    if (ctx && graph) graph.master.gain.setTargetAtTime(volumeGain(getPrefs()), ctx.currentTime, 0.02);
  });
}

/** Cues as they were played, newest last (for the end-to-end tests). */
const played: { cue: CueName; at: number }[] = [];

/** Plays a cue now, or `delay` seconds from now. */
export function playCue(name: CueName, params: CueParams = {}, delay = 0): void {
  if (!getPrefs().soundOn || !ctx || !graph || ctx.state !== 'running') return;
  if (document.visibilityState === 'hidden' && !BACKGROUND.has(name)) return;
  const c = ctx;
  const bus = c.createGain();
  bus.gain.value = CUE_TRIM[name] ?? 1;
  bus.connect(graph.master);
  const send = c.createGain();
  send.gain.value = bus.gain.value;
  send.connect(graph.reverb);
  const mix: Mix = { ctx: c, out: bus, wet: send, noise: graph.noise };
  const t = c.currentTime + 0.01 + delay;
  try {
    CUES[name](mix, t, params);
  } catch {
    // A sound must never break the game.
  }
  const entry: Playing = { bus, send };
  playing.add(entry);
  const done = (t - c.currentTime + cueSeconds(name, params) + 0.3) * 1000;
  window.setTimeout(() => {
    bus.disconnect();
    send.disconnect();
    playing.delete(entry);
  }, done);
  played.push({ cue: name, at: Date.now() });
  if (played.length > 400) played.shift();
}

/** Fades out everything that is playing (the player skipped the animation). */
export function stopSounds(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const p of playing) {
    p.bus.gain.setTargetAtTime(0, now, 0.015);
    p.send.gain.setTargetAtTime(0, now, 0.015);
  }
}

/**
 * Renders a cue offline at the default volume and measures it: the peak, and the loudness of its
 * loudest 50 ms (RMS), so the tests check every cue is heard, never clips and sits with the others.
 */
export async function renderCue(name: CueName, params: CueParams = {}): Promise<{ peak: number; loud: number; seconds: number }> {
  const Offline = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Offline) throw new Error('OfflineAudioContext is not available');
  const rate = 44100;
  const seconds = cueSeconds(name, params) + 0.5;
  const off = new Offline(2, Math.ceil(rate * seconds), rate);
  const g = buildGraph(off, volumeGain({ soundOn: true, soundVolume: DEFAULT_VOLUME }));
  const bus = off.createGain();
  bus.gain.value = CUE_TRIM[name] ?? 1;
  bus.connect(g.master);
  const send = off.createGain();
  send.gain.value = bus.gain.value;
  send.connect(g.reverb);
  CUES[name]({ ctx: off, out: bus, wet: send, noise: g.noise }, 0.02, params);
  const buf = await off.startRendering();
  const left = buf.getChannelData(0);
  const right = buf.getChannelData(buf.numberOfChannels - 1);
  const win = Math.round(rate * 0.05);
  let peak = 0;
  let loud = 0;
  let sum = 0;
  for (let i = 0; i < left.length; i++) {
    const x = ((left[i] ?? 0) + (right[i] ?? 0)) / 2;
    peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
    sum += x * x;
    if (i >= win) {
      const y = ((left[i - win] ?? 0) + (right[i - win] ?? 0)) / 2;
      sum -= y * y;
    }
    if (i >= win - 1) loud = Math.max(loud, Math.sqrt(Math.max(0, sum) / win));
  }
  return { peak, loud, seconds };
}

// Read-only hooks for the end-to-end tests, beside window.__GM__.getState (store.ts).
if (typeof window !== 'undefined') {
  const w = window as unknown as { __GM__?: Record<string, unknown> };
  w.__GM__ = Object.assign(w.__GM__ ?? {}, {
    sounds: () => played.slice(),
    cueNames: () => [...CUE_NAMES],
    audioState: () => ctx?.state ?? 'none',
    renderCue,
  });
}

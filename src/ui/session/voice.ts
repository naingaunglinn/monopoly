// Voice chat (spec section 18): the devices in a room talk peer to peer (WebRTC), audio only. The
// server lists who is in voice and carries each connection's set-up: one offer and one answer,
// every network candidate included (no trickle), which only the receiver can read. Between two
// devices the one with the smaller id offers, so they never both do; a connection that does not
// come up, or fails later, is offered again after a growing pause. Each voice plays through its own
// <audio> element, and a level meter on every stream shows who is speaking.
import { useSyncExternalStore } from 'react';
import type { IceServer, Signal, VoicePeer } from '../../online/protocol';
import { getPrefs, subscribePrefs } from '../prefs';
import { playCue } from '../sound';
import { showToast } from '../store';
import { T } from '../strings';
import { Box, call, online, voiceHooks, voiceSession } from './online';

export type LinkState = 'connecting' | 'connected' | 'failed';

export interface VoiceState {
  status: 'off' | 'joining' | 'on';
  muted: boolean;
  /** This device's voice peer id while it is in voice. */
  me: string | null;
  /** Who is in voice, from the server (this device included). */
  peers: VoicePeer[];
  /** Voice peers speaking now (this device too). */
  speaking: string[];
  /** The connection to each other device. */
  links: Record<string, LinkState>;
}

const OFF: VoiceState = { status: 'off', muted: false, me: null, peers: [], speaking: [], links: {} };
export const voice = new Box<VoiceState>(OFF);

export function useVoice(): VoiceState {
  return useSyncExternalStore(voice.subscribe, voice.get, voice.get);
}

function patch(p: Partial<VoiceState>): void {
  voice.set({ ...voice.get(), ...p });
}

/** The voice peer that speaks for this seat (by seat id), if any. */
export function peerForSeat(v: VoiceState, seatId: string | undefined): VoicePeer | null {
  if (!seatId) return null;
  return v.peers.find((p) => p.seats.includes(seatId)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Timings

/** Longest wait for a connection's network candidates before its offer or answer goes out. */
const GATHER_MS = 3000;
/** An offer that brings no connection in this long is sent again. */
const CONNECT_MS = 15_000;
/** Pauses before offering again after a failure (then the last one, repeated). */
const RETRY_MS = [1500, 4000, 10_000, 20_000];
/** Level meters: how often they are read, the level that counts as speaking, and how long it holds. */
const METER_MS = 100;
const SPEAKING_LEVEL = 0.018;
const SPEAKING_HOLD_MS = 450;
/** While the transport polls, signals are fetched this often during a set-up. */
const SIGNAL_POLL_MS = 2000;

// ---------------------------------------------------------------------------------------------
// Level meters

class Meter {
  private readonly analyser: AnalyserNode;
  private readonly data: Float32Array<ArrayBuffer>;
  private readonly source: MediaStreamAudioSourceNode;
  private lastLoud = 0;

  constructor(ctx: AudioContext, stream: MediaStream) {
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
  }

  /** True while the stream is louder than speech level, held briefly between words. */
  speaking(now: number): boolean {
    this.analyser.getFloatTimeDomainData(this.data);
    let sum = 0;
    for (const x of this.data) sum += x * x;
    if (Math.sqrt(sum / this.data.length) > SPEAKING_LEVEL) this.lastLoud = now;
    return now - this.lastLoud < SPEAKING_HOLD_MS;
  }

  stop(): void {
    this.source.disconnect();
  }
}

// ---------------------------------------------------------------------------------------------
// One connection to another device

/** Resolves once the connection has all its network candidates, or after `ms`. */
function gathered(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = window.setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

class Link {
  private pc: RTCPeerConnection | null = null;
  private readonly audio: HTMLAudioElement;
  meter: Meter | null = null;
  private retry = 0;
  private timer = 0;
  private closed = false;

  constructor(
    private readonly call: VoiceCall,
    readonly peer: string,
    /** This device offers (its id is the smaller one). */
    readonly offers: boolean,
  ) {
    this.audio = document.createElement('audio');
    this.audio.autoplay = true;
    this.audio.setAttribute('playsinline', '');
    this.audio.dataset.voicePeer = peer;
    this.audio.volume = getPrefs().voiceVolume;
    document.body.appendChild(this.audio);
    if (offers) void this.offer();
    else this.state('connecting');
  }

  get connection(): RTCPeerConnection | null {
    return this.pc;
  }

  setVolume(v: number): void {
    this.audio.volume = Math.min(1, Math.max(0, v));
  }

  private state(s: LinkState): void {
    if (!this.closed) this.call.linkState(this.peer, s);
  }

  /** A fresh connection carrying this device's microphone. */
  private build(): RTCPeerConnection {
    this.pc?.close();
    this.meter?.stop();
    this.meter = null;
    const pc = new RTCPeerConnection({ iceServers: this.call.iceServers as RTCIceServer[] });
    for (const track of this.call.local.getAudioTracks()) pc.addTrack(track, this.call.local);
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.audio.srcObject = stream;
      void this.audio.play().catch(() => undefined);
      this.meter?.stop();
      this.meter = this.call.meterFor(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected') {
        this.retry = 0;
        window.clearTimeout(this.timer);
        this.state('connected');
      } else if (pc.connectionState === 'failed') {
        this.state('failed');
        if (this.offers) this.again();
      }
    };
    this.pc = pc;
    return pc;
  }

  /** This device offers: the offer goes out with all its candidates; no connection in time means again. */
  async offer(): Promise<void> {
    if (this.closed) return;
    this.state('connecting');
    const pc = this.build();
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc, GATHER_MS);
      if (pc !== this.pc || this.closed) return;
      await this.call.send(this.peer, 'offer', pc.localDescription?.sdp ?? '');
    } catch {
      // Sending failed (offline for a moment): the timer below offers again.
    }
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.pc === pc && pc.connectionState !== 'connected') this.again();
    }, CONNECT_MS);
  }

  /** The other device offered (first time, or again after a failure): answer on a fresh connection. */
  async answer(sdp: string): Promise<void> {
    if (this.closed || this.offers) return;
    this.state('connecting');
    const pc = this.build();
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc, GATHER_MS);
      if (pc !== this.pc || this.closed) return;
      await this.call.send(this.peer, 'answer', pc.localDescription?.sdp ?? '');
    } catch {
      this.state('failed');
    }
  }

  /** The answer to this device's offer. An answer to an older offer is ignored. */
  async accept(sdp: string): Promise<void> {
    const pc = this.pc;
    if (!pc || !this.offers || pc.signalingState !== 'have-local-offer') return;
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp });
    } catch {
      // Not the answer to the current offer: the timer offers again if nothing connects.
    }
  }

  private again(): void {
    if (this.closed || !this.offers) return;
    window.clearTimeout(this.timer);
    const wait = RETRY_MS[Math.min(this.retry, RETRY_MS.length - 1)] as number;
    this.retry += 1;
    this.timer = window.setTimeout(() => void this.offer(), wait);
  }

  close(): void {
    this.closed = true;
    window.clearTimeout(this.timer);
    this.pc?.close();
    this.pc = null;
    this.meter?.stop();
    this.meter = null;
    this.audio.srcObject = null;
    this.audio.remove();
  }
}

// ---------------------------------------------------------------------------------------------
// The call: this device's microphone and its connections

class VoiceCall {
  private readonly links = new Map<string, Link>();
  private readonly meterCtx: AudioContext | null;
  private readonly localMeter: Meter | null;
  private readonly meterTimer: number;
  private signalAfter = 0;
  private fetching = false;
  private fetchAgain = false;
  private pollTimer = 0;
  private readonly unsubscribePrefs: () => void;

  constructor(
    readonly local: MediaStream,
    readonly me: string,
    readonly iceServers: IceServer[],
    /** The room and seats this call belongs to (kept, so leaving still works as the room closes). */
    readonly room: { code: string; tokens: string[] },
  ) {
    window.addEventListener('pagehide', this.onPageHide);
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.meterCtx = AudioContextClass ? new AudioContextClass() : null;
    void this.meterCtx?.resume().catch(() => undefined);
    this.localMeter = this.meterFor(local);
    this.meterTimer = window.setInterval(() => this.readMeters(), METER_MS);
    this.unsubscribePrefs = subscribePrefs(() => {
      for (const link of this.links.values()) link.setVolume(getPrefs().voiceVolume);
    });
  }

  /** The tab is closing: say so, so the others stop trying to reach this device at once. */
  private onPageHide = (): void => {
    try {
      navigator.sendBeacon?.('/api/room?op=voice', JSON.stringify({ code: this.room.code, tokens: this.room.tokens, state: 'leave' }));
    } catch {
      // The entry then lapses after the presence timeout.
    }
  };

  meterFor(stream: MediaStream): Meter | null {
    try {
      return this.meterCtx ? new Meter(this.meterCtx, stream) : null;
    } catch {
      return null;
    }
  }

  private readMeters(): void {
    const now = performance.now();
    const speaking: string[] = [];
    const st = voice.get();
    if (!st.muted && this.localMeter?.speaking(now)) speaking.push(this.me);
    for (const link of this.links.values()) if (link.meter?.speaking(now)) speaking.push(link.peer);
    const before = st.speaking;
    if (speaking.length !== before.length || speaking.some((id) => !before.includes(id))) patch({ speaking });
  }

  linkState(peer: string, s: LinkState): void {
    const links = voice.get().links;
    if (links[peer] !== s) patch({ links: { ...links, [peer]: s } });
  }

  /** Opens connections to devices that joined and closes those to devices that left. */
  update(peers: VoicePeer[]): void {
    const others = peers.filter((p) => p.id !== this.me);
    for (const p of others) {
      if (!this.links.has(p.id)) this.links.set(p.id, new Link(this, p.id, this.me < p.id));
    }
    for (const [id, link] of this.links) {
      if (others.some((p) => p.id === id)) continue;
      link.close();
      this.links.delete(id);
      const { [id]: _gone, ...rest } = voice.get().links;
      patch({ links: rest });
    }
  }

  async send(to: string, kind: 'offer' | 'answer', sdp: string): Promise<void> {
    const r = await call('POST', '/api/room?op=signal', { code: this.room.code, tokens: this.room.tokens, to, kind, sdp });
    if (!r.ok) throw new Error(r.error);
  }

  /** Fetches the set-up messages for this device (one fetch at a time; a request during one runs after it). */
  async fetchSignals(): Promise<void> {
    if (this.fetching) {
      this.fetchAgain = true;
      return;
    }
    this.fetching = true;
    const r = await call<{ signals: Signal[] }>('POST', '/api/room?op=signals', { code: this.room.code, tokens: this.room.tokens, after: this.signalAfter });
    this.fetching = false;
    if (r.ok) {
      for (const sig of r.data.signals.sort((a, b) => a.id - b.id)) {
        this.signalAfter = Math.max(this.signalAfter, sig.id);
        let link = this.links.get(sig.from);
        // An offer can arrive before the voice list shows its sender: answer it at once.
        if (!link && sig.kind === 'offer' && sig.from < this.me) {
          link = new Link(this, sig.from, false);
          this.links.set(sig.from, link);
        }
        if (!link) continue;
        if (sig.kind === 'offer') void link.answer(sig.sdp);
        else void link.accept(sig.sdp);
      }
    }
    if (this.fetchAgain) {
      this.fetchAgain = false;
      void this.fetchSignals();
    }
  }

  /** While the transport polls (no stream to announce signals), set-ups fetch their signals now and then. */
  pollSignals(on: boolean): void {
    window.clearInterval(this.pollTimer);
    this.pollTimer = on ? window.setInterval(() => void this.fetchSignals(), SIGNAL_POLL_MS) : 0;
  }

  setMuted(muted: boolean): void {
    for (const track of this.local.getAudioTracks()) track.enabled = !muted;
  }

  /** Connection states and audio received from each device (for the end-to-end tests). */
  async stats(): Promise<Record<string, { state: string; bytesReceived: number }>> {
    const out: Record<string, { state: string; bytesReceived: number }> = {};
    for (const [id, link] of this.links) {
      const pc = link.connection;
      let bytes = 0;
      if (pc) {
        const report = await pc.getStats();
        report.forEach((r: { type?: string; kind?: string; bytesReceived?: number }) => {
          if (r.type === 'inbound-rtp' && r.kind === 'audio') bytes += r.bytesReceived ?? 0;
        });
      }
      out[id] = { state: pc?.connectionState ?? 'closed', bytesReceived: bytes };
    }
    return out;
  }

  end(): void {
    window.removeEventListener('pagehide', this.onPageHide);
    window.clearInterval(this.meterTimer);
    window.clearInterval(this.pollTimer);
    this.unsubscribePrefs();
    for (const link of this.links.values()) link.close();
    this.links.clear();
    this.localMeter?.stop();
    void this.meterCtx?.close().catch(() => undefined);
    for (const track of this.local.getTracks()) track.stop();
  }
}

let current: VoiceCall | null = null;

// ---------------------------------------------------------------------------------------------
// Joining, muting, leaving

/**
 * Safari's audio session: game sounds play as "ambient" (they mix with music and follow the silent
 * switch, D82); a voice call needs "play-and-record" while it lasts. Other browsers have no such setting.
 */
function audioSession(type: 'ambient' | 'play-and-record'): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = type;
}

/** The plain-language reason a microphone could not be opened. */
function micError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return T.voice.micBlocked;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return T.voice.noMic;
  return T.voice.failed;
}

/** Joins the room's voice chat with this device's microphone. Returns an error text, or null. */
export async function joinVoice(): Promise<string | null> {
  const s = voiceSession();
  if (!s || voice.get().status !== 'off') return null;
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') return T.voice.unsupported;
  patch({ status: 'joining' });
  audioSession('play-and-record');
  let local: MediaStream;
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch (error) {
    audioSession('ambient');
    patch({ status: 'off' });
    return micError(error);
  }
  const r = await call<{ peer: string; peers: VoicePeer[]; iceServers?: IceServer[] }>('POST', '/api/room?op=voice', { code: s.code, tokens: s.tokens, state: 'join' });
  if (!r.ok || voiceSession()?.code !== s.code) {
    for (const track of local.getTracks()) track.stop();
    audioSession('ambient');
    patch({ status: 'off' });
    return r.ok ? null : T.voice.failed;
  }
  current = new VoiceCall(local, r.data.peer, r.data.iceServers ?? [], s);
  patch({ status: 'on', muted: false, me: r.data.peer, peers: r.data.peers, speaking: [], links: {} });
  current.update(r.data.peers);
  current.pollSignals(online.get()?.link === 'polling');
  void current.fetchSignals();
  playCue('voiceOn');
  return null;
}

export async function setVoiceMuted(muted: boolean): Promise<void> {
  const c = current;
  if (!c) return;
  c.setMuted(muted);
  patch({ muted, speaking: voice.get().speaking.filter((id) => id !== c.me) });
  await call('POST', '/api/room?op=voice', { code: c.room.code, tokens: c.room.tokens, state: muted ? 'mute' : 'unmute' });
}

/** Leaves voice chat: every connection closes and the microphone turns off. */
export function leaveVoice(): void {
  const c = current;
  current = null;
  c?.end();
  if (c) audioSession('ambient');
  patch({ status: 'off', muted: false, me: null, speaking: [], links: {} });
  if (c) {
    void call('POST', '/api/room?op=voice', { code: c.room.code, tokens: c.room.tokens, state: 'leave' });
    playCue('voiceOff');
  }
}

// ---------------------------------------------------------------------------------------------
// What the online session tells voice chat

voiceHooks.peers = (peers) => {
  const st = voice.get();
  // Others joining or leaving: a radio blip, for those in voice.
  if (st.status === 'on') {
    const before = new Set(st.peers.map((p) => p.id));
    const after = new Set(peers.map((p) => p.id));
    if (peers.some((p) => p.id !== st.me && !before.has(p.id))) playCue('voiceOn');
    else if (st.peers.some((p) => p.id !== st.me && !after.has(p.id))) playCue('voiceOff');
  }
  patch({ peers });
  // Dropped from the list (a long disconnection): this device is no longer in voice.
  if (st.status === 'on' && st.me && !peers.some((p) => p.id === st.me)) {
    leaveVoice();
    showToast(T.voice.dropped);
    return;
  }
  current?.update(peers);
};

voiceHooks.signal = (to) => {
  if (current && to === current.me) void current.fetchSignals();
};

voiceHooks.heartbeat = () => (current ? { muted: voice.get().muted } : undefined);

voiceHooks.reconnected = () => {
  if (!current) return;
  current.pollSignals(online.get()?.link === 'polling');
  void current.fetchSignals();
};

voiceHooks.leave = () => {
  leaveVoice();
  patch({ peers: [] });
};

// Read-only hooks for the end-to-end tests.
if (typeof window !== 'undefined') {
  const w = window as unknown as { __GM__?: Record<string, unknown> };
  w.__GM__ = Object.assign(w.__GM__ ?? {}, {
    voice: () => voice.get(),
    voiceStats: () => current?.stats() ?? Promise.resolve({}),
  });
}

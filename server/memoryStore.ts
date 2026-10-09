// In-memory RoomStore for local development and tests: the same contract as UpstashStore, kept in
// one process. Rooms are stored as JSON text, so callers never share objects with the store, and
// they expire like Redis keys do.
import { CHAT_KEEP, SIGNAL_KEEP, type ChatMessage, type Notice, type Signal, type VoicePeer } from '../src/online/protocol.js';
import { LOG_LENGTH, ROOM_TTL_SECONDS, type Presence, type Room } from './room.js';
import type { CommitResult, LogEntry, RoomStore, Since } from './store.js';

interface Entry {
  json: string;
  version: number;
  log: string[];
  presence: Presence;
  expiresAt: number;
  chat: ChatMessage[];
  chatLast: number;
  /** Rate key -> when it last sent. */
  chatSent: Record<string, number>;
  voice: Record<string, VoicePeer>;
  /** Receiver -> its signals. */
  signals: Record<string, Signal[]>;
  signalLast: number;
}

export class MemoryStore implements RoomStore {
  readonly name = 'memory' as const;
  private rooms = new Map<string, Entry>();
  private watchers = new Map<string, Set<(message: string) => void>>();

  constructor(private readonly clock: () => number = Date.now) {}

  private entry(code: string): Entry | null {
    const e = this.rooms.get(code);
    if (!e) return null;
    if (this.clock() >= e.expiresAt) {
      this.rooms.delete(code);
      return null;
    }
    return e;
  }

  private wake(code: string, message: string): void {
    for (const fn of [...(this.watchers.get(code) ?? [])]) fn(message);
  }

  async load(code: string): Promise<Room | null> {
    const e = this.entry(code);
    return e ? (JSON.parse(e.json) as Room) : null;
  }

  async create(room: Room, entry: LogEntry): Promise<boolean> {
    if (this.entry(room.code)) return false;
    this.rooms.set(room.code, {
      json: JSON.stringify(room),
      version: room.version,
      log: [JSON.stringify(entry)],
      presence: {},
      expiresAt: this.clock() + ROOM_TTL_SECONDS * 1000,
      chat: [],
      chatLast: 0,
      chatSent: {},
      voice: {},
      signals: {},
      signalLast: 0,
    });
    this.wake(room.code, String(room.version));
    return true;
  }

  async commit(next: Room, expected: number, entry: LogEntry): Promise<CommitResult> {
    const e = this.entry(next.code);
    if (!e) return 'missing';
    if (e.version !== expected) return 'conflict';
    e.json = JSON.stringify(next);
    e.version = next.version;
    e.log.push(JSON.stringify(entry));
    if (e.log.length > LOG_LENGTH) e.log.splice(0, e.log.length - LOG_LENGTH);
    e.expiresAt = this.clock() + ROOM_TTL_SECONDS * 1000;
    this.wake(next.code, String(next.version));
    return 'ok';
  }

  async since(code: string, since: number): Promise<Since> {
    const e = this.entry(code);
    if (!e) return { room: null, entries: 'gap' };
    const room = JSON.parse(e.json) as Room;
    if (since === e.version) return { room, entries: [] };
    if (since > e.version || since < 0) return { room, entries: 'gap' };
    const entries = e.log.map((u) => JSON.parse(u) as LogEntry).filter((u) => u.v > since);
    return { room, entries: entries[0]?.v === since + 1 ? entries : 'gap' };
  }

  async watch(code: string, signal: AbortSignal, onChange: (message: string) => void): Promise<void> {
    if (signal.aborted) return;
    const set = this.watchers.get(code) ?? new Set();
    set.add(onChange);
    this.watchers.set(code, set);
    signal.addEventListener('abort', () => {
      set.delete(onChange);
      if (set.size === 0) this.watchers.delete(code);
    });
  }

  async heartbeat(code: string, seatIds: string[], now: number): Promise<Presence> {
    const e = this.entry(code);
    if (!e) return {};
    for (const id of seatIds) e.presence[id] = now;
    return { ...e.presence };
  }

  async presence(code: string): Promise<Presence> {
    return { ...(this.entry(code)?.presence ?? {}) };
  }

  async chat(code: string, message: ChatMessage, rateKey: string, now: number, gapMs: number): Promise<ChatMessage | 'slow' | 'missing'> {
    const e = this.entry(code);
    if (!e) return 'missing';
    const last = e.chatSent[rateKey];
    if (last !== undefined && now - last < gapMs) return 'slow';
    e.chatLast += 1;
    const numbered: ChatMessage = { ...message, id: e.chatLast };
    e.chat.push(numbered);
    if (e.chat.length > CHAT_KEEP) e.chat.splice(0, e.chat.length - CHAT_KEEP);
    e.chatSent[rateKey] = now;
    const notice: Notice = { k: 'chat', m: numbered };
    this.wake(code, JSON.stringify(notice));
    return { ...numbered };
  }

  async chatSince(code: string, after: number): Promise<{ last: number; messages: ChatMessage[] }> {
    const e = this.entry(code);
    if (!e) return { last: 0, messages: [] };
    const from = after > e.chatLast ? 0 : after;
    return { last: e.chatLast, messages: e.chat.filter((m) => m.id > from).map((m) => ({ ...m })) };
  }

  async voice(code: string, peerId: string, entry: VoicePeer | null, now: number, timeoutMs: number) {
    const e = this.entry(code);
    if (!e) return 'missing' as const;
    const created = entry !== null && !(peerId in e.voice);
    if (entry) e.voice[peerId] = { ...entry };
    else delete e.voice[peerId];
    let dropped = 0;
    for (const [id, p] of Object.entries(e.voice)) {
      if (now - p.at > timeoutMs) {
        delete e.voice[id];
        dropped += 1;
      }
    }
    return { peers: Object.values(e.voice).map((p) => ({ ...p })), created, dropped };
  }

  async voicePeers(code: string): Promise<VoicePeer[]> {
    return Object.values(this.entry(code)?.voice ?? {}).map((p) => ({ ...p }));
  }

  async signal(code: string, signal: Signal): Promise<Signal | 'missing'> {
    const e = this.entry(code);
    if (!e) return 'missing';
    e.signalLast += 1;
    const numbered = { ...signal, id: e.signalLast };
    const list = (e.signals[signal.to] ??= []);
    list.push(numbered);
    if (list.length > SIGNAL_KEEP) list.splice(0, list.length - SIGNAL_KEEP);
    await this.notify(code, { k: 'signal', to: signal.to, id: numbered.id });
    return { ...numbered };
  }

  async signals(code: string, to: string, after: number): Promise<Signal[]> {
    return (this.entry(code)?.signals[to] ?? []).filter((s) => s.id > after).map((s) => ({ ...s }));
  }

  async notify(code: string, notice: Notice): Promise<void> {
    if (this.entry(code)) this.wake(code, JSON.stringify(notice));
  }

  /** Test helper: forget a room's log entries before `version` (as trimming would). */
  trimLog(code: string, keepFrom: number): void {
    const e = this.rooms.get(code);
    if (e) e.log = e.log.filter((u) => (JSON.parse(u) as LogEntry).v >= keepFrom);
  }
}

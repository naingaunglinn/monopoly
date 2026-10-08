// In-memory RoomStore for local development and tests: the same contract as UpstashStore, kept in
// one process. Rooms are stored as JSON text, so callers never share objects with the store, and
// they expire like Redis keys do.
import { LOG_LENGTH, ROOM_TTL_SECONDS, type Presence, type Room } from './room.js';
import type { CommitResult, LogEntry, RoomStore, Since } from './store.js';

interface Entry {
  json: string;
  version: number;
  log: string[];
  presence: Presence;
  expiresAt: number;
}

export class MemoryStore implements RoomStore {
  readonly name = 'memory' as const;
  private rooms = new Map<string, Entry>();
  private watchers = new Map<string, Set<() => void>>();

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

  private wake(code: string): void {
    for (const fn of [...(this.watchers.get(code) ?? [])]) fn();
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
    });
    this.wake(room.code);
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
    this.wake(next.code);
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

  async watch(code: string, signal: AbortSignal, onChange: () => void): Promise<void> {
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

  /** Test helper: forget a room's log entries before `version` (as trimming would). */
  trimLog(code: string, keepFrom: number): void {
    const e = this.rooms.get(code);
    if (e) e.log = e.log.filter((u) => (JSON.parse(u) as LogEntry).v >= keepFrom);
  }
}

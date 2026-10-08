// Where rooms live. Two implementations: UpstashStore (production, Redis over REST) and MemoryStore
// (local development and tests). Function instances never keep room state between requests; the
// store is the only source of truth, and every write is a compare-and-set on the room's version.
import type { LogEntry, Presence, Room } from './room.js';

export type { LogEntry };
export type CommitResult = 'ok' | 'conflict' | 'missing';

export interface Since {
  /** The room now, or null when it does not exist (or expired). */
  room: Room | null;
  /** The entries after the requested version, oldest first; 'gap' when the log no longer reaches back. */
  entries: LogEntry[] | 'gap';
}

export interface RoomStore {
  readonly name: 'memory' | 'upstash';
  /** The room, or null when it does not exist or has expired. */
  load(code: string): Promise<Room | null>;
  /** Creates a room with its first log entry; false when the code is taken. */
  create(room: Room, entry: LogEntry): Promise<boolean>;
  /**
   * Saves `next` (version `expected` + 1) only if the stored version is still `expected`, appends
   * the entry to the room's log and refreshes the expiry, atomically; then wakes the room's watchers.
   */
  commit(next: Room, expected: number, entry: LogEntry): Promise<CommitResult>;
  /** What happened after version `since`, with the room as it is now (one store call). */
  since(code: string, since: number): Promise<Since>;
  /**
   * Calls `onChange` after every commit to the room until the signal aborts. Resolves once it is
   * listening (so a read made after it cannot miss a commit); rejects if it cannot listen.
   * `onError` reports a listener that broke later.
   */
  watch(code: string, signal: AbortSignal, onChange: () => void, onError: (error: unknown) => void): Promise<void>;
  /** Records a heartbeat for these seat ids and returns when every seat was last seen. */
  heartbeat(code: string, seatIds: string[], now: number): Promise<Presence>;
  presence(code: string): Promise<Presence>;
}

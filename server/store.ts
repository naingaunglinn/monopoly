// Where rooms live. Two implementations: UpstashStore (production, Redis over REST) and MemoryStore
// (local development and tests). Function instances never keep room state between requests; the
// store is the only source of truth, and every write is a compare-and-set on the room's version.
import type { ChatMessage, Notice, Signal, VoicePeer } from '../src/online/protocol.js';
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
   * Calls `onChange` with each announcement on the room until the signal aborts: the new version
   * after a commit (a plain number), or a notice such as a chat message (JSON). Resolves once it
   * is listening (so a read made after it cannot miss a commit); rejects if it cannot listen.
   * `onError` reports a listener that broke later.
   */
  watch(code: string, signal: AbortSignal, onChange: (message: string) => void, onError: (error: unknown) => void): Promise<void>;
  /**
   * Chat (spec section 18): numbers the message and keeps the newest CHAT_KEEP, unless the same
   * `rateKey` sent one less than `gapMs` ago ('slow'); then announces it to the open streams.
   * It never changes the room's version, and chat expires with the room.
   */
  chat(code: string, message: ChatMessage, rateKey: string, now: number, gapMs: number): Promise<ChatMessage | 'slow' | 'missing'>;
  /** The kept messages after id `after`, oldest first, and the newest id (all of them if `after` is ahead). */
  chatSince(code: string, after: number): Promise<{ last: number; messages: ChatMessage[] }>;
  /**
   * Voice chat: sets this device's entry (or removes it: `entry` null) and drops entries not seen for
   * `timeoutMs`, then returns them all, whether this one is new and how many were dropped. It does
   * not announce: the caller announces changes with `notify`. Voice expires with the room.
   */
  voice(code: string, peerId: string, entry: VoicePeer | null, now: number, timeoutMs: number): Promise<{ peers: VoicePeer[]; created: boolean; dropped: number } | 'missing'>;
  /** The voice entries as they are. */
  voicePeers(code: string): Promise<VoicePeer[]>;
  /** Keeps a signal for its receiver (the newest few), numbered, and announces it (receiver and id only). */
  signal(code: string, signal: Signal): Promise<Signal | 'missing'>;
  /** The signals kept for `to` after id `after`, oldest first. */
  signals(code: string, to: string, after: number): Promise<Signal[]>;
  /** Announces a notice to the room's open streams. */
  notify(code: string, notice: Notice): Promise<void>;
  /** Records a heartbeat for these seat ids and returns when every seat was last seen. */
  heartbeat(code: string, seatIds: string[], now: number): Promise<Presence>;
  presence(code: string): Promise<Presence>;
}

// RoomStore on Upstash Redis (REST), for production on Vercel. Credentials come from the variables
// the Vercel Marketplace integration injects: KV_REST_API_URL / KV_REST_API_TOKEN (or
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
//
// Keys per room (one hash tag, so a Lua script may touch them all):
//   gm:{CODE}:room  the room document (JSON)      gm:{CODE}:v    its version
//   gm:{CODE}:log   a list of log entries, one per version, trimmed to the last LOG_LENGTH
//   gm:{CODE}:seen  a hash of seat id -> last heartbeat (ms)
// Every key expires ROOM_TTL_SECONDS after the room's last write. Writes are Lua scripts, so the
// compare-and-set on the version, the log append and the expiry are atomic, and only basic commands
// run inside them. After a commit, a PUBLISH on the room's channel wakes the open streams, which
// listen with SUBSCRIBE (Upstash serves it as an event stream over REST; blocking reads are not
// available over REST, and nothing on the server polls).
import { Redis } from '@upstash/redis';
import { LOG_LENGTH, ROOM_TTL_SECONDS, type Presence, type Room } from './room.js';
import type { CommitResult, LogEntry, RoomStore, Since } from './store.js';

const CREATE = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('DEL', KEYS[3], KEYS[4])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
redis.call('RPUSH', KEYS[3], ARGV[3])
redis.call('EXPIRE', KEYS[3], ARGV[4])
return 1
`;

const COMMIT = `
local current = redis.call('GET', KEYS[2])
if not current then return -1 end
if current ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[5])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[5])
redis.call('RPUSH', KEYS[3], ARGV[4])
redis.call('LTRIM', KEYS[3], -tonumber(ARGV[6]), -1)
redis.call('EXPIRE', KEYS[3], ARGV[5])
redis.call('EXPIRE', KEYS[4], ARGV[5])
return 1
`;

/** The version, the log entries after ARGV[1] (the list's tail) and the room, in one call. */
const SINCE = `
local v = redis.call('GET', KEYS[2])
if not v then return {} end
local current = tonumber(v)
local since = tonumber(ARGV[1])
local room = redis.call('GET', KEYS[1])
if since >= current or since < 0 then return {current, {}, room} end
return {current, redis.call('LRANGE', KEYS[3], since - current, -1), room}
`;

const HEARTBEAT = `
if redis.call('EXISTS', KEYS[2]) == 0 then return {} end
for i = 2, #ARGV do redis.call('HSET', KEYS[1], ARGV[i], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[2])
if ttl > 0 then redis.call('EXPIRE', KEYS[1], ttl) end
return redis.call('HGETALL', KEYS[1])
`;

export const roomKeys = (code: string) => ({
  room: `gm:{${code}}:room`,
  v: `gm:{${code}}:v`,
  log: `gm:{${code}}:log`,
  seen: `gm:{${code}}:seen`,
});

/** The channel that announces a room's new versions (no braces: it is part of a URL path). */
export const roomChannel = (code: string) => `gm.room.${code}`;

/** The REST credentials from the environment, or null when the integration is not connected. */
export function upstashConfig(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function toPresence(raw: unknown): Presence {
  const out: Presence = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = Number(raw[i + 1]);
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) out[k] = Number(v);
  }
  return out;
}

export class UpstashStore implements RoomStore {
  readonly name = 'upstash' as const;
  private readonly redis: Redis;

  constructor(config: { url: string; token: string }) {
    // Values are stored as text: no automatic JSON parsing.
    this.redis = new Redis({ url: config.url, token: config.token, automaticDeserialization: false });
  }

  async load(code: string): Promise<Room | null> {
    const raw = await this.redis.get<string>(roomKeys(code).room);
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async create(room: Room, entry: LogEntry): Promise<boolean> {
    const k = roomKeys(room.code);
    const result = await this.redis.eval(
      CREATE,
      [k.room, k.v, k.log, k.seen],
      [JSON.stringify(room), String(room.version), JSON.stringify(entry), String(ROOM_TTL_SECONDS)],
    );
    return Number(result) === 1;
  }

  async commit(next: Room, expected: number, entry: LogEntry): Promise<CommitResult> {
    const k = roomKeys(next.code);
    const result = Number(
      await this.redis.eval(
        COMMIT,
        [k.room, k.v, k.log, k.seen],
        [
          JSON.stringify(next),
          String(expected),
          String(next.version),
          JSON.stringify(entry),
          String(ROOM_TTL_SECONDS),
          String(LOG_LENGTH),
        ],
      ),
    );
    if (result !== 1) return result === 0 ? 'conflict' : 'missing';
    try {
      await this.redis.publish(roomChannel(next.code), String(next.version));
    } catch (error) {
      // The commit stands. Streams also re-check now and then, and devices resync on heartbeats.
      console.error('publish failed', error);
    }
    return 'ok';
  }

  async since(code: string, since: number): Promise<Since> {
    const k = roomKeys(code);
    const raw = (await this.redis.eval(SINCE, [k.room, k.v, k.log], [String(since)])) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return { room: null, entries: 'gap' };
    const current = Number(raw[0]);
    const list = (Array.isArray(raw[1]) ? raw[1] : []) as string[];
    const room = typeof raw[2] === 'string' ? (JSON.parse(raw[2]) as Room) : null;
    if (since === current) return { room, entries: [] };
    if (since > current || since < 0) return { room, entries: 'gap' };
    const entries = list.map((s) => JSON.parse(s) as LogEntry);
    const complete = entries.length === current - since && entries[0]?.v === since + 1;
    return { room, entries: complete ? entries : 'gap' };
  }

  async watch(code: string, signal: AbortSignal, onChange: () => void, onError: (error: unknown) => void): Promise<void> {
    if (signal.aborted) return;
    const sub = this.redis.subscribe<string>(roomChannel(code));
    let listening = false;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('subscribe timed out')), 10_000);
      sub.on('subscribe', () => {
        listening = true;
        clearTimeout(timer);
        resolve();
      });
      sub.on('error', (error: unknown) => {
        if (listening) onError(error);
        else {
          clearTimeout(timer);
          reject(error);
        }
      });
    }).catch(async (error: unknown) => {
      await sub.unsubscribe().catch(() => undefined);
      throw error;
    });
    sub.on('message', () => onChange());
    const stop = () => void sub.unsubscribe().catch(() => undefined);
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop);
  }

  async heartbeat(code: string, seatIds: string[], now: number): Promise<Presence> {
    const k = roomKeys(code);
    return toPresence(await this.redis.eval(HEARTBEAT, [k.seen, k.v], [String(now), ...seatIds]));
  }

  async presence(code: string): Promise<Presence> {
    return toPresence(await this.redis.hgetall(roomKeys(code).seen));
  }
}

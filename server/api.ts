// The online API (spec section 17) as web-standard (Request) => Response handlers over a RoomStore.
// The same handlers run in Vercel Functions (UpstashStore) and in the local server (MemoryStore).
// Every write is a compare-and-set on the room's version; game actions are authoritative here.
//
//   GET  /api/health                     the store in use
//   GET  /api/room?code=ABCD[&since=N]   the room view (and, for polling, the entries after N, with
//                                        &chat=M the chat messages after id M, with &voice=1 who is
//                                        in voice); &probe=1 answers a missing room with { view: null }
//   POST /api/room?op=...                create, join, seat, leave, settings, start, action,
//                                        heartbeat, reclaim, host, chat, voice, signal, signals
//   GET  /api/stream?code=ABCD&since=N[&chat=M]   Server-Sent Events, resumable with Last-Event-ID
//                                        (versions); chat, voice and signal notices are their own events
import type { GameEvent } from '../src/engine/index.js';
import {
  CHAT_GAP_MS,
  MAX_SDP,
  PRESENCE_TIMEOUT_MS,
  STAMP_GAP_MS,
  type ChatMessage,
  type IceServer,
  type Notice,
  type Signal,
  type VoicePeer,
} from '../src/online/protocol.js';
import {
  addSeat,
  changeSettings,
  chatMessage,
  CODE_ALPHABET,
  CODE_PATTERN,
  endProxies,
  fail,
  handOverHost,
  hostControl,
  isError,
  newRoom,
  playAction,
  reclaimSeat,
  removeSeat,
  seatIndexOf,
  startGame,
  updateSeat,
  viewOf,
  type LogEntry,
  type OpError,
  type Presence,
  type Room,
  type RoomUpdate,
  type UpdateKind,
} from './room.js';
import type { RoomStore } from './store.js';

export interface ApiConfig {
  store: RoomStore;
  now?: () => number;
  /** A stream response ends after this long, before the platform's time limit; the browser reconnects. */
  streamMs?: number;
  /** An idle stream sends a comment this often, so proxies keep it open and clients see it alive. */
  pingMs?: number;
  /** An open stream re-reads the room this often even without a notification (a lost publish). */
  recheckMs?: number;
  /** The servers that help devices connect for voice chat (none: same network only, as in tests). */
  iceServers?: () => Promise<IceServer[]>;
}

export type Api = (req: Request) => Promise<Response>;

const MAX_BODY = 64 * 1024;

// ---------------------------------------------------------------------------------------------
// Small helpers

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const errorResponse = (e: OpError, extra: Record<string, unknown> = {}): Response =>
  json({ error: e.error, ...(e.reason ? { reason: e.reason } : {}), ...extra }, e.status);

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A private seat token (given to its device once) and its hash (stored in the room). */
export async function newToken(): Promise<{ token: string; hash: string }> {
  const token = hex(randomBytes(32));
  return { token, hash: await hashToken(token) };
}

export async function hashToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

function newCode(): string {
  return [...randomBytes(4)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** The game seed: random on the server, never sent to a device. */
function newSeed(): number {
  const [a, b, c, d] = randomBytes(4) as unknown as [number, number, number, number];
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return null;
    const body = JSON.parse(text) as unknown;
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A non-negative integer from a query parameter, or `fallback`. */
function cursorOf(value: string | null, fallback: number): number {
  const n = Number(value ?? NaN);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function codeOf(value: unknown): string | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return CODE_PATTERN.test(code) ? code : null;
}

function tokensOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((t): t is string => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)).slice(0, 6);
}

/** Seat indexes these tokens hold in the room. */
async function seatsOf(room: Room, tokens: string[]): Promise<number[]> {
  const out: number[] = [];
  for (const t of tokens) {
    const i = seatIndexOf(room, await hashToken(t));
    if (i >= 0 && !out.includes(i)) out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/** A device's voice peer id: stable while it keeps its first seat. */
const peerOf = (room: Room, seats: number[]): string => `v${room.seats[seats[0] as number]?.id ?? ''}`;

/** Voice entries seen within the presence timeout. */
const freshPeers = (peers: VoicePeer[], now: number): VoicePeer[] => peers.filter((p) => now - p.at <= PRESENCE_TIMEOUT_MS);

const entryOf = (room: Room, kind: UpdateKind, seat: number | null, events: GameEvent[] = []): LogEntry => ({
  v: room.version,
  kind,
  seat,
  events,
});

// ---------------------------------------------------------------------------------------------

export function createApi(config: ApiConfig): Api {
  const store = config.store;
  const now = config.now ?? Date.now;
  const streamMs = config.streamMs ?? 270_000;
  const pingMs = config.pingMs ?? 20_000;
  const recheckMs = config.recheckMs ?? 60_000;
  const iceServers = config.iceServers ?? (async () => []);

  /**
   * Load, change, compare-and-set; on a conflict (someone else wrote first) it runs again on the
   * fresh room. Used for lobby and presence changes, which do not depend on what the player saw.
   */
  async function mutate(
    code: string,
    kind: UpdateKind,
    change: (room: Room) => Promise<{ room: Room; events?: GameEvent[]; seat?: number | null } | OpError>,
  ): Promise<{ room: Room; entry: LogEntry } | OpError> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const room = await store.load(code);
      if (!room) return fail('roomNotFound', 404);
      const changed = await change(room);
      if (isError(changed)) return changed;
      const entry = entryOf(changed.room, kind, changed.seat ?? null, changed.events ?? []);
      const result = await store.commit(changed.room, room.version, entry);
      if (result === 'ok') return { room: changed.room, entry };
      if (result === 'missing') return fail('roomNotFound', 404);
    }
    return fail('conflict', 409);
  }

  /** Resolves the caller's token to their seat, or an error. */
  async function callerSeat(room: Room, token: unknown): Promise<number | OpError> {
    const [t] = tokensOf(token);
    if (!t) return fail('notInRoom', 403);
    const seat = seatIndexOf(room, await hashToken(t));
    return seat >= 0 ? seat : fail('notInRoom', 403);
  }

  /** The room for the caller; `token` and `seatId` when a new seat token was just issued. */
  async function seatResponse(room: Room, token: string | null, tokens: string[] = [], status = 200, seatId?: string): Promise<Response> {
    const all = token ? [token, ...tokens] : tokens;
    return json(
      { code: room.code, ...(token ? { token, seatId } : {}), you: await seatsOf(room, all), view: viewOf(room), now: now() },
      status,
    );
  }

  const update = (room: Room, entry: LogEntry): RoomUpdate & { now: number } => ({ ...entry, view: viewOf(room), now: now() });

  // op=create {name, color?, settings?}: a new room with the caller in the first seat, as host.
  async function create(body: Record<string, unknown>): Promise<Response> {
    const { token, hash } = await newToken();
    for (let attempt = 0; attempt < 8; attempt++) {
      const t = now();
      const room = newRoom({ code: newCode(), now: t, seatId: hex(randomBytes(6)), tokenHash: hash, name: body.name, color: body.color, settings: body.settings });
      if (await store.create(room, entryOf(room, 'created', 0))) {
        const seatId = room.seats[0]?.id as string;
        await store.heartbeat(room.code, [seatId], t);
        return seatResponse(room, token, [], 201, seatId);
      }
    }
    return errorResponse(fail('conflict', 409));
  }

  // op=join {code, name, color?, tokens?}: takes a new seat in the lobby. `tokens` are this device's
  // other seats, so the answer lists them all.
  async function join(code: string, body: Record<string, unknown>): Promise<Response> {
    const { token, hash } = await newToken();
    const seatId = hex(randomBytes(6));
    const result = await mutate(code, 'joined', async (room) => {
      const next = addSeat(room, { seatId, tokenHash: hash, name: body.name, color: body.color, now: now() });
      return isError(next) ? next : { room: next, seat: next.seats.length - 1 };
    });
    if (isError(result)) return errorResponse(result);
    await store.heartbeat(code, [seatId], now());
    return seatResponse(result.room, token, tokensOf(body.tokens), 200, seatId);
  }

  /** Lobby changes made by the caller's own seat (rename/colour, leave) or by the host (settings). */
  async function seatChange(
    code: string,
    body: Record<string, unknown>,
    kind: UpdateKind,
    change: (room: Room, seat: number) => Room | OpError,
  ): Promise<Response> {
    const result = await mutate(code, kind, async (room) => {
      const s = await callerSeat(room, body.token);
      if (isError(s)) return s;
      const next = change(room, s);
      return isError(next) ? next : { room: next, seat: s };
    });
    if (isError(result)) return errorResponse(result);
    return seatResponse(result.room, null, tokensOf(body.tokens ?? body.token));
  }

  // op=start {code, token}: the host starts the game with 2 to 6 seats.
  async function start(code: string, body: Record<string, unknown>): Promise<Response> {
    const seed = newSeed();
    const result = await mutate(code, 'started', async (room) => {
      const s = await callerSeat(room, body.token);
      if (isError(s)) return s;
      if (s !== room.host) return fail('notHost', 403);
      const next = startGame(room, seed, now());
      return isError(next) ? next : { room: next, seat: s };
    });
    if (isError(result)) return errorResponse(result);
    return json(update(result.room, result.entry));
  }

  // op=action {code, token, action, expectedVersion}: one game action, checked and applied.
  async function action(code: string, body: Record<string, unknown>): Promise<Response> {
    const room = await store.load(code);
    if (!room) return errorResponse(fail('roomNotFound', 404));
    const s = await callerSeat(room, body.token);
    if (isError(s)) return errorResponse(s);
    const played = playAction(room, s, body.action, body.expectedVersion, now());
    if (isError(played)) return errorResponse(played, { version: room.version });
    const entry = entryOf(played.room, 'action', s, played.events);
    const result = await store.commit(played.room, room.version, entry);
    if (result === 'missing') return errorResponse(fail('roomNotFound', 404));
    // Someone else's action landed first: nothing changed; the device resyncs and tries again.
    if (result === 'conflict') return errorResponse(fail('stale', 409), { version: room.version + 1 });
    return json(update(played.room, entry));
  }

  // op=heartbeat {code, tokens}: presence. Returning players take their seat back from the host, and
  // a disconnected host hands over to the next connected player.
  async function heartbeat(code: string, body: Record<string, unknown>): Promise<Response> {
    const room = await store.load(code);
    if (!room) return errorResponse(fail('roomNotFound', 404));
    const mine = await seatsOf(room, tokensOf(body.tokens));
    if (mine.length === 0) return errorResponse(fail('notInRoom', 403));
    const t = now();
    const presence: Presence = await store.heartbeat(code, mine.map((i) => room.seats[i]?.id as string), t);
    let latest = room;
    // Most heartbeats change nothing and cost two store calls; a change is a compare-and-set.
    if (endProxies(latest, mine, t)) {
      const returned = await mutate(code, 'returned', async (r) => {
        const next = endProxies(r, mine, t);
        return next ? { room: next, seat: mine[0] ?? null } : fail('conflict', 409);
      });
      if (!isError(returned)) latest = returned.room;
    }
    if (handOverHost(latest, presence, t)) {
      const handed = await mutate(code, 'host', async (r) => {
        const next = handOverHost(r, presence, t);
        return next ? { room: next, seat: next.host } : fail('conflict', 409);
      });
      if (!isError(handed)) latest = handed.room;
    }
    const seatIds = mine.map((i) => room.seats[i]?.id as string);
    // A device in voice chat stays listed while its heartbeats come; one that stopped is dropped.
    const v = body.voice as { muted?: unknown } | undefined;
    if (v && typeof v === 'object') {
      const peer: VoicePeer = { id: peerOf(room, mine), seats: seatIds, muted: v.muted === true, at: t };
      const result = await store.voice(code, peer.id, peer, t, PRESENCE_TIMEOUT_MS);
      if (result !== 'missing' && (result.created || result.dropped > 0)) await store.notify(code, { k: 'voice', peers: result.peers });
    }
    return json({ now: t, presence, you: mine, seatIds, version: latest.version, host: latest.host });
  }

  // op=voice {code, tokens, state}: this device joins (or mutes, unmutes, leaves) the room's voice
  // chat (spec section 18). Joining also brings the servers that help devices reach each other.
  async function voice(code: string, body: Record<string, unknown>): Promise<Response> {
    const state = body.state;
    if (state !== 'join' && state !== 'mute' && state !== 'unmute' && state !== 'leave') return errorResponse(fail('badRequest', 400));
    const room = await store.load(code);
    if (!room) return errorResponse(fail('roomNotFound', 404));
    const mine = await seatsOf(room, tokensOf(body.tokens));
    if (mine.length === 0) return errorResponse(fail('notInRoom', 403));
    const t = now();
    const id = peerOf(room, mine);
    const muted = state === 'mute' || (state === 'join' && body.muted === true);
    const peer: VoicePeer | null = state === 'leave' ? null : { id, seats: mine.map((i) => room.seats[i]?.id as string), muted, at: t };
    const result = await store.voice(code, id, peer, t, PRESENCE_TIMEOUT_MS);
    if (result === 'missing') return errorResponse(fail('roomNotFound', 404));
    await store.notify(code, { k: 'voice', peers: result.peers });
    const servers = state === 'join' ? await iceServers() : null;
    return json({ peer: id, peers: result.peers, ...(servers ? { iceServers: servers } : {}), now: t });
  }

  // op=signal {code, tokens, to, kind, sdp}: connection set-up for voice, from this device to another
  // one in voice chat. Only its receiver can read it (op=signals); the stream announces it.
  async function signal(code: string, body: Record<string, unknown>): Promise<Response> {
    const kind = body.kind;
    const sdp = body.sdp;
    if ((kind !== 'offer' && kind !== 'answer') || typeof sdp !== 'string' || sdp.length === 0 || sdp.length > MAX_SDP || typeof body.to !== 'string') {
      return errorResponse(fail('badRequest', 400));
    }
    const room = await store.load(code);
    if (!room) return errorResponse(fail('roomNotFound', 404));
    const mine = await seatsOf(room, tokensOf(body.tokens));
    if (mine.length === 0) return errorResponse(fail('notInRoom', 403));
    const from = peerOf(room, mine);
    const t = now();
    const peers = freshPeers(await store.voicePeers(code), t);
    if (from === body.to || !peers.some((p) => p.id === from) || !peers.some((p) => p.id === body.to)) return errorResponse(fail('badRequest', 400));
    const sent = await store.signal(code, { id: 0, from, to: body.to, kind, sdp, at: t } satisfies Signal);
    if (sent === 'missing') return errorResponse(fail('roomNotFound', 404));
    return json({ id: sent.id, now: t });
  }

  // op=signals {code, tokens, after}: the set-up messages sent to this device after id `after`.
  async function signals(code: string, body: Record<string, unknown>): Promise<Response> {
    const room = await store.load(code);
    if (!room) return errorResponse(fail('roomNotFound', 404));
    const mine = await seatsOf(room, tokensOf(body.tokens));
    if (mine.length === 0) return errorResponse(fail('notInRoom', 403));
    const after = typeof body.after === 'number' && Number.isInteger(body.after) && body.after >= 0 ? body.after : 0;
    return json({ signals: await store.signals(code, peerOf(room, mine), after), now: now() });
  }

  // op=reclaim {code, seat, tokens?}: take over a disconnected seat (new device or browser).
  async function reclaim(code: string, body: Record<string, unknown>): Promise<Response> {
    if (typeof body.seat !== 'string') return errorResponse(fail('badRequest', 400));
    const { token, hash } = await newToken();
    const presence = await store.presence(code);
    let seatId = '';
    const result = await mutate(code, 'reclaimed', async (room) => {
      const target = room.seats.findIndex((s) => s.id === body.seat);
      if (target < 0) return fail('badRequest', 400);
      seatId = room.seats[target]?.id as string;
      const next = reclaimSeat(room, target, hash, presence, now());
      return isError(next) ? next : { room: next, seat: target };
    });
    if (isError(result)) return errorResponse(result);
    await store.heartbeat(code, [seatId], now());
    return seatResponse(result.room, token, tokensOf(body.tokens), 200, seatId);
  }

  // op=host {code, token, op, seat}: host controls: playFor, stopPlayingFor, remove.
  async function host(code: string, body: Record<string, unknown>): Promise<Response> {
    if (typeof body.seat !== 'string') return errorResponse(fail('badRequest', 400));
    const presence = await store.presence(code);
    const op = body.hostOp;
    const kind: UpdateKind = op === 'remove' ? 'removed' : op === 'playFor' ? 'playFor' : 'returned';
    const result = await mutate(code, kind, async (room) => {
      const s = await callerSeat(room, body.token);
      if (isError(s)) return s;
      const target = room.seats.findIndex((x) => x.id === body.seat);
      if (target < 0) return fail('badRequest', 400);
      const done = hostControl(room, s, op, target, presence, now());
      return isError(done) ? done : { room: done.room, events: done.events, seat: target };
    });
    if (isError(result)) return errorResponse(result);
    return json(update(result.room, result.entry));
  }

  // op=chat {code, token, text | stamp}: a chat message or a stamp from the caller's seat (spec
  // section 18). It is kept beside the game and never changes the room's version.
  async function chat(code: string, body: Record<string, unknown>): Promise<Response> {
    const room = await store.load(code);
    if (!room) return errorResponse(fail('roomNotFound', 404));
    const s = await callerSeat(room, body.token);
    if (isError(s)) return errorResponse(s);
    const t = now();
    const message = chatMessage(room, s, { text: body.text, stamp: body.stamp }, t);
    if (isError(message)) return errorResponse(message);
    const stamp = message.stamp !== null;
    const sent = await store.chat(code, message, `${message.seatId}:${stamp ? 'stamp' : 'text'}`, t, stamp ? STAMP_GAP_MS : CHAT_GAP_MS);
    if (sent === 'missing') return errorResponse(fail('roomNotFound', 404));
    if (sent === 'slow') return errorResponse(fail('slowDown', 429));
    return json({ message: sent, now: t });
  }

  // GET /api/room?code=ABCD[&since=N][&chat=M]: the room. With `since` (polling) it is one store
  // call and brings the log entries after N (events only; the view is the latest one), and with
  // `chat` the chat messages after id M.
  async function getRoom(url: URL): Promise<Response> {
    const code = codeOf(url.searchParams.get('code'));
    if (!code) return errorResponse(fail('badRequest', 400));
    const sinceRaw = url.searchParams.get('since');
    if (sinceRaw !== null) {
      const since = Number(sinceRaw);
      const found = await store.since(code, Number.isInteger(since) ? since : -1);
      if (!found.room) return errorResponse(fail('roomNotFound', 404));
      const chatAfter = url.searchParams.get('chat');
      const chat = chatAfter !== null ? await store.chatSince(code, cursorOf(chatAfter, 0)) : undefined;
      const voicePeers = url.searchParams.get('voice') === '1' ? freshPeers(await store.voicePeers(code), now()) : undefined;
      return json({
        view: viewOf(found.room),
        updates: found.entries === 'gap' ? null : found.entries,
        ...(chat ? { chat } : {}),
        ...(voicePeers ? { voice: voicePeers } : {}),
        now: now(),
      });
    }
    const room = await store.load(code);
    // probe=1 (the start screen's rejoin check) answers a missing room with 200 and no view, so an
    // expired room is not an error in the browser's console.
    if (!room) return url.searchParams.get('probe') === '1' ? json({ view: null, now: now() }) : errorResponse(fail('roomNotFound', 404));
    return json({ view: viewOf(room), presence: await store.presence(code), now: now() });
  }

  async function post(req: Request, url: URL): Promise<Response> {
    const body = await readBody(req);
    if (!body) return errorResponse(fail('badRequest', 400));
    const op = url.searchParams.get('op') ?? body.op;
    if (op === 'create') return create(body);
    const code = codeOf(body.code);
    if (!code) return errorResponse(fail('badRequest', 400));
    switch (op) {
      case 'join':
        return join(code, body);
      case 'seat':
        return seatChange(code, body, 'seat', (room, s) => updateSeat(room, s, { name: body.name, color: body.color }, now()));
      case 'leave':
        return seatChange(code, body, 'left', (room, s) => removeSeat(room, s, now()));
      case 'settings':
        return seatChange(code, body, 'settings', (room, s) =>
          s === room.host ? changeSettings(room, body.settings, now()) : fail('notHost', 403),
        );
      case 'start':
        return start(code, body);
      case 'action':
        return action(code, body);
      case 'heartbeat':
        return heartbeat(code, body);
      case 'reclaim':
        return reclaim(code, body);
      case 'host':
        return host(code, body);
      case 'chat':
        return chat(code, body);
      case 'voice':
        return voice(code, body);
      case 'signal':
        return signal(code, body);
      case 'signals':
        return signals(code, body);
      default:
        return errorResponse(fail('badRequest', 400));
    }
  }

  // GET /api/stream?code=ABCD&since=N[&chat=M]: Server-Sent Events. Every version after N exactly
  // once, in order (a catch-up batch sends the view only with its last entry), then live versions.
  // The browser reconnects by itself with Last-Event-ID (the last version it saw) when the response
  // ends, which it does before the platform's time limit. Chat messages after id M arrive as `chat`
  // events with no id (the event id is always a version): the backlog first, then live ones, which
  // come straight from the announcement without reading the store.
  async function stream(req: Request, url: URL): Promise<Response> {
    const code = codeOf(url.searchParams.get('code'));
    if (!code) return errorResponse(fail('badRequest', 400));
    const fromHeader = req.headers.has('last-event-id') ? Number(req.headers.get('last-event-id')) : NaN;
    const fromQuery = Number(url.searchParams.get('since') ?? NaN);
    let since = Number.isInteger(fromHeader) ? fromHeader : Number.isInteger(fromQuery) ? fromQuery : 0;
    let chatAfter = cursorOf(url.searchParams.get('chat'), 0);
    if (!(await store.load(code))) return errorResponse(fail('roomNotFound', 404));
    const abort = new AbortController();
    req.signal?.addEventListener('abort', () => abort.abort());
    const encoder = new TextEncoder();
    const deadline = now() + streamMs;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (text: string) => {
          if (!abort.signal.aborted) controller.enqueue(encoder.encode(text));
        };
        let dirty = true;
        let chatDirty = true;
        let voiceDirty = true;
        const notices: Notice[] = [];
        let broken = false;
        let wake: (() => void) | null = null;
        abort.signal.addEventListener('abort', () => wake?.());
        const sendChat = (messages: ChatMessage[]) => {
          if (messages.length === 0) return;
          send(`event: chat\ndata: ${JSON.stringify({ messages })}\n\n`);
          chatAfter = Math.max(chatAfter, ...messages.map((m) => m.id));
        };
        try {
          // Listen first, then read: a commit in between is never missed.
          await store.watch(
            code,
            abort.signal,
            (message) => {
              if (/^\d+$/.test(message)) dirty = true;
              else {
                try {
                  notices.push(JSON.parse(message) as Notice);
                } catch {
                  chatDirty = true;
                }
              }
              wake?.();
            },
            () => {
              broken = true;
              wake?.();
            },
          );
          send(`retry: 1000\n\n`);
          let lastRead = 0;
          while (!abort.signal.aborted && !broken && now() < deadline) {
            // Announced chat goes straight out; one that skips an id means a message was missed, so read.
            // Voice lists and signal notices are relayed as they come (a signal's content is fetched
            // by its receiver with its seat).
            for (const notice of notices.splice(0)) {
              if (notice.k === 'voice') {
                send(`event: voice\ndata: ${JSON.stringify({ peers: notice.peers })}\n\n`);
                voiceDirty = false;
              } else if (notice.k === 'signal') {
                send(`event: signal\ndata: ${JSON.stringify({ to: notice.to, id: notice.id })}\n\n`);
              } else if (notice.k === 'chat' && notice.m.id > chatAfter) {
                if (notice.m.id === chatAfter + 1 && !chatDirty) sendChat([notice.m]);
                else chatDirty = true;
              }
            }
            if (voiceDirty) {
              voiceDirty = false;
              send(`event: voice\ndata: ${JSON.stringify({ peers: freshPeers(await store.voicePeers(code), now()) })}\n\n`);
            }
            if (chatDirty) {
              chatDirty = false;
              const found = await store.chatSince(code, chatAfter);
              if (found.last < chatAfter) chatAfter = 0;
              sendChat(found.messages.filter((m) => m.id > chatAfter));
            }
            if (dirty || now() - lastRead >= recheckMs) {
              if (!dirty) {
                chatDirty = true;
                voiceDirty = true;
              }
              dirty = false;
              lastRead = now();
              const found = await store.since(code, since);
              if (!found.room) break;
              if (found.entries === 'gap') {
                // Too far behind (or the room was replaced): one snapshot of the latest version.
                send(`id: ${found.room.version}\nevent: snapshot\ndata: ${JSON.stringify({ v: found.room.version, view: viewOf(found.room) })}\n\n`);
                since = found.room.version;
              } else if (found.entries.length > 0) {
                const entries = found.entries;
                entries.forEach((entry, i) => {
                  const payload: RoomUpdate = i === entries.length - 1 ? { ...entry, view: viewOf(found.room as Room) } : entry;
                  send(`id: ${entry.v}\nevent: update\ndata: ${JSON.stringify(payload)}\n\n`);
                });
                since = entries[entries.length - 1]?.v ?? since;
              }
              continue;
            }
            const waitMs = Math.max(0, Math.min(pingMs, deadline - now()));
            const woke = await new Promise<boolean>((resolve) => {
              const timer = setTimeout(() => {
                wake = null;
                resolve(false);
              }, waitMs);
              wake = () => {
                clearTimeout(timer);
                wake = null;
                resolve(true);
              };
            });
            if (!woke) send(`: ping\n\n`);
          }
        } catch (error) {
          // Cannot listen (or read): end; the browser reconnects, or falls back to polling.
          if (!abort.signal.aborted) console.error('stream error', error);
        }
        if (!abort.signal.aborted) {
          send(`event: bye\ndata: {}\n\n`);
          controller.close();
        }
        abort.abort();
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  }

  return async function api(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    try {
      if (req.method === 'GET' && path === '/api/health') return json({ ok: true, store: store.name, now: now() });
      if (path === '/api/room' && req.method === 'GET') return await getRoom(url);
      if (path === '/api/room' && req.method === 'POST') return await post(req, url);
      if (path === '/api/stream' && req.method === 'GET') return await stream(req, url);
      return json({ error: 'notFound' }, 404);
    } catch (error) {
      console.error('api error', error);
      return json({ error: 'server' }, 500);
    }
  };
}

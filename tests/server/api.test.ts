// The online API (spec section 17): room lifecycle, the checks before an action is applied,
// compare-and-set under concurrency, reconnection, host handover and host controls, one device with
// two seats, and a resumable stream that delivers missed events exactly once.
// It always runs on MemoryStore. With UPSTASH_TEST_URL and UPSTASH_TEST_TOKEN set (for example the
// serverless-redis-http emulator in front of a real Redis, see CLAUDE.md) it also runs on UpstashStore.
import { Redis } from '@upstash/redis';
import { beforeAll, describe, expect, test } from 'vitest';
import { decisionMaker, legalActions, type Action, type GameState } from '../../src/engine';
import { PLAYER_COLORS } from '../../src/data/players';
import { createApi } from '../../server/api';
import { MemoryStore } from '../../server/memoryStore';
import { PRESENCE_TIMEOUT_MS, ROOM_TTL_SECONDS, type RoomView } from '../../server/room';
import type { RoomStore } from '../../server/store';
import { UpstashStore } from '../../server/upstashStore';

interface StoreCase {
  name: string;
  make: (clock: { t: number }) => RoomStore;
  /** Drops log entries before `keepFrom` (as trimming would). */
  trim: (store: RoomStore, code: string, keepFrom: number) => Promise<void>;
  /** Expiry can be tested by moving the clock (MemoryStore) or only checked as a TTL (Redis). */
  ttl: (store: RoomStore, code: string, clock: { t: number }) => Promise<void>;
}

const upstashUrl = process.env.UPSTASH_TEST_URL;
const upstashToken = process.env.UPSTASH_TEST_TOKEN;

const CASES: StoreCase[] = [
  {
    name: 'MemoryStore',
    make: (clock) => new MemoryStore(() => clock.t),
    trim: async (store, code, keepFrom) => (store as MemoryStore).trimLog(code, keepFrom),
    ttl: async (store, code, clock) => {
      clock.t += ROOM_TTL_SECONDS * 1000 + 1;
      expect(await store.load(code)).toBeNull();
    },
  },
  ...(upstashUrl && upstashToken
    ? [
        {
          name: 'UpstashStore',
          make: () => new UpstashStore({ url: upstashUrl, token: upstashToken }),
          trim: async (_store: RoomStore, code: string, keepFrom: number) => {
            const redis = new Redis({ url: upstashUrl, token: upstashToken });
            const last = Number(await redis.get(`gm:{${code}}:v`));
            await redis.ltrim(`gm:{${code}}:log`, -(last - keepFrom + 1), -1);
          },
          ttl: async (_store: RoomStore, code: string) => {
            const redis = new Redis({ url: upstashUrl, token: upstashToken });
            for (const key of ['room', 'v', 'log', 'seen']) {
              const ttl = await redis.ttl(`gm:{${code}}:${key}`);
              expect(ttl, key).toBeGreaterThan(ROOM_TTL_SECONDS - 120);
              expect(ttl, key).toBeLessThanOrEqual(ROOM_TTL_SECONDS);
            }
          },
        } satisfies StoreCase,
      ]
    : []),
];

interface Harness {
  call: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
  clock: { t: number };
  store: RoomStore;
  storeCase: StoreCase;
  api: ReturnType<typeof createApi>;
}

let currentCase: StoreCase = CASES[0] as StoreCase;

/** Points harness() at this store for the tests of one describe.each block. */
function beforeAllCase(storeCase: StoreCase): void {
  beforeAll(() => {
    currentCase = storeCase;
  });
}

function harness(): Harness {
  const clock = { t: Date.now() };
  const store = currentCase.make(clock);
  const api = createApi({ store, now: () => clock.t, streamMs: 60_000, pingMs: 50 });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await api(
      new Request(`http://test${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, clock, store, storeCase: currentCase, api };
}

/** Creates a room with `names.length` seats (first is host) and returns their tokens. */
async function lobby(h: Harness, names: string[]): Promise<{ code: string; tokens: string[] }> {
  const created = await h.call('POST', '/api/room?op=create', { name: names[0] });
  expect(created.status).toBe(201);
  const code = created.body.code as string;
  const tokens = [created.body.token as string];
  for (const name of names.slice(1)) {
    const joined = await h.call('POST', '/api/room?op=join', { code, name });
    expect(joined.status).toBe(200);
    tokens.push(joined.body.token);
  }
  return { code, tokens };
}

async function started(h: Harness, names: string[], settings: Record<string, unknown> = {}) {
  const room = await lobby(h, names);
  if (Object.keys(settings).length) {
    expect((await h.call('POST', '/api/room?op=settings', { code: room.code, token: room.tokens[0], settings })).status).toBe(200);
  }
  const start = await h.call('POST', '/api/room?op=start', { code: room.code, token: room.tokens[0] });
  expect(start.status).toBe(200);
  return { ...room, view: start.body.view as RoomView };
}

async function view(h: Harness, code: string): Promise<RoomView> {
  return (await h.call('GET', `/api/room?code=${code}`)).body.view;
}

/** A legal action for the player who must decide now (no trades: they need an offer). */
function nextAction(game: GameState, pick = 0): Action {
  const legal = legalActions(game).filter((a) => a.type !== 'proposeTrade') as Action[];
  return legal[pick % legal.length] as Action;
}

async function act(h: Harness, code: string, tokens: string[], v: RoomView, action?: Action) {
  const game = v.game as GameState;
  const who = decisionMaker(game) as number;
  return h.call('POST', '/api/room?op=action', { code, token: tokens[who], action: action ?? nextAction(game), expectedVersion: v.version });
}

describe.each(CASES)('$name', (storeCase) => {
  beforeAllCase(storeCase);

  describe('rooms and lobby', () => {
    test('lifecycle: create, join, settings, start, play to the end, expire after 48 hours', async () => {
      const h = harness();
      const { code, tokens } = await lobby(h, ['Mia', 'Leo', 'Aung']);
      let v = await view(h, code);
      expect(v.status).toBe('lobby');
      expect(v.seats.map((s) => s.name)).toEqual(['Mia', 'Leo', 'Aung']);
      expect(new Set(v.seats.map((s) => s.color)).size).toBe(3);
      expect(v.host).toBe(0);

      // Only the host changes settings or starts.
      expect((await h.call('POST', '/api/room?op=settings', { code, token: tokens[1], settings: { roundLimit: 2 } })).status).toBe(403);
      expect((await h.call('POST', '/api/room?op=start', { code, token: tokens[1] })).status).toBe(403);
      const set = await h.call('POST', '/api/room?op=settings', { code, token: tokens[0], settings: { roundLimit: 2, startingMoney: 5000, mode: 'quick' } });
      expect(set.body.view.settings).toMatchObject({ roundLimit: 2, startingMoney: 5000 });

      const start = await h.call('POST', '/api/room?op=start', { code, token: tokens[0] });
      expect(start.status).toBe(200);
      v = start.body.view;
      expect(v.status).toBe('playing');
      const game = v.game as GameState;
      expect(game.players.map((p) => p.name)).toEqual(['Mia', 'Leo', 'Aung']);
      expect(game.players.map((p) => p.color)).toEqual(v.seats.map((s) => s.color));
      expect(game.meta.settings).toMatchObject({ passDevice: false, startingMoney: 5000, roundLimit: 2 });
      expect(game.flow.phase).toBe('AwaitRoll');
      // Nobody can join a started game.
      expect((await h.call('POST', '/api/room?op=join', { code, name: 'Late' })).status).toBe(409);

      for (let i = 0; i < 3000 && v.status === 'playing'; i++) {
        const res = await act(h, code, tokens, v, nextAction(v.game as GameState, i));
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.v).toBe(v.version + 1);
        v = res.body.view;
      }
      expect(v.status).toBe('over');
      expect(v.game?.flow.phase).toBe('GameOver');

      await h.storeCase.ttl(h.store, code, h.clock);
    });

    test('the view never carries tokens, the seed, the generator state or the deck order', async () => {
      const h = harness();
      const { code, tokens, view: v } = await started(h, ['Mia', 'Leo']);
      const text = JSON.stringify(await h.call('GET', `/api/room?code=${code}`));
      for (const t of tokens) expect(text).not.toContain(t);
      expect(text).not.toContain('tokenHash');
      const room = await h.store.load(code);
      expect(room?.game?.meta.seed).not.toBe(0);
      expect(v.game?.meta.seed).toBe(0);
      expect(v.game?.meta.rngState).toBe(0);
      expect(v.game?.decks.chanceDeck).toEqual([]);
      expect(text).not.toContain(`"rngState":${room?.game?.meta.rngState}`);
    });

    test('colours: a free colour can be picked, another seat’s colour is refused', async () => {
      const h = harness();
      const { code, tokens } = await lobby(h, ['Mia', 'Leo']);
      const v = await view(h, code);
      const taken = v.seats[1]?.color;
      expect((await h.call('POST', '/api/room?op=seat', { code, token: tokens[0], color: taken })).body.error).toBe('colorTaken');
      const free = PLAYER_COLORS.find((c) => !v.seats.some((s) => s.color === c)) as string;
      const ok = await h.call('POST', '/api/room?op=seat', { code, token: tokens[0], color: free, name: '  Mia K ' });
      expect(ok.status).toBe(200);
      expect(ok.body.view.seats[0]).toMatchObject({ color: free, name: 'Mia K' });
    });

    test('six seats at most; two needed to start; leaving frees a seat and keeps a host', async () => {
      const h = harness();
      const { code, tokens } = await lobby(h, ['A', 'B', 'C', 'D', 'E', 'F']);
      expect((await h.call('POST', '/api/room?op=join', { code, name: 'G' })).body.error).toBe('full');
      for (const t of tokens.slice(1)) expect((await h.call('POST', '/api/room?op=leave', { code, token: t })).status).toBe(200);
      expect((await h.call('POST', '/api/room?op=start', { code, token: tokens[0] })).body.error).toBe('notEnoughPlayers');
      expect((await h.call('POST', '/api/room?op=leave', { code, token: tokens[0] })).status).toBe(200);
      const v = await view(h, code);
      expect(v.seats).toEqual([]);
    });

    test('one device can hold two seats (two people on one laptop)', async () => {
      const h = harness();
      const created = await h.call('POST', '/api/room?op=create', { name: 'Mia' });
      const code = created.body.code;
      const first = created.body.token;
      const second = await h.call('POST', '/api/room?op=join', { code, name: 'Leo', tokens: [first] });
      expect(second.body.you).toEqual([0, 1]);
      const far = await h.call('POST', '/api/room?op=join', { code, name: 'Aung' });
      expect(far.body.you).toEqual([2]);
      const beat = await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [first, second.body.token] });
      expect(beat.body.you).toEqual([0, 1]);
      await h.call('POST', '/api/room?op=start', { code, token: first });
      // The laptop plays seat 0's roll with seat 0's token, and not with seat 1's.
      const v = await view(h, code);
      expect((await h.call('POST', '/api/room?op=action', { code, token: second.body.token, action: { type: 'roll' }, expectedVersion: v.version })).body.error).toBe('notYourTurn');
      expect((await h.call('POST', '/api/room?op=action', { code, token: first, action: { type: 'roll' }, expectedVersion: v.version })).status).toBe(200);
    });
  });

  describe('actions are checked before they are applied', () => {
    test('wrong seat, unknown token, illegal action, debug and settings are rejected; nothing changes', async () => {
      const h = harness();
      const { code, tokens, view: v } = await started(h, ['Mia', 'Leo']);
      const roll = { type: 'roll' };
      expect((await h.call('POST', '/api/room?op=action', { code, token: tokens[1], action: roll, expectedVersion: v.version })).body.error).toBe('notYourTurn');
      expect((await h.call('POST', '/api/room?op=action', { code, token: 'f'.repeat(64), action: roll, expectedVersion: v.version })).body.error).toBe('notInRoom');
      const illegal = await h.call('POST', '/api/room?op=action', { code, token: tokens[0], action: { type: 'endTurn' }, expectedVersion: v.version });
      expect(illegal.status).toBe(422);
      expect(illegal.body.error).toBe('illegal');
      const buy = await h.call('POST', '/api/room?op=action', { code, token: tokens[0], action: { type: 'buy' }, expectedVersion: v.version });
      expect(buy.body.error).toBe('illegal');
      for (const action of [
        { type: 'debug', op: 'setNextDice', dice: [6, 6] },
        { type: 'setAnimationSpeed', speed: 'off' },
        { type: 'setPassDevice', on: true },
        { type: 'removePlayer', player: 1 },
      ]) {
        const res = await h.call('POST', '/api/room?op=action', { code, token: tokens[0], action, expectedVersion: v.version });
        expect(res.status, action.type).toBe(422);
      }
      expect((await view(h, code)).version).toBe(v.version);
    });

    test('a stale version is rejected', async () => {
      const h = harness();
      const { code, tokens, view: v } = await started(h, ['Mia', 'Leo']);
      const stale = await h.call('POST', '/api/room?op=action', { code, token: tokens[0], action: { type: 'roll' }, expectedVersion: v.version - 1 });
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({ error: 'stale', version: v.version });
    });

    test('two simultaneous actions: exactly one wins, the other changes nothing', async () => {
      const h = harness();
      const { code, tokens, view: v } = await started(h, ['Mia', 'Leo']);
      const send = () => h.call('POST', '/api/room?op=action', { code, token: tokens[0], action: { type: 'roll' }, expectedVersion: v.version });
      const results = await Promise.all([send(), send(), send()]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      const after = await view(h, code);
      expect(after.version).toBe(v.version + 1);
      expect(after.game?.meta.log.filter((e) => e.event.type === 'diceRolled')).toHaveLength(1);
    });
  });

  describe('connections', () => {
    test('reconnecting with the stored token restores the seat; a disconnected seat can be reclaimed', async () => {
      const h = harness();
      const { code, tokens } = await started(h, ['Mia', 'Leo']);
      expect((await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[1]] })).body.you).toEqual([1]);
      // Leo is still connected: nobody can take the seat.
      const seatId = (await view(h, code)).seats[1]?.id;
      expect((await h.call('POST', '/api/room?op=reclaim', { code, seat: seatId })).body.error).toBe('seatConnected');
      // 45 seconds without a heartbeat: the seat shows as disconnected and can be taken over.
      h.clock.t += PRESENCE_TIMEOUT_MS + 1;
      await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[0]] });
      const taken = await h.call('POST', '/api/room?op=reclaim', { code, seat: seatId });
      expect(taken.status).toBe(200);
      expect(taken.body.you).toEqual([1]);
      // The old token no longer works; the new one does.
      expect((await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[1]] })).status).toBe(403);
      expect((await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [taken.body.token] })).body.you).toEqual([1]);
    });

    test('a disconnected host hands over to the next connected player', async () => {
      const h = harness();
      const { code, tokens } = await started(h, ['Mia', 'Leo', 'Aung']);
      h.clock.t += 30_000;
      await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[2]] });
      h.clock.t += 20_000; // Mia (host) last seen 50 s ago, Leo 50 s ago, Aung 20 s ago
      const beat = await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[2]] });
      expect(beat.body.host).toBe(2);
      const v = await view(h, code);
      expect(v.host).toBe(2);
    });

    test('the host can play for a disconnected player until they return, or remove them', async () => {
      const h = harness();
      const { code, tokens } = await started(h, ['Mia', 'Leo', 'Aung'], { mode: 'normal' });
      let v = await view(h, code);
      const leo = v.seats[1]?.id;
      // Not while Leo is connected.
      expect((await h.call('POST', '/api/room?op=host', { code, token: tokens[0], hostOp: 'playFor', seat: leo })).body.error).toBe('seatConnected');
      h.clock.t += PRESENCE_TIMEOUT_MS + 1;
      await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[0], tokens[2]] });
      expect((await h.call('POST', '/api/room?op=host', { code, token: tokens[2], hostOp: 'playFor', seat: leo })).body.error).toBe('notHost');
      const play = await h.call('POST', '/api/room?op=host', { code, token: tokens[0], hostOp: 'playFor', seat: leo });
      expect(play.status).toBe(200);
      expect(play.body.view.seats[1].proxy).toBe(0);
      // Play Mia's turn to the end, then the host acts for Leo with the host's own token.
      v = play.body.view;
      for (let i = 0; i < 40 && decisionMaker(v.game as GameState) === 0; i++) {
        const res = await act(h, code, tokens, v, nextAction(v.game as GameState, 0));
        v = res.body.view;
      }
      expect(decisionMaker(v.game as GameState)).toBe(1);
      const forLeo = await h.call('POST', '/api/room?op=action', { code, token: tokens[0], action: nextAction(v.game as GameState), expectedVersion: v.version });
      expect(forLeo.status).toBe(200);
      // Leo returns: the heartbeat ends the proxy.
      await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[1]] });
      v = await view(h, code);
      expect(v.seats[1]?.proxy).toBeNull();

      // Aung goes quiet and is removed: bankrupt to the bank, the game goes on (Normal mode).
      h.clock.t += PRESENCE_TIMEOUT_MS + 1;
      await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[0], tokens[1]] });
      const removed = await h.call('POST', '/api/room?op=host', { code, token: tokens[0], hostOp: 'remove', seat: v.seats[2]?.id });
      expect(removed.status).toBe(200);
      expect(removed.body.view.seats[2].removed).toBe(true);
      expect(removed.body.view.game.players[2].bankrupt).toBe(true);
      expect(removed.body.events.map((e: { type: string }) => e.type)).toContain('playerRemoved');
      // The removed seat's token no longer acts or heartbeats.
      expect((await h.call('POST', '/api/room?op=heartbeat', { code, tokens: [tokens[2]] })).status).toBe(403);
    });
  });

  describe('the live stream', () => {
    /** Reads SSE frames from a stream response until `count` update/snapshot frames arrived. */
    async function readFrames(res: Response, count: number, timeoutMs = 3000) {
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      const frames: { id: number | null; event: string; data: any }[] = [];
      let buffer = '';
      const deadline = Date.now() + timeoutMs;
      while (frames.filter((f) => f.event !== 'ping').length < count && Date.now() < deadline) {
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), deadline - Date.now())),
        ]);
        if (done || !value) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          if (raw.startsWith(':') || raw.startsWith('retry')) continue;
          const id = /^id: (\d+)$/m.exec(raw)?.[1];
          const event = /^event: (\w+)$/m.exec(raw)?.[1] ?? 'message';
          const data = /^data: (.*)$/m.exec(raw)?.[1];
          frames.push({ id: id ? Number(id) : null, event, data: data ? JSON.parse(data) : null });
        }
      }
      await reader.cancel();
      return frames;
    }

    function open(h: Harness, code: string, opts: { since?: number; lastEventId?: number }) {
      const controller = new AbortController();
      const query = opts.since !== undefined ? `&since=${opts.since}` : '';
      const headers: Record<string, string> = opts.lastEventId !== undefined ? { 'last-event-id': String(opts.lastEventId) } : {};
      const res = h.api(new Request(`http://test/api/stream?code=${code}${query}`, { headers, signal: controller.signal }));
      return { res, controller };
    }

    test('resuming delivers every missed version exactly once, then live updates', async () => {
      const h = harness();
      const { code, tokens, view: v0 } = await started(h, ['Mia', 'Leo']);
      // Connected: one live update.
      const first = open(h, code, { since: v0.version });
      let v = (await act(h, code, tokens, v0)).body.view as RoomView;
      const live = await readFrames(await first.res, 1);
      first.controller.abort();
      expect(live.map((f) => f.id)).toEqual([v0.version + 1]);
      expect(live[0]?.data.view.version).toBe(v0.version + 1);

      // Disconnected while two more actions happen.
      for (let i = 0; i < 2; i++) v = (await act(h, code, tokens, v)).body.view;
      // The browser reconnects with Last-Event-ID = the last version it saw.
      const again = open(h, code, { lastEventId: v0.version + 1 });
      const catchUp = await readFrames(await again.res, 2);
      expect(catchUp.map((f) => f.id)).toEqual([v0.version + 2, v0.version + 3]);
      // Only the last frame of a catch-up batch carries the (latest) view; events come with each.
      expect(catchUp[0]?.data.view).toBeUndefined();
      expect(catchUp[1]?.data.view.version).toBe(v0.version + 3);
      for (const f of catchUp) expect(Array.isArray(f.data.events)).toBe(true);
      // Then live again, and nothing is repeated.
      const res = await act(h, code, tokens, v);
      expect(res.status).toBe(200);
      const next = await readFrames(await again.res, 1, 1500).catch(() => []);
      again.controller.abort();
      const seen = [...catchUp, ...next].map((f) => f.id);
      expect(new Set(seen).size).toBe(seen.length);
    });

    test('every version arrives once across reconnects, with the events of each', async () => {
      const h = harness();
      const { code, tokens, view: v0 } = await started(h, ['Mia', 'Leo']);
      let v = v0;
      const received: number[] = [];
      let since = v0.version;
      for (let round = 0; round < 4; round++) {
        const s = open(h, code, { lastEventId: since });
        for (let i = 0; i < 2; i++) v = (await act(h, code, tokens, v)).body.view;
        const frames = await readFrames(await s.res, 2);
        s.controller.abort();
        for (const f of frames) {
          received.push(f.id as number);
          since = f.id as number;
        }
      }
      expect(received).toEqual(Array.from({ length: 8 }, (_, i) => v0.version + 1 + i));
    });

    test('a device too far behind gets one snapshot of the latest version', async () => {
      const h = harness();
      const { code, tokens, view: v0 } = await started(h, ['Mia', 'Leo']);
      let v = v0;
      for (let i = 0; i < 5; i++) v = (await act(h, code, tokens, v)).body.view;
      await h.storeCase.trim(h.store, code, v.version - 1);
      const s = open(h, code, { since: v0.version });
      const frames = await readFrames(await s.res, 1);
      s.controller.abort();
      expect(frames[0]).toMatchObject({ event: 'snapshot', id: v.version });
      expect(frames[0]?.data.view.version).toBe(v.version);
    });

    test('polling: the room with the events after a version, as a fallback for a failed stream', async () => {
      const h = harness();
      const { code, tokens, view: v0 } = await started(h, ['Mia', 'Leo']);
      let v = v0;
      for (let i = 0; i < 3; i++) v = (await act(h, code, tokens, v)).body.view;
      const poll = await h.call('GET', `/api/room?code=${code}&since=${v0.version}`);
      expect(poll.body.view.version).toBe(v.version);
      expect(poll.body.updates.map((u: { v: number }) => u.v)).toEqual([v0.version + 1, v0.version + 2, v0.version + 3]);
      expect(poll.body.updates[0].view).toBeUndefined();
      expect((await h.call('GET', `/api/room?code=${code}`)).body.presence).toBeTruthy();
    });
  });
});

// The client's live connection (src/ui/session/transport.ts) against the real API over HTTP:
// live delivery, resuming across stream restarts without loss or repeats, the polling fallback when
// the stream is blocked or ends at once, the silence watchdog, resync, a room that is gone, and chat.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { decisionMaker, legalActions, type Action, type GameState } from '../../src/engine';
import { CHAT_GAP_MS } from '../../src/online/protocol';
import { RoomTransport, type LinkStatus } from '../../src/ui/session/transport';
import { startLocalServer, type LocalServer } from '../../server/local';
import type { RoomUpdate, RoomView } from '../../server/room';

let server: LocalServer;
let base: string;

beforeAll(async () => {
  // Short stream lifetimes and pings, so restarts and the watchdog happen within a test.
  server = await startLocalServer({ api: { streamMs: 400, pingMs: 100, recheckMs: 60_000 } });
  base = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

async function post(op: string, body: unknown): Promise<any> {
  const res = await fetch(`${base}/api/room?op=${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

async function startedRoom(): Promise<{ code: string; tokens: string[]; view: RoomView }> {
  const a = await post('create', { name: 'Mia' });
  const b = await post('join', { code: a.code, name: 'Leo' });
  const s = await post('start', { code: a.code, token: a.token });
  return { code: a.code, tokens: [a.token, b.token], view: s.view };
}

async function play(code: string, tokens: string[], view: RoomView): Promise<RoomView> {
  const game = view.game as GameState;
  const action = legalActions(game).find((a) => a.type !== 'proposeTrade') as Action;
  const res = await post('action', { code, token: tokens[decisionMaker(game) as number], action, expectedVersion: view.version });
  expect(res.v, JSON.stringify(res)).toBe(view.version + 1);
  return res.view;
}

function collector() {
  const versions: number[] = [];
  const statuses: LinkStatus[] = [];
  let latest: RoomView | null = null;
  return {
    versions,
    statuses,
    latest: () => latest,
    handlers: {
      updates(entries: RoomUpdate[], view: RoomView) {
        for (const e of entries) versions.push(e.v);
        latest = view;
      },
      status(s: LinkStatus) {
        statuses.push(s);
      },
    },
  };
}

async function until(check: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('room transport', () => {
  test('live: every new version arrives once, in order, with the view', async () => {
    const room = await startedRoom();
    const c = collector();
    // Streams end every 400 ms on this test server, which would otherwise count as failing.
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base, minStreamMs: 0 });
    t.start();
    await until(() => t.status === 'live');
    let v = room.view;
    for (let i = 0; i < 4; i++) v = await play(room.code, room.tokens, v);
    await until(() => c.latest()?.version === v.version);
    t.stop();
    expect(c.versions).toEqual([1, 2, 3, 4].map((k) => room.view.version + k));
    expect(c.statuses[0]).toBe('live');
  });

  test('the stream ends every 400 ms here and resumes from the last version: no loss, no repeats', async () => {
    const room = await startedRoom();
    const c = collector();
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base, minStreamMs: 0 });
    t.start();
    let v = room.view;
    for (let i = 0; i < 6; i++) {
      v = await play(room.code, room.tokens, v);
      await new Promise((r) => setTimeout(r, 150)); // spread over several stream lifetimes
    }
    await until(() => c.latest()?.version === v.version);
    t.stop();
    expect(c.versions).toEqual(Array.from({ length: 6 }, (_, k) => room.view.version + 1 + k));
  });

  test('a blocked stream falls back to polling every 2 s, and nothing is missed', async () => {
    const room = await startedRoom();
    const c = collector();
    const blocked: typeof fetch = (input, init) =>
      String(input).includes('/api/stream') ? Promise.reject(new TypeError('blocked')) : fetch(input, init);
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base, fetch: blocked, pollMs: 200 });
    t.start();
    let v = room.view;
    for (let i = 0; i < 3; i++) v = await play(room.code, room.tokens, v);
    await until(() => c.latest()?.version === v.version);
    expect(t.status).toBe('polling');
    t.stop();
    expect(c.versions).toEqual([1, 2, 3].map((k) => room.view.version + k));
  });

  test('a silent stream trips the watchdog and polling takes over', async () => {
    const room = await startedRoom();
    const c = collector();
    const silent: typeof fetch = (input, init) =>
      String(input).includes('/api/stream')
        ? Promise.resolve(new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/event-stream' } }))
        : fetch(input, init);
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base, fetch: silent, silenceMs: 300, pollMs: 100 });
    t.start();
    const v = await play(room.code, room.tokens, room.view);
    await until(() => c.latest()?.version === v.version);
    expect(t.status).toBe('polling');
    t.stop();
  });

  test('a stream that ends at once is not reopened in a loop: polling takes over', async () => {
    const room = await startedRoom();
    const c = collector();
    let opened = 0;
    const ending: typeof fetch = (input, init) => {
      if (!String(input).includes('/api/stream')) return fetch(input, init);
      opened++;
      return Promise.resolve(new Response('event: bye\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    };
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base, fetch: ending, pollMs: 100 });
    t.start();
    const v = await play(room.code, room.tokens, room.view);
    await until(() => c.latest()?.version === v.version);
    expect(t.status).toBe('polling');
    expect(opened).toBe(1);
    t.stop();
  });

  test('chat arrives once each, on the stream and through polling when the stream is blocked', async () => {
    const room = await startedRoom();
    const say = async (seat: number, text: string) => {
      const res = await post('chat', { code: room.code, token: room.tokens[seat], text });
      expect(res.message?.text).toBe(text);
    };
    const live: string[] = [];
    const t = new RoomTransport(room.code, room.view.version, { ...collector().handlers, chat: (ms) => live.push(...ms.map((m) => m.text ?? '')) }, { base, minStreamMs: 0 });
    t.start();
    await until(() => t.status === 'live');
    await say(0, 'hello');
    await say(1, 'hi Mia');
    await until(() => live.length === 2);
    t.stop();
    expect(live).toEqual(['hello', 'hi Mia']);

    const blocked: typeof fetch = (input, init) =>
      String(input).includes('/api/stream') ? Promise.reject(new TypeError('blocked')) : fetch(input, init);
    const polled: string[] = [];
    const p = new RoomTransport(room.code, room.view.version, { ...collector().handlers, chat: (ms) => polled.push(...ms.map((m) => m.text ?? '')) }, { base, fetch: blocked, pollMs: 100 });
    p.start();
    await until(() => polled.length === 2);
    // One seat may send a message every CHAT_GAP_MS.
    await new Promise((r) => setTimeout(r, CHAT_GAP_MS));
    await say(0, 'polled');
    await until(() => polled.length === 3);
    await new Promise((r) => setTimeout(r, 300));
    p.stop();
    expect(polled).toEqual(['hello', 'hi Mia', 'polled']);
  });

  test('resync fetches what was missed; a room that is gone is reported', async () => {
    const room = await startedRoom();
    const c = collector();
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base, fetch: (i, n) => (String(i).includes('/api/stream') ? new Promise(() => undefined) : fetch(i, n)) });
    t.start();
    const v = await play(room.code, room.tokens, room.view);
    await t.resync();
    expect(c.latest()?.version).toBe(v.version);
    t.stop();

    const missing = collector();
    const gone = new RoomTransport('ZZZZ', 1, missing.handlers, { base });
    gone.start();
    await until(() => gone.status === 'gone');
    expect(missing.statuses).toContain('gone');
  });
});

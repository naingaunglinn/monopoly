// The client's live connection (src/ui/session/transport.ts) against the real API over HTTP:
// live delivery, resuming across stream restarts without loss or repeats, the polling fallback when
// the stream is blocked, the silence watchdog, resync and a room that is gone.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { decisionMaker, legalActions, type Action, type GameState } from '../../src/engine';
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
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base });
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
    const t = new RoomTransport(room.code, room.view.version, c.handlers, { base });
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

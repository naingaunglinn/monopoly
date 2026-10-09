// npm run smoke -- <url>
// Checks a deployed online game end to end: creates a room, joins two seats, starts the game, plays
// a few actions as the right seat, and confirms both seats (and the live stream) see the same version.
// Then chat and voice (spec section 18): a message reaches the other seat and the stream; two seats
// join voice and a set-up message reaches only its receiver, announced on the stream without content.
// With Vercel Deployment Protection on, set VERCEL_AUTOMATION_BYPASS_SECRET to send the bypass header.
import { decisionMaker, legalActions, type Action, type GameState } from '../src/engine';

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: npm run smoke -- https://your-game.vercel.app');
  process.exit(2);
}

const headers: Record<string, string> = { 'content-type': 'application/json' };
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: HTTP ${res.status}, not JSON: ${text.slice(0, 160)}`);
  }
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(data)}`);
  return data;
}

function step(label: string, detail = ''): void {
  console.log(`ok  ${label}${detail ? `  (${detail})` : ''}`);
}

/** Opens the live stream and collects the versions (and other events) it delivers until `stop` is called. */
function listen(code: string, since: number): { versions: number[]; events: { event: string; data: string }[]; stop: () => void; ready: Promise<void> } {
  const versions: number[] = [];
  const events: { event: string; data: string }[] = [];
  const controller = new AbortController();
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((r) => (markReady = r));
  (async () => {
    const res = await fetch(`${base}/api/stream?code=${code}&since=${since}`, { headers, signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`stream: HTTP ${res.status}`);
    markReady();
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const id = /^id: (\d+)$/m.exec(frame)?.[1];
        if (id) versions.push(Number(id));
        const event = /^event: (\w+)$/m.exec(frame)?.[1];
        if (event) events.push({ event, data: /^data: (.*)$/m.exec(frame)?.[1] ?? '' });
      }
    }
  })().catch((error) => {
    if (!controller.signal.aborted) console.error('stream error:', error.message);
    markReady();
  });
  return { versions, events, stop: () => controller.abort(), ready };
}

async function waitFor(check: () => boolean, what: string): Promise<void> {
  for (let wait = 0; wait < 60 && !check(); wait++) await new Promise((r) => setTimeout(r, 100));
  if (!check()) throw new Error(`${what} did not arrive`);
}

async function main(): Promise<void> {
  console.log(`Smoke test against ${base}`);
  const health = await call('GET', '/api/health');
  step('API reachable', `store: ${health.store}`);
  if (health.store !== 'upstash') console.log('    note: this server keeps rooms in memory (not Upstash)');

  const created = await call('POST', '/api/room?op=create', { name: 'Smoke A' });
  const code: string = created.code;
  const tokens: string[] = [created.token];
  step('room created', code);
  const joined = await call('POST', '/api/room?op=join', { code, name: 'Smoke B' });
  tokens.push(joined.token);
  step('second seat joined', `seats: ${joined.view.seats.length}`);

  const stream = listen(code, joined.view.version);
  await stream.ready;
  const startRes = await call('POST', '/api/room?op=start', { code, token: tokens[0] });
  let version: number = startRes.v;
  let game: GameState = startRes.view.game;
  step('game started', `version ${version}`);

  for (let i = 0; i < 6 && game.flow.phase !== 'GameOver'; i++) {
    const seat = decisionMaker(game) as number;
    const action = legalActions(game).find((a) => a.type !== 'proposeTrade') as Action;
    const res = await call('POST', '/api/room?op=action', { code, token: tokens[seat], action, expectedVersion: version });
    version = res.v;
    game = res.view.game;
    step(`action ${i + 1}: seat ${seat + 1} ${action.type}`, `version ${version}`);
  }

  // A stale or wrong-seat action must be refused.
  const wrong = await fetch(`${base}/api/room?op=action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, token: tokens[0], action: { type: 'roll' }, expectedVersion: version - 1 }),
  });
  if (wrong.status !== 409) throw new Error(`a stale action returned HTTP ${wrong.status}, expected 409`);
  step('stale action refused', 'HTTP 409');

  const [a, b] = await Promise.all(tokens.map((t) => call('POST', '/api/room?op=heartbeat', { code, tokens: [t] })));
  const viewA = await call('GET', `/api/room?code=${code}`);
  if (a.version !== version || b.version !== version || viewA.view.version !== version) {
    throw new Error(`versions differ: seat A ${a.version}, seat B ${b.version}, room ${viewA.view.version}, expected ${version}`);
  }
  step('both seats see the same version', String(version));

  for (let wait = 0; wait < 50 && !stream.versions.includes(version); wait++) await new Promise((r) => setTimeout(r, 100));
  if (!stream.versions.includes(version)) throw new Error(`the live stream did not deliver version ${version} (got ${stream.versions.join(', ')})`);
  const dupes = stream.versions.length - new Set(stream.versions).size;
  if (dupes > 0) throw new Error('the live stream repeated a version');
  step('live stream delivered every version once', `${stream.versions.length} updates`);

  // Chat: a message from seat A reaches seat B by polling and the stream, and the version stays.
  const sent = await call('POST', '/api/room?op=chat', { code, token: tokens[0], text: 'Smoke test message' });
  const poll = await call('GET', `/api/room?code=${code}&since=${version}&chat=0`);
  if (!poll.chat?.messages?.some((m: { id: number }) => m.id === sent.message.id)) throw new Error('the chat message did not come back by polling');
  if (poll.view.version !== version) throw new Error('a chat message changed the game version');
  await waitFor(() => stream.events.some((e) => e.event === 'chat' && e.data.includes('Smoke test message')), 'the chat message on the stream');
  step('chat message delivered', `message ${sent.message.id}`);

  // Voice: both seats join; a set-up message reaches only its receiver; the stream announces it
  // by receiver and id, never with its content.
  const va = await call('POST', '/api/room?op=voice', { code, tokens: [tokens[0]], state: 'join' });
  const vb = await call('POST', '/api/room?op=voice', { code, tokens: [tokens[1]], state: 'join' });
  if (vb.peers.length !== 2) throw new Error(`voice lists ${vb.peers.length} devices, expected 2`);
  const servers = (va.iceServers ?? []) as { urls: string | string[] }[];
  step('voice joined', `${servers.length} connection server${servers.length === 1 ? '' : 's'}: ${servers.flatMap((x) => (Array.isArray(x.urls) ? x.urls : [x.urls])).map((u) => u.split(':')[0]).join(', ') || 'none'}`);
  const signal = await call('POST', '/api/room?op=signal', { code, tokens: [tokens[0]], to: vb.peer, kind: 'offer', sdp: 'v=0 smoke-test-secret' });
  const forB = await call('POST', '/api/room?op=signals', { code, tokens: [tokens[1]], after: 0 });
  const forA = await call('POST', '/api/room?op=signals', { code, tokens: [tokens[0]], after: 0 });
  if (!forB.signals.some((x: { id: number }) => x.id === signal.id)) throw new Error('the set-up message did not reach its receiver');
  if (forA.signals.length > 0) throw new Error('a set-up message reached the wrong device');
  await waitFor(() => stream.events.some((e) => e.event === 'signal' && e.data.includes(String(signal.id))), 'the set-up notice on the stream');
  if (stream.events.some((e) => e.data.includes('smoke-test-secret'))) throw new Error('the stream carried a set-up message itself');
  await call('POST', '/api/room?op=voice', { code, tokens: [tokens[0]], state: 'leave' });
  await call('POST', '/api/room?op=voice', { code, tokens: [tokens[1]], state: 'leave' });
  stream.stop();
  step('voice set-up delivered to its receiver only', `signal ${signal.id}`);
  console.log(`\nSmoke test passed. Room ${code} will expire on its own in 48 hours.`);
}

main().catch((error: Error) => {
  console.error(`\nSmoke test FAILED: ${error.message}`);
  process.exit(1);
});

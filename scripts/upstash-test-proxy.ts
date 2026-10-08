// Test helper: an Upstash-compatible REST endpoint for running the online tests on a real Redis.
// It forwards every command to serverless-redis-http (SRH, Upstash's local emulator) and adds what
// SRH lacks: SUBSCRIBE served as an event stream, the way Upstash serves it over REST
// ("data: subscribe,<channel>,<count>" then "data: message,<channel>,<payload>" lines).
//   tsx scripts/upstash-test-proxy.ts --port 8078 --srh http://localhost:8079 --redis localhost:6380
// See CLAUDE.md, "Testing UpstashStore", for the Docker containers it expects.
import { createServer } from 'node:http';
import { connect } from 'node:net';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const port = Number(arg('port', '8078'));
const srh = arg('srh', 'http://localhost:8079');
const [redisHost, redisPort] = arg('redis', 'localhost:6380').split(':') as [string, string];

/** Minimal RESP reader for pub/sub pushes: arrays of bulk strings and integers. */
function respReader(onPush: (items: (string | number)[]) => void): (chunk: Buffer) => void {
  let buf = Buffer.alloc(0);
  const parse = (at: number): { value: unknown; end: number } | null => {
    const lineEnd = buf.indexOf('\r\n', at);
    if (lineEnd < 0) return null;
    const type = String.fromCharCode(buf[at] as number);
    const head = buf.toString('utf8', at + 1, lineEnd);
    if (type === ':') return { value: Number(head), end: lineEnd + 2 };
    if (type === '+' || type === '-') return { value: head, end: lineEnd + 2 };
    if (type === '$') {
      const len = Number(head);
      if (len < 0) return { value: null, end: lineEnd + 2 };
      if (buf.length < lineEnd + 2 + len + 2) return null;
      return { value: buf.toString('utf8', lineEnd + 2, lineEnd + 2 + len), end: lineEnd + 2 + len + 2 };
    }
    if (type === '*') {
      const n = Number(head);
      const items: unknown[] = [];
      let pos = lineEnd + 2;
      for (let i = 0; i < n; i++) {
        const item = parse(pos);
        if (!item) return null;
        items.push(item.value);
        pos = item.end;
      }
      return { value: items, end: pos };
    }
    throw new Error(`unexpected RESP type ${type}`);
  };
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const item = parse(0);
      if (!item) return;
      buf = buf.subarray(item.end);
      if (Array.isArray(item.value)) onPush(item.value as (string | number)[]);
    }
  };
}

const encodeCommand = (args: string[]) => `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('')}`;

/** Billable commands as Upstash counts them: one per command, each one in a pipeline too. */
const counts: Record<string, number> = {};
const count = (name: string) => {
  counts[name] = (counts[name] ?? 0) + 1;
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://proxy');
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.pathname === '/__counts') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(counts));
    return;
  }
  if (url.pathname === '/__reset') {
    for (const k of Object.keys(counts)) delete counts[k];
    res.writeHead(200).end('{}');
    return;
  }
  if (parts[0] === 'subscribe' && parts[1]) {
    count('SUBSCRIBE');
    const channel = decodeURIComponent(parts.slice(1).join('/'));
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const socket = connect(Number(redisPort), redisHost);
    socket.on('data', respReader((items) => {
      const [kind, ch, payload] = items;
      res.write(`data: ${kind},${ch},${payload}\n\n`);
    }));
    socket.on('error', () => res.end());
    socket.write(encodeCommand(['SUBSCRIBE', channel]));
    res.on('close', () => socket.destroy());
    return;
  }
  // Everything else goes to SRH unchanged.
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString() || 'null') as unknown;
    const commands = parts[0] === 'pipeline' || parts[0] === 'multi-exec' ? (body as unknown[][]) : [body as unknown[]];
    for (const c of commands) if (Array.isArray(c)) count(String(c[0]).toUpperCase());
  } catch {
    // not a command
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && k !== 'host' && k !== 'content-length') headers[k] = v;
  try {
    const upstream = await fetch(`${srh}${url.pathname}${url.search}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.writeHead(502).end(JSON.stringify({ error: String(error) }));
  }
}).listen(port, () => console.log(`Upstash test proxy on http://localhost:${port} (SRH ${srh}, Redis ${redisHost}:${redisPort})`));

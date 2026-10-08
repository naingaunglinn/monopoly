// A small local server for online play without Vercel or Redis: it mounts the same API handlers on
// MemoryStore and, with --static, serves the built client too (one origin, like the deployment).
//   tsx server/local.ts --port 8787              API only (Vite dev server proxies /api to it)
//   tsx server/local.ts --port 4175 --static dist   API and the built game (end-to-end tests)
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApi, type Api, type ApiConfig } from './api.js';
import { MemoryStore } from './memoryStore.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function handleApi(api: Api, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== undefined) headers.set(key, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
    signal: controller.signal,
  });
  const response = await api(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) {
    res.end();
    return;
  }
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      if (controller.signal.aborted) break;
      res.write(chunk);
    }
  } catch {
    // The client went away.
  }
  res.end();
}

async function handleStatic(res: ServerResponse, url: URL, root: string): Promise<void> {
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = resolve(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // A client route: the single-page app handles it.
    file = join(root, 'index.html');
  }
  try {
    const data = await readFile(file);
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const cache = file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache }).end(data);
  } catch {
    res.writeHead(404).end();
  }
}

export interface LocalServer {
  port: number;
  server: Server;
  close: () => Promise<void>;
}

/** Starts the server; port 0 picks a free one. */
export function startLocalServer(options: {
  port?: number;
  staticDir?: string | null;
  api?: Partial<ApiConfig>;
}): Promise<LocalServer> {
  const api = createApi({ store: new MemoryStore(), ...options.api });
  const root = options.staticDir ? resolve(options.staticDir) : null;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const done = url.pathname.startsWith('/api/')
      ? handleApi(api, req, res, url)
      : root
        ? handleStatic(res, url, root)
        : Promise.resolve(void res.writeHead(404).end('Only /api is served here; run with --static dist for the game.'));
    done.catch((error) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  return new Promise((resolveStart) => {
    server.listen(options.port ?? 0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolveStart({
        port,
        server,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

function arg(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

// Run directly: tsx server/local.ts --port 8787 [--static dist]
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(arg('port', process.env.PORT ?? '8787'));
  const staticDir = arg('static');
  const streamMs = Number(process.env.STREAM_MS ?? 270_000);
  startLocalServer({ port, staticDir, api: { streamMs } }).then(({ port: p }) => {
    console.log(`Online game server (MemoryStore) on http://localhost:${p}${staticDir ? ` serving ${resolve(staticDir)}` : ''}`);
  });
}

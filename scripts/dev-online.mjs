// npm run dev:online — the online game locally, with no Vercel and no Redis: the API server on
// MemoryStore (port 8787) and the Vite dev server (port 5173), which proxies /api to it.
import { spawn } from 'node:child_process';

const children = [
  spawn('npx', ['tsx', 'watch', 'server/local.ts', '--port', '8787'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit', env: { ...process.env, API_PROXY: 'http://localhost:8787' } }),
];
const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && stop());

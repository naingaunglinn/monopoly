// The API as Vercel Functions run it: UpstashStore from the Marketplace integration's variables.
// Without them, online play answers 503 with a clear reason instead of keeping rooms in memory
// (function instances never share memory, so rooms would vanish between requests).
import { createApi, type Api } from './api.js';
import { iceServersFromEnv } from './ice.js';
import { UpstashStore, upstashConfig } from './upstashStore.js';

let api: Api | null = null;

export async function handle(request: Request): Promise<Response> {
  if (!api) {
    const config = upstashConfig();
    if (!config) {
      const path = new URL(request.url).pathname;
      const body = path === '/api/health' ? { ok: false, store: 'none' } : { error: 'notConfigured' };
      return new Response(JSON.stringify(body), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    // Voice chat: STUN by default, a TURN relay when its variables are set (DEPLOY.md, step 7).
    api = createApi({ store: new UpstashStore(config), iceServers: () => iceServersFromEnv() });
  }
  return api(request);
}

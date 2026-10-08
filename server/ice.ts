// The servers that help two devices find a way to each other for voice chat (WebRTC ICE servers,
// spec section 18). By default Cloudflare's free STUN server, which tells each device its public
// address. Some networks (many mobile ones among them) also need a TURN relay, which forwards the
// audio when no direct path exists; it is optional (DEPLOY.md):
//   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_KEY_API_TOKEN   short-lived credentials per join
//   TURN_URLS (comma-separated) + TURN_USERNAME + TURN_CREDENTIAL   any other TURN service
import type { IceServer } from '../src/online/protocol.js';

export const STUN: IceServer = { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] };

/** Credentials last this long; a game rarely lasts longer, and a device that rejoins gets new ones. */
const TURN_TTL_SECONDS = 6 * 60 * 60;

/** Port 53 is blocked by browsers; a device waiting for it would only connect later. */
function withoutPort53(servers: IceServer[]): IceServer[] {
  return servers
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length > 0);
}

export async function iceServersFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<IceServer[]> {
  const keyId = env.CLOUDFLARE_TURN_KEY_ID;
  const token = env.CLOUDFLARE_TURN_KEY_API_TOKEN;
  if (keyId && token) {
    try {
      const res = await fetchFn(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
        const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
        const servers = withoutPort53(list);
        if (servers.length > 0) return servers;
      } else {
        console.error('TURN credentials refused', res.status);
      }
    } catch (error) {
      // Voice still works for most networks with STUN alone.
      console.error('TURN credentials failed', error);
    }
  }
  const urls = (env.TURN_URLS ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  if (urls.length > 0 && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    return [STUN, ...withoutPort53([{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }])];
  }
  return [STUN];
}

// Vercel Function: GET /api/room (a room's view, or polling) and POST /api/room?op=... (create,
// join, seats, settings, start, actions, heartbeats, reclaim, host controls). See server/api.ts.
import { handle } from '../server/vercel.js';

export default { fetch: handle };

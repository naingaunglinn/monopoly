// Vercel Function: GET /api/stream, the live updates of a room as Server-Sent Events. A response
// ends before the time limit set in vercel.json; the browser reconnects with Last-Event-ID.
import { handle } from '../server/vercel.js';

export default { fetch: handle };

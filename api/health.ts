// Vercel Function: GET /api/health, used by the smoke script and the start screen.
import { handle } from '../server/vercel.js';

export default { fetch: handle };

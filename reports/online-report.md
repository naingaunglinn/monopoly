# Online play: final report

2026-10-08, branch `milestones`. Spec section 17 describes what was built; decisions D55 to D79 in
`DECISIONS.md` explain the choices. `DEPLOY.md` has the deployment steps.

## What was built

- **Two ways to play.** The start screen offers *Play on this device* (unchanged, fully offline) and
  *Play online*: Create room, Join room, and Rejoin room ABCD when this browser holds a seat.
- **Rooms.** A 4-letter code and a link `/?room=ABCD` (the share sheet on phones). The lobby shows
  names, colours and seats; the host sets the options and starts with 2 to 6 players. One device can
  hold several seats. Rooms expire 48 hours after the last move.
- **The server decides.** Every action is checked: the seat token must control the deciding seat, the
  action must be legal, and `expectedVersion` must match (compare-and-set, so two simultaneous
  actions cannot both win). The seed, the generator state and the deck order never leave the server;
  debug and `?seed` are off online.
- **Live play.** A resumable Server-Sent Events stream (by version), polling every 2 s when the
  stream fails, and a resync when a tab comes back. Other devices watch every move animated at their
  own speed. "Waiting for Leo" replaces buttons that are not yours; your turn brings a banner, a tab
  title and one vibration.
- **Connections.** The seat token stays in this browser, so a refresh or a reopened link restores
  the seat. Heartbeats every 20 s, a Disconnected badge after 45 s, taking over a disconnected seat
  from another device, and for the host *Play for them*, *Remove player* and automatic handover. A
  Reconnecting bar blocks actions; a spinner appears after 300 ms and nothing is sent twice.
- **Phones, in both modes.** A status bar, a board you pinch and pan that follows the moving token,
  double-tap for the whole board, tap a tile for its Focus Card, and a control sheet with the primary
  button always visible, the dice, and tabs (Card, Players, Log, Mine). Panels and dialogs open as
  sheets; targets are 44 px or more; safe areas are respected; the screen stays awake.

## Verification, run on the final code

| Check | Result |
| --- | --- |
| Unit and integration tests (Vitest) | 224 passed, 22 files |
| Type check (`tsc --noEmit`) | clean |
| Browser tests (Playwright, Chromium) | 46 passed, 8 files |
| Simulation (`npm run sim`) | 400 games, no crash, no invariant failure; same results as the committed report |
| `vercel build` | succeeds; the built functions load and answer 503 `notConfigured` without a database |
| `npm run dev:online` | game and API start; `/api/health` through the Vite proxy answers `{"ok":true,"store":"memory"}` |
| `npm run smoke` against `npm run serve:online` | passed (room, two seats, actions, live stream) |

The online API tests (on MemoryStore) cover: the room lifecycle to expiry; views never carrying
tokens, the seed, the generator state or the deck order; colours; seat limits; two seats on one
device; rejection of a wrong seat, an unknown token, an illegal action, debug and settings without
any change; stale versions; two simultaneous actions (exactly one wins); reconnecting and reclaiming
seats; host handover; playing for and removing a player; resuming the stream without loss or
repeats; snapshots for a device too far behind; polling. The transport tests cover live delivery,
stream restarts, a blocked stream, a stream that ends at once, a silent stream (watchdog) and resync.

The browser tests include:

- three devices (1280 × 720, 1024 × 768 and a 390 × 844 phone) playing a Quick game, round limit 5,
  animation Off, to the results with no console errors, the phone closing mid-game and reopening in
  its seat;
- the same game with the live stream blocked, carried by polling;
- live watching with the Your turn banner and tab title, the lobby, and the host's controls;
- the one-device game: full games at Normal and Fast speed, with reduced motion, at 1024 × 768, and
  with the network disabled after loading (no request to `/api`);
- phones: a full Quick game by taps, the gestures, and the primary button on screen with no sideways
  scrolling in every tab, at 360 × 800, 390 × 844 and 844 × 390;
- screenshots at 1280 × 720, 1024 × 768 and 1920 × 1080, and on phones at 360 × 800, 390 × 844 and
  844 × 390 (32 to 39 captures per size, including lobby, waiting and your turn), all audited for
  text under 10 px, page scroll, clipped text, owner markers and overlaps.

**Looked at and fixed.** Reviewing the phone captures showed a decision panel's own buttons below the
fold (Build in the Build panel, Pass when buying), so a player could press Done without seeing them.
They now stay pinned at the bottom of the sheet, and the Buy panel shows the price first (D79).

## Redis (Upstash)

- The same API tests also run on UpstashStore against a real Redis 7, behind serverless-redis-http
  (Upstash's local emulator) and a small proxy that adds SUBSCRIBE in Upstash's REST format: 35 passed
  (15 of them on UpstashStore), on 2026-10-08 at 10:34 UTC. The UpstashStore code has not changed
  since. At 14:21 UTC the current API ran on that Redis to measure usage: about 6 commands per move
  with three devices connected, and about 7 commands a minute per idle connected device.
- These tests were not rerun at the very end: Docker Desktop was not running. With Docker started,
  the commands in `CLAUDE.md` ("Testing UpstashStore against a real Redis") run them.

## Not verified

- **A real Vercel deployment with a real Upstash database**: it needs your accounts. The smoke test
  checks exactly this after you deploy.
- **Upstash's own SUBSCRIBE over REST**: tested only through the emulator and the proxy, which follows
  Upstash's documented format. If SUBSCRIBE fails there, each stream ends at once and browsers poll
  every 2 s instead (retrying the stream every 30 s, never in a loop). If it connects but delivers
  nothing, the server's pings keep the stream open and moves reach the other devices within about
  20 s, through the heartbeat. The smoke test fails loudly in both cases.
- **Real phones**: tested in Chromium with touch emulation. Safari on iOS, Wake Lock, vibration and the
  share sheet were not tried on hardware. Firefox and Safari engines were not run.

## What you do next

1. Push to GitHub and create the Vercel project (`DEPLOY.md` steps 1 and 2). The branch `milestones`
   becomes `main`.
2. Add Upstash Redis from the Vercel Marketplace, connect it to the project, and redeploy (steps 3
   and 4).
3. Check `https://<your-address>/api/health` shows `"store":"upstash"`, then run
   `npm run smoke -- https://<your-address>` (step 5).

# Global Monopoly — working notes for Claude

`docs/SPEC.md` is the single source of truth. Never change prices, the board or the rules.
When something is undefined, pick the simplest option that fits the spec and log it in `DECISIONS.md`.

## Commands

npm is used because pnpm is not installed (see DECISIONS.md).

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | Type-check (`tsc --noEmit`) and build to `dist/` |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm test` | Vitest: engine, data, sim smoke and UI unit tests |
| `npm run test:e2e` | Playwright against `vite preview` (builds first) |
| `npm run sim` | Headless simulation: 200 Quick + 200 Normal seeded games with 4 bots, writes `reports/sim-report.json` |
| `npm run sim -- --quick 10 --normal 4` | A shorter simulation run |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run dev:online` | Online play locally: API on MemoryStore (port 8787) + Vite dev server proxying `/api` |
| `npm run serve:online` | The built game and the API on http://localhost:4175 (build first; used by online e2e) |
| `npm run smoke -- <url>` | End-to-end check of a deployment (room, two seats, actions, stream) |

## Folder layout

```text
src/
  engine/   pure rules: reducer, phases, rent, building, cards, auction, trade, debt, rng,
            legal actions, invariants, save, net worth
  data/     board, countries, cities, airports, companies, chance, events, players, balance (every number)
  ui/       App, screens/, components/, panels/, overlays/, store.ts (app + UI state, dispatch),
            session/ (GameSession: LocalSession runs the engine and autosaves; OnlineSession talks to
            the server), display.ts + animation.ts (event player), sound/ (synthesised effects:
            synth, cues, engine, plan), strings.ts (every UI string), theme.css, hooks.ts
  sim/      bots.ts, runner.ts, cli.ts (`npm run sim`)
server/     online API: room.ts (pure room rules), api.ts (web-standard handlers), store.ts
            (RoomStore), memoryStore.ts, upstashStore.ts, vercel.ts, local.ts (local server)
api/        Vercel Functions (room, stream, health), thin wrappers around server/vercel.ts
scripts/    dev-online.mjs, smoke.ts, upstash-test-proxy.ts
tests/
  engine/   Vitest unit tests for data and engine (+ sim smoke run)
  ui/       Vitest + Testing Library (jsdom): rule guide in every phase, contrast
  server/   Vitest: the online API (MemoryStore, and UpstashStore when configured) and the transport
  e2e/      Playwright specs; fixtures.ts builds states with the engine, audit.ts checks layouts
reports/    sim-report.json (committed), screenshots/ (generated, git-ignored)
docs/       SPEC.md (source of truth)
```

## Codebase rules

- The engine (`src/engine`) is pure: no React, DOM, timers, `Date.now` or `Math.random`.
  A test greps for these. Randomness comes only from the seeded PRNG stored in `state.meta.rngState`.
- `reduce(state, action)` returns `{ state, events, error }`. It never mutates its input.
  Illegal actions return the unchanged state plus a typed error with a plain-language reason.
- `legalActions(state)` is the only source for enabling buttons (UI) and choosing moves (bots).
- The phase set is fixed to exactly 12 values (see `src/engine/types.ts`). Never add a phase;
  extra panels live in `flow.pending` kinds or the `flow.notice` overlay.
- Every number lives in `src/data/balance.ts`. Every UI string lives in `src/ui/strings.ts`.
  Card text, city, airport and company names are data in `src/data/`.
- State must be plain JSON: no `undefined`, no class instances, no Maps. Use `null`.
- No network calls, CDNs or remote assets. Fonts and flags are bundled and inlined at build time.
  Online play talks to the game's own server (section 17); online voice also asks a public STUN
  server for the device's address after the player presses Join voice (D93). Nothing else.
- No emoji anywhere in the interface. Flags are bundled SVGs, icons come from lucide-react,
  tokens, houses and hotels are original inline SVG.
- CSS: plain CSS with custom properties in `src/ui/theme.css`. Animate only transform and opacity.
- Money in the UI always carries a sign and a symbol (`+$500`, `−$300`), tabular numerals.
- Keep the full simulation out of `npm test`; only a small smoke run belongs there.
- The UI never computes rules: buttons are enabled from `legalActions`/`validateAction`, and refusals
  show the engine's reason. Animations replay engine events in `ui/animation.ts`; game state is final
  before they play, and any input finishes them.
- Signal yellow is for the primary button only. Small text uses the AA text shades in `theme.css`.
- Sounds are synthesised in `ui/sound/` (no audio files). Game events get their cue in `plan.ts`
  and play on the animation timeline; a new cue gets a loudness trim in `cues.ts`, measured with
  `renderCue` (the sound spec keeps every cue between -36 and -18 dBFS).
- Animation durations live in `DURATIONS` (`ui/animation.ts`) and the matching CSS keyframes; change
  both together (D51). Owned-tile tints come from `ui/contrast.ts` and are contrast-tested (D54).
- The save has a `schemaVersion` (now 2). A change to the state's shape bumps it and adds a migration
  in `engine/save.ts`, tested against a real save from the previous version in `tests/fixtures/`.
- After UI changes run `npm run test:e2e`: the screenshot spec audits every capture (text under 10px,
  page scroll, clipped text, owner markers, overlaps) at 1280x720, 1024x768 and 1920x1080, plus the
  phone sizes. Playwright clears `test-results/` when it starts: keep logs elsewhere.
- Online (spec section 17): the server is authoritative; never keep room state in function memory.
  Every relative import reachable from `api/` needs an explicit `.js` extension (Vercel runs the
  compiled files as native ES modules); `src/ui` never imports runtime code from `server/` or
  `@upstash/redis` (shared wire types live in `src/online/`).
- The client never runs `reduce`, `parseSave` or `checkInvariants` on an online view (decks are
  hidden), and an online game never touches the local save.
- Chat (spec section 18) never changes a room's version: it has its own store keys and stream
  events (no `id:` line; the event id is always a version). Controls that take input during online
  play (chat, stamps, voice) carry `data-no-skip`, so they never skip the animation that is playing.
- Voice (`session/voice.ts`) is peer to peer; the server only lists peers and passes set-up messages,
  which only their receiver can read. Playwright runs Chromium with a fake microphone
  (`playwright.config.ts`); the local server hands out no ICE servers, so tests stay offline.
- Phones (`PHONE_QUERY` in `ui/hooks.ts`, `screens/PhoneGame.tsx`): the board is the 1280 x 676
  desktop board scaled inside `.board-canvas`, whose CSS pins every board size (media queries see the
  phone). Nothing inside the canvas may use `position: fixed`. The camera lives in a ref, not state.
  Pointer input on `[data-gesture-zone]` does not skip animations. Phone screenshots run at 360x800,
  390x844 and 844x390 with `isMobile` and `hasTouch`; the audit adds phone rules (`{ phone: true }`).

## Testing UpstashStore against a real Redis

```bash
D="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"   # or docker
$D network create gm-test
$D run -d --name gm-redis --network gm-test -p 6380:6379 redis:7-alpine
$D run -d --name gm-srh --network gm-test -p 8079:80 -e SRH_MODE=env -e SRH_TOKEN=gm_local_token \
  -e SRH_CONNECTION_STRING=redis://gm-redis:6379 hiett/serverless-redis-http:latest
npx tsx scripts/upstash-test-proxy.ts --port 8078 &      # adds SUBSCRIBE, which the emulator lacks
UPSTASH_TEST_URL=http://localhost:8078 UPSTASH_TEST_TOKEN=gm_local_token npx vitest run tests/server
```


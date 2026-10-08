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

## Folder layout

```text
src/
  engine/   pure rules: reducer, phases, rent, building, cards, auction, trade, debt, rng,
            legal actions, invariants, save, net worth
  data/     board, countries, cities, airports, companies, chance, events, players, balance (every number)
  ui/       App, screens/, components/, panels/, overlays/, store.ts (app + UI state, dispatch, autosave),
            display.ts + animation.ts (event player), strings.ts (every UI string), theme.css, hooks.ts
  sim/      bots.ts, runner.ts, cli.ts (`npm run sim`)
tests/
  engine/   Vitest unit tests for data and engine (+ sim smoke run)
  ui/       Vitest + Testing Library (jsdom): rule guide in every phase, contrast
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
- No emoji anywhere in the interface. Flags are bundled SVGs, icons come from lucide-react,
  tokens, houses and hotels are original inline SVG.
- CSS: plain CSS with custom properties in `src/ui/theme.css`. Animate only transform and opacity.
- Money in the UI always carries a sign and a symbol (`+$500`, `−$300`), tabular numerals.
- Keep the full simulation out of `npm test`; only a small smoke run belongs there.
- The UI never computes rules: buttons are enabled from `legalActions`/`validateAction`, and refusals
  show the engine's reason. Animations replay engine events in `ui/animation.ts`; game state is final
  before they play, and any input finishes them.
- Signal yellow is for the primary button only. Small text uses the AA text shades in `theme.css`.
- Animation durations live in `DURATIONS` (`ui/animation.ts`) and the matching CSS keyframes; change
  both together (D51). Owned-tile tints come from `ui/contrast.ts` and are contrast-tested (D54).
- The save has a `schemaVersion` (now 2). A change to the state's shape bumps it and adds a migration
  in `engine/save.ts`, tested against a real save from the previous version in `tests/fixtures/`.
- After UI changes run `npm run test:e2e`: the screenshot spec audits every capture (text under 10px,
  page scroll, clipped text, owner markers, overlaps) at 1280x720, 1024x768 and 1920x1080.

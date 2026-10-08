# Global Monopoly

A property board game for 2 to 6 players who share one device. 80 spaces, 42 cities in 16 countries,
10 airports and 8 companies. Runs fully offline in the browser: no account, server or network.

## Run it

Requires Node.js 20 or newer (built and tested with Node 24).

```bash
npm install
npm run build
npm run preview    # http://localhost:4173  (the production build, works offline)
```

For development with hot reload:

```bash
npm run dev        # http://localhost:5173
```

| Script | Purpose |
| --- | --- |
| `npm test` | Vitest: engine rules, data, simulation smoke run, UI tests (rule guide, contrast) |
| `npm run test:e2e` | Playwright: full games through the real UI, animation and offline runs, screenshots |
| `npm run sim` | Headless simulation of 400 seeded bot games; writes `reports/sim-report.json` |
| `npm run typecheck` | TypeScript check only |

URL options: `?seed=123` makes new games reproducible, `?debug=1` adds the debug panel (next dice,
move a player, cash, owners, building levels, next card), and `?rounds=5` sets a short Quick round
limit for testing. Screenshots from `npm run test:e2e` land in `reports/screenshots/`.

## How to play

1. Press **New game**, set the players (or keep the defaults) and press **Start game**.
2. Pass the device to the player named on screen. They press **I'm ready**.
3. The yellow button always shows the next step: **Roll dice**, **Buy**, **Pay**, **OK** or
   **End turn**. Space or Enter presses it.
4. Land on an unowned city, airport or company to buy it. If you pass, everyone can bid for it.
5. Land on someone else's property and pay rent. On cities you can spend a Free Stay token instead.
6. Own every city of a country and its rent doubles. You can then build houses and a hotel, but only
   on the city you have just landed on.
7. Short of money? Sell buildings, mortgage properties or trade with another player.
8. Quick game (default): after the round limit, or at the first bankruptcy, the highest net worth
   wins. Normal game: the last player who is not bankrupt wins.

Press **Rules** (or R) at any time for the full rule guide. Shortcuts: B buys, P passes, T opens
trade, Esc closes optional panels. Hover or tap a tile to see its details; click a player card to see
what they own. Any click or key skips an animation; animation speed and the pass-device screen are in
the menu. The game saves itself after every action; **Continue** on the start screen resumes it.

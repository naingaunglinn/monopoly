# Global Monopoly

A property board game for 2 to 6 players who share one device. 80 spaces, 42 cities in 16 countries,
10 airports and 8 companies. Runs fully offline in the browser; no account, server or network.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview    # http://localhost:4173
```

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm test` | Unit tests (engine, data, UI) |
| `npm run test:e2e` | Playwright end-to-end run and screenshots |
| `npm run sim` | Headless simulation of 400 seeded bot games |

Add `?seed=123` to the URL for a reproducible game, or `?debug=1` for the debug panel.

## How to play

1. Press **New game**, set the players (or keep the defaults) and press **Start game**.
2. Pass the device to the player named on screen. They press **I'm ready**.
3. The yellow button always shows the next step: **Roll dice**, **Buy**, **Pay**, **OK** or **End turn**.
   Space or Enter presses it.
4. Land on an unowned city, airport or company to buy it. If you pass, everyone can bid for it.
5. Land on someone else's property and pay rent. On cities you can spend a Free Stay token instead.
6. Own every city of a country and its rent doubles. You can then build houses and a hotel,
   but only on the city you have just landed on.
7. Short of money? Sell buildings, mortgage properties or trade with another player.
8. Quick game (default): after the round limit, or at the first bankruptcy, the highest net worth wins.
   Normal game: the last player who is not bankrupt wins.

Press **Rules** (or R) at any time for the full rule guide. Shortcuts: B buys, P passes,
T opens trade, Esc closes optional panels.

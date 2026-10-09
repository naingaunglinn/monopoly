# Global Monopoly

A property board game for 2 to 6 players who share one device. A square board of 60 spaces: 31 cities
in 11 countries, 7 airports and 8 companies (the full board has 80 spaces and 42 cities; two constants
in `src/data/balance.ts` choose the size and shape). Runs fully offline in the browser: no account,
server or network.

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

## Play online

Friends can play together from different browsers, phones and computers. Press **Play online >
Create room**, send the link (or the 4-letter code), and everyone takes a seat in the lobby. The host
picks the settings and starts with 2 to 6 players. One device can hold several seats. On a large
screen the chat is open beside the board and keeps the cursor, so you can type at any time (phones: the
**Chat** tab; lobby: the **Chat** button); send stamps (Nice, Ouch, Ha ha,
Wow, Hurry up, Good game) that land on your card for everyone to see. Press **Join voice** to talk
(the browser asks for the microphone; headphones avoid echo).

- Locally, with no Vercel and no Redis: `npm run dev:online` (http://localhost:5173), or after a
  build `npm run serve:online` (http://localhost:4175).
- Deployed on Vercel with Upstash Redis: see [DEPLOY.md](DEPLOY.md), then check the deployment with
  `npm run smoke -- https://your-game.vercel.app`.

## On a phone

The game works on phones in portrait and landscape, on one device or online. The board sits in the
middle: drag to move it, pinch to zoom, and double-tap to see the whole board (double-tap again to
follow the token). It follows the moving token by itself. The controls sit in a sheet at the bottom
(on the side in landscape): the yellow button, the dice, and tabs for the tapped tile's card, the
players, the log and your properties. Decisions open there too.

## How to play

1. Press **New game**, set the players (or keep the defaults) and press **Start game**. Press a
   player's token to choose their colour.
2. Pass the device to the player named on screen. They press **I'm ready**.
3. The yellow button always shows the next step: **Roll dice**, **Buy**, **Pay**, **OK** or
   **End turn**. Space or Enter presses it.
4. Land on an unowned city, airport or company to buy it. If you pass, everyone can bid for it.
   White tiles are still for sale; an owned tile takes its owner's colour.
5. Land on someone else's property and pay rent. On cities you can spend a Free Stay token instead.
6. Own every city of a country and its rent doubles. You can then build houses and a hotel, but only
   on the city you have just landed on.
7. Short of money? Sell buildings, mortgage properties or trade with another player.
8. Quick game (default): after the round limit, or at the first bankruptcy, the highest net worth
   wins. Normal game: the last player who is not bankrupt wins.

Press **Rules** (or R) at any time for the full rule guide. Shortcuts: B buys, P passes, T opens
trade, Esc closes optional panels. Hover or tap a tile to see its details; click a player card to see
what they own. Any click or key skips an animation (the button reads **Skip** while one plays);
animation speed, sound and the pass-device screen are in the menu (larger screens also have a
speaker switch in the top bar). If your device is set to reduce motion
(on Windows: Animation effects off), tokens jump instead of moving: turn on **Show movement anyway**
in setup or in the menu to see them move. The game saves itself after every action; **Continue** on
the start screen resumes it.

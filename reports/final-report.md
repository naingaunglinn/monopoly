# Global Monopoly: final report

Spec: `docs/SPEC.md`. Decisions: `DECISIONS.md` (D1 to D50). Commits: one per milestone on the
`milestones` branch.

## 1. What was implemented

- **Engine (M1).** A pure TypeScript reducer, `reduce(state, action) -> { state, events, error }`,
  with `legalActions`, a decision-maker for the shared device and the 12 fixed phases. It uses a
  seeded mulberry32 PRNG kept in state, and JSON save/parse with `schemaVersion`. It implements
  every rule in section 5:
  - World Start, buying, auctions, rent with Event modifiers
  - the landing-only house rule with the even rule, selling, mortgages
  - Free Stay, Jail, Vacation, and all 15 card effect types over 33 Chance and 34 Event cards
  - trading, a debt queue whose debtor may be any player, bankruptcy to a player or to the bank
  - Quick and Normal winning, net worth, ties and ranking
- **Simulation (M2).** Random and sensible bots and a seeded runner (`npm run sim`). Invariants are
  checked after every action, including card conservation.
- **UI (M3).** Start, setup, game, winner and results screens. The game screen has the 80-tile ring
  on the 18 × 24 grid with token lanes and an Ocean HUD (players, Focus Card, dice, log, one yellow
  primary button). Around it:
  - every decision panel, plus trade with a device handover
  - a property list with selling and mortgaging
  - the rule guide (search, tables built from the data, switched-off notes, help buttons)
  - settings, save and resume, keyboard shortcuts, and a debug panel (`?debug=1`)
- **Look, motion, layout (M4).** The section 10 identity:
  - airport-signage pictograms, a luggage-tag Focus Card, a boarding-pass Chance card, a news
    banner on the ocean, and a route map on the start screen
  - an animation player that replays engine events with Normal, Fast and Off speeds and reduced
    motion; any input skips it and is swallowed
  - responsive tiers and AA contrast
- **Offline.** Fonts and flags are bundled and inlined, so the app makes no network request after
  load.

## 2. How to run it

```bash
npm install
npm run build && npm run preview     # http://localhost:4173
npm run dev                          # http://localhost:5173 (hot reload)
npm test                             # unit tests
npm run test:e2e                     # Playwright (builds and serves itself)
npm run sim                          # 400-game simulation
```

## 3. Results

**Unit tests (Vitest 5).** 179 tests in 18 files, all passing (about 10 s). They cover every area
in section 15:
- board, movement, property, auction, building, selling, airports, companies, cards, Jail,
  Vacation, Free Stay, trade, debt and bankruptcy, winning, save, settings, mortgage
- the rule guide in all 12 phases (opening and closing leaves the state identical)
- the engine contract (purity grep, frozen-input immutability, the exact phase set) and band
  contrast

**Simulation.** 400 seeded games with 4 bots each (2 random, 2 sensible): 0 crashes and 0
invariant failures in 36.8 s. All 12 phases were reached in both modes.

| | Quick (round limit 50) | Normal (cap 2,000 rounds) |
| --- | --- | --- |
| Games | 200 | 200 |
| Median rounds | 32.5 | 150.5 |
| Hit the round cap | (round limit reached in 6 games) | 7.5% (15 games) |
| Houses built per game | 2.10 | 26.59 |
| Hotels built per game | 0.00 | 2.81 |
| Bankruptcies per game | 0.97 | 2.92 |

97% of Quick games ended at the first bankruptcy, because the random bots spend recklessly. Prices
and rules were not changed because of these numbers.

**UI (Playwright, Chromium).** 13 runs, all passing, with no console errors in any of them:
- a seeded 5-round Quick game with animation Off, from setup to results
- a 4-player game with the pass-device screen on
- full games at Normal speed (every animation allowed to play), at Fast speed, with reduced motion,
  with the network disabled after load, and at 1024 × 768
- a key press during an animation finishes it and leaves the game state unchanged
- reload and Continue in the middle of an auction restore an identical state and the same panel,
  and the in-game Save shows its toast
- a corrupt or older save shows a clear message and offers a new game

**Screenshot review.** Captured at 1280 × 720, 1024 × 768 and 1920 × 1080: start, setup, a mid-game
board, a crowded worst-case board, six tokens on one tile, every decision panel, the rule guide,
pass-device, winner, results, property list and trade (90 images). Each capture is audited
automatically for text under 10px, page scrolling, clipped text, missing owner markers, hidden
player cards and HUD overlaps, and every image was opened and looked at. Problems found this way
were fixed and the screens shot again:
- see-through panels
- names clipped by 1px
- crowded side tiles
- six players overflowing the players column
- the setup screen scrolling at 1024 × 768

**Quality checklist (section 15):** every item is checked.
- City names, prices and rents are readable on the board.
- Tokens are visible and never fully overlapped (they fan at half overlap).
- The current player and their cash are obvious (top-bar chip, card border, larger token, tile
  ring).
- The next action is obvious and one click away (the yellow button; Space or Enter).
- Ownership and building levels are visible (owner glyph markers and pips).
- Jail and Vacation status are visible, with badges on the token and the card.
- Cards and events can be understood at a glance.
- No layout overflows at the three sizes.
- No animation blocks play; Fast, Off and reduced motion all work.
- The winner and the ranking are obvious.
- The game runs with the network disabled.

## 4. Decisions

The full list with reasons is in `DECISIONS.md`. The main ones:

- npm, not pnpm; a fresh repository on the `milestones` branch (D1, D2).
- The 12 phases are exact. Jail and Vacation choices live in TurnStart; the Vacation and
  Bankruptcy panels are acknowledgement notices; taxes use RentDue (D4).
- Debts form a queue processed in turn order, with a continuation that runs once they are paid.
  Bankruptcy is automatic once nothing is left to sell or mortgage (D5 to D7).
- Rounding: halves away from zero; a $45 house refunds $23; unmortgage uses integer maths, so
  $100 becomes $110 (D8).
- Build permission lasts from landing until the next roll or the end of the turn, including a
  country completed after landing. The build panel opens by itself (D10).
- The Go to Vacation card teleports like Go to Jail; modifiers are multiples of 0.25; the per-building
  fee is capped at $300 (D12 to D15).
- Bots: 2 random and 2 sensible per game, at most 4 free actions per decision, sensible bids in +$10
  steps (D22 to D24).
- One fixed primary button, which reads Done on the build panel; a trade handover screen; refused
  buttons explain why (D27 to D31).
- Test hooks: `?rounds=N` and a read-only `window.__GM__` (D33).
- Yellow is reserved for the primary button; derived AA text shades; band ink computed per country
  (D37, D38).
- The animation player and its skip rules; the responsive tiers; control sizes (D42 to D44).
- Crowded side tiles drop the flag; the screenshot audit (D47, D48).

## 5. Known limitations

- Board tiles are smaller than 44px touch targets, because the board geometry is fixed by the spec.
  Every action is also a full-size button, and tapping a tile still works.
- Under 1024px or in portrait the game stays playable, but the board is small; this is not a
  target.
- No sound (out of scope for this version) and no computer opponents in the UI. The bots exist only
  in the simulation.
- Simplified continents on the ocean were skipped (optional in the spec).
- The simulation's numbers reflect bot play: random bots go bankrupt early, so Quick games rarely
  reach the round limit.
- The single bundle is about 0.9 MB (about 365 KB gzipped), because fonts and flags are inlined so
  the game works offline.
- English only. Every UI string is in `src/ui/strings.ts`, but card texts and place names are in
  `src/data` and would also need translating for a Burmese version.
- Debug actions (with `?debug=1`) are written to the game log.

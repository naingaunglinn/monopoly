# Decisions

Choices made where `docs/SPEC.md` was silent or needed interpretation. Each one is the simplest
option that fits the spec. Prices, the board and the rules were never changed.

## Tooling and process

**D1. npm instead of pnpm.** pnpm is not installed on this machine; the spec allows npm in that case.
corepack was not used to install pnpm.

**D2. Fresh git repository on branch `milestones`.** The folder was not a repository. Commits are
made on a work branch rather than a default branch; run `git branch -m milestones main` to adopt it
as `main`. A local git identity was set for this repository only. Windows `*:Zone.Identifier`
files are git-ignored.

**D3. Latest stable toolchain.** Vite 8, Vitest 5, React 19, TypeScript 7, Playwright 1.64.

## Engine (M1)

**D4. The 12 phases are exact; extra panels live inside them.** Jail choices and the Vacation
skip notice are `TurnStart` with pending kinds `jailChoice` / `vacationSkip`. The Vacation landing
panel and the Bankruptcy panel are acknowledgement notices (`flow.notices`) that block every other
action until OK is pressed. Taxes use `RentDue` with the bank as creditor. Company rent is
`CompanyRoll` (roll) then `RentDue` (pay). A submitted trade is `flow.trade` and can sit on top of
any phase where trading is allowed.

**D5. Debts are a queue.** Every payment (rent, tax, card, forced Jail fine) is queued with its
debtor, who need not be the current player (for example "Collect $100 from each player"). The
queue is settled in order; a debtor short of cash opens the Debt phase as the decision-maker. A
stored continuation runs once the queue is empty (continue the move, move after the forced Jail
fine, or pass the turn after the current player's bankruptcy). Pay is always pressed by the player.

**D6. Automatic bankruptcy** happens whenever a debtor who still cannot pay has no buildings and no
unmortgaged property left, including right after mortgaging their last property.

**D7. Several creditors.** A player who goes bankrupt while owing several players gives everything
to the creditor of the debt being settled at that moment; their other queued debts are cancelled.
Debts owed to a player who has since gone bankrupt are void.

**D8. Rounding.** Rent and build costs after an Event modifier are rounded to whole dollars (halves
away from zero). A sold house refunds round(house cost × 50%), so a $45 house refunds $23. All
prices are multiples of $10, so mortgage values are whole. Unmortgage = ceil(mortgage × 110 / 100)
in integer maths ($215 → $237, $100 → $110). Modifier factors are multiples of 0.25 so these
products are exact.

**D9. Doubles and extra rolls.** The doubles counter is per turn and counts every double rolled in
that turn, as written ("three doubles in one turn"). Rolls are tracked as `rollsLeft`: a double and
a Roll again card each add one roll. Jail-escape doubles and company dice never add a roll.

**D10. Build permission.** `landedCity` is set whenever the current player lands on a city by dice
or card, and cleared on the next roll, on going to Jail and at turn end. The build panel opens by
itself when the player stands on their own city in a complete country below hotel level, even if
the even rule, a mortgage or cash blocks building right now (the panel says why). After Done, the
player can reopen it with Build until they roll again or end the turn. The permission also covers
a country completed after landing (buying the city, winning its auction or trading).

**D11. Free House card** is applied automatically to the next house built (never a hotel), then
returns to the Chance discard pile.

**D12. Go to Vacation card** moves the player straight to Vacation like Go to Jail (no World Start
money). The next turn is skipped and the current turn continues, including a doubles re-roll.

**D13. Modifiers** drawn by a player who goes bankrupt end at once (they could never expire).

**D14. perBuildingFee is capped at $300**, from the balance limit "a single cash effect stays within
±$300".

**D15. "Fixed cash effects sum to roughly zero"** is read as the amounts of `cash`,
`allPlayersCash`, `cashPerPlayer` and `companyOwnerCash` cards; both decks sum to exactly $0.

**D16. Free actions.** Trade, mortgage, unmortgage and selling buildings are allowed for the current
player at the Jail choice, before rolling, during the optional build panel and before ending the
turn, and for the debtor during Debt. Unmortgaging is not allowed while in debt. A trade needs at
least one item on either side; a gift is allowed.

**D17. Rounds.** A round ends when the turn order reaches the seat that opened the game again (Player
1, or the random first player). If that player is bankrupt, the next living seat after them counts.

**D18. Player names** are trimmed to at most 16 characters; an empty name becomes "Player N".

**D19. Turning the pass-device screen off** while it is showing continues straight into the turn.

**D20. Debug actions are reducer actions** (pure and deterministic) and are never listed by
`legalActions`, so bots never use them. The log keeps the last 200 entries.

**D21. The rule-guide test is part of M3.** M1 has no UI to open the guide in; the test runs with
Testing Library in M3, and the guide is UI-only so it cannot reach the engine.

## Simulation (M2)

**D22. Bots per game.** Every simulated game seats two sensible and two random bots; which seats get
which alternates with the seed. Both bots choose only from `legalActions()`.

**D23. Random bot.** It picks a random action type, then a random instance of it. It may propose a
small random trade and answers offers at random. To keep random play from stalling a game, any bot
gets at most 4 free actions (trade, mortgage, unmortgage, sell) per decision before it must make
progress.

**D24. Sensible bot.** It follows the spec list (keeps $300 when buying, builds whenever legal,
uses Free Stay on rent above $150, pays the Jail fee above $1,000, mortgages its cheapest property
in debt and sells buildings if nothing can be mortgaged, unmortgages above $1,500). Where the spec is
silent: it bids in +$10 steps up to the printed price while keeping $300, never proposes trades, and
accepts an offer only when it receives at least 1.25 times what it gives.

**D25. Bankrupt current player.** On a card that charges every player, the drawer can go bankrupt
while others still owe their share. The invariant allows a bankrupt current player only in that
window (Debt phase, turn about to pass). The simulation found this case (Normal, seed 129).

**D26. Capped Normal games count 2,000 rounds** in the median. The results do not change any price
or rule; they are in `reports/sim-report.json` and the final report.

## Playable UI (M3)

**D27. One fixed primary button.** The yellow button sits in a fixed slot under the play area.
Decision panels cover the play area and the log above it and hold only their secondary actions
(Pass, Use Free Stay, raises, Pay $300, Build, Debt actions). The primary is Done on the build
panel (Space or Enter never spends money by accident), Roll for doubles in Jail, a +$10 raise in an
auction, and OK or Continue on notices.

**D28. Notices first.** The Vacation and Bankruptcy panels (OK or Continue) show before anything
else, including the next player's pass-device screen.

**D29. Trade handover.** After Send offer, a handover screen asks the partner to take the device; the
partner then sees the offer with Accept (confirmed) or Reject.

**D30. Winner and results.** The winner panel sits inside the ocean and does not cover the ring;
View results opens the Results screen over the board.

**D31. Refused buttons** stay focusable (`aria-disabled`), give the reason in a tooltip (inline for
Buy, Pay, Build and Pay $300), and pressing one shows the reason.

**D32. Tiles are one tab stop** with arrow-key navigation (roving tabindex). Focusing a tile points
the Focus Card at it; Space or Enter still presses the primary button.

**D33. Test hooks.** `window.__GM__.getState()` is a read-only hook for end-to-end tests (it cannot
change the game). `?rounds=N` sets the Quick round limit of new games, which the end-to-end run uses
for its 5-round game; the setup screen still offers 30, 50 and 100.

**D34. Short tile names** for the two longest airports on one-line tiles ("UK Airport", "US
Airport"); the Focus Card shows full names.

**D35. Offline assets.** Only the latin woff2 files of the three Barlow families are bundled and
registered with the FontFace API at startup; the build inlines fonts and flags, so the app makes no
request after the first load.

**D36. Continue** is enabled whenever a save exists; a corrupt or older save shows a clear message
with Start a new game, and never crashes.

## Visual identity, animation, responsive layout, accessibility (M4)

**D37. Signal yellow is the primary button only.** Highlights the first draft painted yellow (the
current tile's ring, highlighted table rows, the bidder whose turn it is, the winner's results row,
the Event label) use the current player's colour or a light Info-blue tint instead.

**D38. AA text shades.** Gain green, Loss red and Amber stay as fills and large numbers. Small text
uses darker shades of the same hues (gain #137A43, loss #B42318, amber #8A4B00) and disabled labels
use #5C6670, because the palette values fall below 4.5:1 as small text. Text on a country band is
white or Ink, whichever contrasts more; a test checks every country at 4.5:1 or better. No country
colour needed adjusting: neighbouring countries are clearly different (tested).

**D39. Airport-signage pictograms.** White glyphs on Ocean squares head the corner tiles, every
decision panel and the winner panel. Airports, companies and special spaces wear the Ocean band on
the Focus Card.

**D40. Signature pieces.** The Focus Card is a luggage tag: chamfered top corners and an eyelet
punched through the country band. Chance is a boarding pass with a notched, perforated stub. Event
is a news banner on the open ocean. The start screen's ocean carries a route map with dotted arcs
joining the 16 countries in board order. The optional simplified continents were skipped.

**D41. Panels are sized to their content** and anchored just above the action bar. The play area
and the log hide behind an open panel, so the ocean shows around it.

**D42. Animation player.** The engine state is final at once; the player replays the last action on
top of the previous state: dice tumble, token steps with the path lit, World Start flash, landing
glow, cash counting, floating signed amounts, the rent coin, the Bought stamp, house pips scaling
in, the hotel merge, the Chance card sliding and flipping, the Event banner sliding, the Jail slide
and the winner confetti. Decision panels wait for it to end. Any pointer or key input finishes it at
once and is swallowed, so it never also presses a button. Fast halves every duration and Off
disables everything. With prefers-reduced-motion, movement and bounces are off and panels fade in
150 ms. Nothing loops.

**D43. Responsive tiers.**
- 1600px and wider: type, lanes and tokens scale up.
- 1024 to 1279px: card tiles drop their names (from 1279px down, as the responsive table says,
  rather than "about 1100px"), and the log becomes a 3-line strip that expands on click.
- Under 1024px or in portrait: a rotate hint shows, the HUD moves below the board and the page
  scrolls.

**D44. Control sizes.** Settings sit in the top-bar menu as a popover, so they never cover the
board. Help buttons, sheet close buttons and text links are 40px (44px on touch screens). Board
tiles stay smaller than 44px because the spec fixes the board geometry; every action is also
available as a full-size button.

**D45. Status is never colour alone.** Tokens carry a lock badge in Jail and a palm badge on
Vacation, and the player cards show the same status in words.

**D46. "Mortgaged" may hyphenate** ("Mort-gaged") on the narrowest tiles (1024px).

**D47. Crowded one-line tiles.** When a city has buildings, its one-line (side column) tile drops
the flag (the colour bar still shows the country), and house pips overlap by half. Airports on
one-line tiles show a plane icon and the country ("Germany", "UK", "US"); the Focus Card and the
accessible name give the full name. A worst-case fixture (everything owned, hotels, mortgages)
guards this in the screenshot audit.

**D48. Screenshot review is automated and visual.** Every capture is audited for text under 10px,
page scrolling, clipped text (strict on width), missing owner markers and overlapping HUD parts,
then the images are opened and looked at. Fixtures run with animation Off so no capture lands
mid-transition.

## Verification (M5)

**D49. Five or six players** switch the player cards to compact counts (an icon and a number for
cities, airports, companies and Free Stay), so every card fits without scrolling at 1280 × 720.
The setup screen keeps three columns down to 1024px so it fits one screen.

**D50. Default player names** ("Player 1" to "Player 6") come from `ui/strings.ts`, like every
other string; the engine imports them, as it already does for error reasons.

## Owner requests after M5 (2026-10-08)

The owner tested the game and asked for three changes. They override the spec where noted.

**D51. Slower, more visible animation (overrides the section 13 durations).** The spec's Normal
table played too fast to follow. The new Normal durations:

| Moment | Spec | Now |
| --- | --- | --- |
| Dice roll | 700 ms | 1100 ms; faces change quickly, then slower until they settle; the total pops in |
| Token move | 150 ms a step (90 ms for 10 or more) | 260 ms a space, with a hop per space and a squash on landing; long moves shorten each step so the whole move stays near 4.2 s (at least 70 ms a step) |
| Path light | Info tint | The moving player's colour, behind the tile text |
| Passing World Start | 600 ms | 900 ms flash; the +$500 floats up as the token passes Start, not after the move |
| Landing | 300 ms | 450 ms glow in the mover's colour |
| Money change | 700 ms | 900 ms; the float stays readable for most of it |
| Buying | 500 ms | 900 ms (the stamp lands in 450 ms and stays); the owner tint fades in over 600 ms |
| Rent | 800 ms | 1100 ms |
| House, hotel | 500, 700 ms | 700, 900 ms |
| Chance card, Event banner | 600, 300 ms | 800, 450 ms |
| Go to Jail | 500 ms | 800 ms |
| Panels and fades, turn pulse | 200, 640 ms | 250, 800 ms |

Fast still halves every value, so Fast is close to the old Normal, and Off is instant. Any click or
key still finishes an animation at once. While an animation plays, the primary button reads Skip in
a quiet style instead of showing the next step. An eager press of a yellow "Buy" used to skip the
move without the player noticing. The log holds back the lines of the action being played until it
ends, so it never tells the outcome before the dice settle.

**D52. Show movement anyway (keeps the reduced-motion rule, adds a choice).** With
prefers-reduced-motion, which Windows sets when "Animation effects" is off, nothing moved. Tokens
jumped, which matches the owner's report. When the device asks for reduced motion, the setup screen
and the in-game menu show a "Show movement anyway" switch. It is off by default, so the spec rule
still holds until a player opts in. It is a per-device preference in localStorage
(`global-monopoly/prefs/v1`), not part of a game or a save.

**D53. Players choose their colour (overrides "assigned automatically" in section 8).** On the setup
screen, each player's token opens a palette that shows the token in all eight colours: the six seat
colours from section 10, plus Pink #D6409F and Brown #8D5A3B. Each added colour gives the white glyph
at least 3:1, and its owned-tile tint is distinct. Yellow and gold stay out because they belong to
the primary button.
- Picking a colour another player has swaps the two, so colours are always different.
- Defaults are the seat colours, so two clicks still start a game. Tokens stay with the seat.
- The choice is stored as `settings.playerColors`: six different palette colours. A duplicate or
  unknown colour falls back to the seat colour, or else the first free one.
- The save schema is now version 2. Version 1 saves are migrated on load: the settings gain
  `playerColors` from the players' own colours, after checking that the version 1 settings are
  exactly what that version wrote. A real version 1 save is kept as a test fixture.

**D54. Owned tiles take the owner's colour (overrides "paper tiles" in section 10).**
- An owned property gets a 40% tint of its owner's colour behind its text. Mortgaged properties get
  a 14% tint, so the amber Mortgaged label still passes AA.
- Unowned properties stay white, so white means for sale. Their accessible name says "For sale".
- The tint sits on its own layer and fades in with opacity, so animation stays transform and opacity
  only. Icons on tinted tiles use Ink.
- The owner marker stays, so ownership is never shown by colour alone.
- Tests check every palette tint: Ink 4.5:1, icons 3:1, the Mortgaged label 4.5:1, and that the
  tints differ from white and from each other.

## Online play (owner brief, 2026-10-08)

The owner asked for online multiplayer hosted on Vercel, alongside the unchanged one-device mode.
For online mode only, this overrides "no backend, no networking" in spec sections 1 and 2. What was
built is described in spec section 17.

**D55. GameSession.** Screens never call the engine or the network directly. They read the game
from the app store and send every action through the active `GameSession` (`src/ui/session/`).
- `LocalSession` is the one-device game. It runs `reduce`, autosaves to localStorage and animates,
  exactly as before.
- `OnlineSession` sends actions to the server and shows the updates it pushes.
- Both show updates through one shared path: `playBatch`, then the store. Animation speed is a
  session method: the game setting locally, a per-device preference online.

**D56. Three Vercel Functions, web-standard handlers.**
- `api/room.ts`: GET returns the room, or the entries since a version when polling. POST takes `?op=create|join|seat|leave|settings|start|action|heartbeat|reclaim|host`.
- `api/stream.ts` is the live stream; `api/health.ts` reports which store is in use.
- Why only three: Hobby allows 12 functions per deployment, and `[...path]` files are not catch-all routes.
- Each file exports `export default { fetch }` and calls the shared `server/api.ts`.
- Vercel runs every compiled file as a native ES module without bundling, so every relative import the API reaches carries a `.js` extension (engine, data, `ui/strings.ts`, `server/`). Vite, Vitest and tsx resolve `.js` to the TypeScript source.
- Verified by running the output of a real `vercel build`. Importing the emitted functions and sending them requests works against a real Redis.
- `vercel.json` sets `maxDuration` and `supportsCancellation` for the stream function. `engines.node` is `24.x`.

**D57. Rooms in Upstash Redis.**
- Per room, all under one hash tag `gm:{CODE}`: the document (JSON), its version, a list of the last 64 log entries (events only) and a presence hash.
- Every key expires 48 hours after the room's last write.
- Writes are Lua scripts that do the compare-and-set on the version, the log append and the expiry atomically. They use only basic commands (GET, SET, RPUSH, LTRIM, EXPIRE, HSET, HGETALL).
- After a commit, a PUBLISH on `gm.room.CODE` wakes the open streams, which listen with SUBSCRIBE. Upstash serves SUBSCRIBE as an event stream over REST, and blocking reads are not available over REST, so nothing on the server polls.
- If a publish is lost, streams re-read the room every 60 s, and devices resync when a heartbeat shows a newer version.
- Without Redis credentials the deployed API answers 503 `notConfigured`. It never falls back to memory, because function instances do not share it.
- Credentials: `KV_REST_API_URL`/`KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`.

**D58. What devices see.** The public view hides the seed, the generator state and the order of both face-down decks. The rest of the game is public, as on one table, including the discard piles. Seat tokens are 32 random bytes. Only their SHA-256 is stored; the token itself lives only on the player's device.

**D59. Authoritative actions.** In order, a game action must pass five checks:
1. The game is running.
2. The device sent the room's current version (`expectedVersion`). A stale version gets 409.
3. Its token holds the seat that must act: the free actor for trading, mortgaging and selling, the decision maker for everything else, or a seat the host plays for.
4. The action's type is among `legalActions(state)` for that player. Bids and trade offers carry free amounts and contents, so the type is matched, not the whole action.
5. `validateAction` accepts it.

The engine then applies it and the result is committed with a compare-and-set. If two actions arrive at once, one wins and the other gets 409 and changes nothing. Settings, debug actions and `removePlayer` are never player actions, and `?seed` and the debug panel do not exist online.

**D60. Remove player.** New engine action `removePlayer`, sent by the host: the player is bankrupt to the bank. First:
- a trade they are part of is cancelled;
- in an auction they fold, and their high bid is withdrawn;
- rent or a company roll owed to them is cancelled;
- on their own turn, a shown card is discarded, an auction they started ends unsold, and the turn passes once any payments are settled.

In a Quick game this is the first bankruptcy, so it ends the game, as the rules say. A game that ends with a card still face up now discards it. Tests:
- a fuzz test plays seeded games and removes players from every phase;
- an extra run of 2,606 games found no invariant failure and no stuck state.

**D61. Seats and hosts.**
- Lobby seats are in joining order, with stable ids. A device may hold several seats, for two people on one laptop.
- A new seat gets the first free colour. A player may pick any colour no other seat has; another device's colour is refused rather than swapped.
- The room's creator is host. Host status follows the seat: if the host's heartbeat is 45 s old, the next connected seat takes over, checked lazily on any heartbeat.
- "Play for them" lets the host act for a disconnected seat until its own device sends a heartbeat or acts.
- In the lobby the host can remove any other seat. In the game, only disconnected seats can be played for or removed.
- Anyone with the room code can reclaim a disconnected seat. It gets a new token, and the old one stops working.

**D62. Live updates.**
- The stream is Server-Sent Events, resumable with `Last-Event-ID` or `?since=`, and sends every version after the one given exactly once, in order.
- In a catch-up batch, only the last entry carries the view, and a device too far behind gets one snapshot.
- Pings go out every 20 s, and a response ends at 270 s, under the 300 s limit.
- The client reads the stream with `fetch` (`src/ui/session/transport.ts`), so tests run the same code as browsers:
  - it reconnects from the last version;
  - a watchdog treats 45 s of silence as broken;
  - when the stream fails, it polls every 2 s and retries the stream every 30 s;
  - it resyncs when the tab becomes visible.

**D63. Running and testing online locally.**
- `server/local.ts` mounts the same handlers on MemoryStore and can serve `dist/`.
- `npm run dev:online` runs it beside the Vite dev server, which proxies `/api`. `npm run serve:online` serves the built game and the API on port 4175.
- API tests run on MemoryStore, and also on UpstashStore when `UPSTASH_TEST_URL` is set. The setup: Upstash's own emulator (serverless-redis-http) in front of a real Redis in Docker, plus `scripts/upstash-test-proxy.ts`. The emulator lacks SUBSCRIBE, so the proxy serves it the way Upstash does over REST.
- `npm run smoke -- <url>` checks a deployment end to end.

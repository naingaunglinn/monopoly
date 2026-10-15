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
  - a stream that ends within 5 s of opening counts as failing, so a server that cannot listen (for example a SUBSCRIBE error) is never reopened in a loop;
  - it resyncs when the tab becomes visible.

**D63. Running and testing online locally.**
- `server/local.ts` mounts the same handlers on MemoryStore and can serve `dist/`.
- `npm run dev:online` runs it beside the Vite dev server, which proxies `/api`. `npm run serve:online` serves the built game and the API on port 4175.
- API tests run on MemoryStore, and also on UpstashStore when `UPSTASH_TEST_URL` is set. The setup: Upstash's own emulator (serverless-redis-http) in front of a real Redis in Docker, plus `scripts/upstash-test-proxy.ts`. The emulator lacks SUBSCRIBE, so the proxy serves it the way Upstash does over REST.
- `npm run smoke -- <url>` checks a deployment end to end.

**D64. Online screens.**
- The start screen has two groups. Play on this device: New game, Continue. Play online: Create room, Join room.
- A Rejoin room ABCD button appears when this browser holds a seat in a room that still exists. That check is the only request the start screen makes, and only when a room is stored, so local play stays fully offline.
- Invite links are `/?room=ABCD`. Share opens the phone's share sheet on touch devices and copies the link elsewhere.

**D65. Seat credentials.** `localStorage` key `global-monopoly/online/v1` holds `{ code, seats: [{ seatId, token }] }`, one room per browser. Reopening the link, or Rejoin, restores every seat with a full sync. A seat that was taken over on another device is dropped from this one; when none is left, the player is told and returns to the start screen.

**D66. Lobby.**
- Seats are in joining order. A player renames their own seats and picks colours nobody else has.
- "Add a player on this device" gives one laptop a second seat.
- Only the host changes the options. They are the setup screen's fields, without the per-device ones (Pass-device screen, Animation speed).
- Start works with 2 to 6 seats. The host can remove any other seat in the lobby.

**D67. Waiting states.** On a device whose seat is not deciding:
- The primary button reads "Waiting for <name>" in a quiet style.
- Panels show "Waiting for <name>" instead of their buttons.
- Space does nothing.

Bid buttons appear only on the bidder's device. A trade offer opens on the partner's device, while the proposer sees "Waiting for <name> to answer your offer"; there is a handover only if both seats are on one device.

**D68. Your turn.** When a decision becomes this device's:
- a banner shows for 4 s;
- the tab title becomes "Your turn · Global Monopoly";
- the phone vibrates once (200 ms), if the page has already had a tap, because browsers refuse vibration before one.

The pass-device screen appears online only between two seats on the same device.

**D69. Live animations.** Other players' moves animate as local ones do, at this device's own speed (a per-device preference online). An update that arrives during an animation waits for it; a backlog of more than 3 versions is shown at once.

**D70. Connection feedback.**
- Heartbeats go out every 20 s, and at once on joining, on another player joining or taking a seat back, on game start and on a host change.
- A seat silent for 45 s shows "Disconnected". A seat not heard from yet counts as connected.
- "Reconnecting…" shows on the browser's offline event, a failed heartbeat or failed polls, and blocks actions until the connection returns. A room that is gone gets its own bar with Back to start.
- An action not answered within 300 ms shows a spinner on the button that sent it. Only one action is in flight at a time.

**D71. Host controls in the game.**
- A disconnected player's card shows the host Play for them (and Stop) and Remove. Remove asks first and, in a Quick game, says that it ends the game.
- Anyone with the link can take a disconnected seat back from the join screen ("Take over <name>'s seat").

**D72. Online menus.** The online menu has no Save, New game or Pass-device switch. It offers Copy invite link and Back to start, which keeps the seat. The winner panel and the results also offer Back to start.

**D73. Phones get their own layout (overrides "phones not a target; rotate hint" in spec sections 2 and 14).**
- It applies when the screen is under 1024 px wide, in portrait, or under 540 px tall (phones in landscape). It replaces the old stacked layout and the rotate hint.
- The layout: a slim status bar (round, whose turn, my cash, Rules, Menu), the board in a viewport, and a control sheet. The sheet sits at the bottom in portrait and on the side in landscape.
- The sheet holds the primary button (always visible), the dice, Build when it applies, and tabs: Card, Players, Log and Mine. "Mine" lists my properties with their actions, plus Trade.
- A decision panel opens in the sheet as its own tab (Decision) and waits for animations, as on large screens.
- "My cash" is this device's player online, and the player whose turn it is on one shared device.
- Larger screens are unchanged.

**D74. The board camera.**
- On phones the board keeps its exact 1280 × 720 desktop layout (1280 × 676 below the top bar) and is scaled as a whole. Every board size is pinned inside it, because media queries see the phone, not the board.
- While following a token, the scale is at least 0.92, so 11 px tile text shows at 10 px or more. The whole board after a double-tap is an overview, and the one exception.
- Gestures: one finger pans, two fingers pinch, the mouse wheel zooms, and a double-tap toggles between the whole board and following.
- The camera follows the moving token step by step. Any move, animated or not, brings it back to following after a pan.
- The camera lives in a ref and is written straight to the transform, so gestures never re-render the 80 tiles. It glides only when animations are on and reduced motion is off.
- On phones a tap pins a tile and shows its Focus Card, without toggling it off again, so a double-tap stays harmless. The click that ends a drag is dropped.

**D75. Gestures on the board do not skip animations.** Pointer input that starts on the phone board (`data-gesture-zone`) is exempt from "any input skips an animation", so a player can pan or zoom while a token moves. A tap anywhere else, the Skip button and any key still skip.

**D76. Phone comfort.**
- `viewport-fit=cover`, with safe-area padding on the status bar, the sheet and the bottom sheets. Page zoom stays available (no `user-scalable=no`), but iOS gesture events are cancelled on the board only.
- The game screen uses `100dvh` and never scrolls; setup, lobby and sheet content scroll inside themselves.
- Covering sheets and dialogs (trade, property lists, results, rules, confirmations) become full-width sheets from the bottom.
- Controls and tabs are at least 44 px. Board tiles grow with zoom; every action also has a full-size button.
- In landscape on short screens, the start screen drops its board art.

**D77. Screen awake.** During a game the Wake Lock API keeps the screen on where the browser allows it. It is requested again when the tab becomes visible and released when the game screen closes. A refusal is ignored.

**D78. The phone audit.** Every phone capture is checked for:
- no page scroll in either direction;
- the primary button fully on screen;
- board text at 10 px or more after scaling while following (the overview excepted);
- the usual text-size and clipped-text rules.

Phones are tested at 360 × 800 and 390 × 844 in portrait and 844 × 390 in landscape, with touch emulation. Pinch and pan use real touch events.

**D79. Decision panels on phones keep their buttons in view.** A panel's own buttons (Build, Pass, the bids and Fold, Sell or mortgage) stay pinned at the bottom of the sheet, and the details scroll under them with a short fade. In the Buy panel the price and the cash after buying come before the deed. Reviewing the phone captures showed the Build button below the fold, so a player could press Done without seeing it.

## Sound, chat and voice (owner request, 2026-10-08)

**D80. Sound is synthesised, as section 13 asked.** Every effect is built from oscillators, filtered noise, bells, wood blocks and thumps with the Web Audio API, with a small generated room reverb and a gentle limiter (`src/ui/sound/`). No audio files, so nothing is downloaded or licensed and local play stays offline. The set follows the board's travel theme (passport stamp, boarding call, teleprinter, cell door, gavel).

**D81. Sounds ride the animation timeline.** `playBatch` schedules each cue with the same timers as the picture (one wooden step per space, dice clicks at each face change), so skipping (any input, or the Skip button) cancels what has not played and fades what is playing. When nothing animates (animation Off, reduced motion, a bid), `summarize` plays each distinct sound once, in order, four at most, 160 ms apart. Reduced motion keeps sound. A hidden tab plays only the turn chime, chat and voice cues, since its timers are throttled.

**D82. Sound settings are device preferences.** On by default at 70% volume (`prefs`: `soundOn`, `soundVolume`; perceived loudness follows the square of the slider). The menu has the switch and the slider (a tick previews the level); larger screens also get a speaker switch in the top bar. The AudioContext is created on the first tap, click or key press (registered before the animation skip handlers, which swallow input); on iOS the audio session is set to ambient, so game sounds mix with music and follow the silent switch.

**D83. Levels are measured, not guessed.** `renderCue` renders each cue offline and measures its loudest 50 ms; trims in `cues.ts` put big moments near -23 dBFS, actions near -27 and small feedback near -31. The browser test keeps every cue between -36 and -18 dBFS and below clipping.

**D84. Turn sounds.** On one shared device a soft two-note marimba marks each turn change. Online, turn changes are silent; the device whose decision it is hears the rising airport chime once the move that led there has played.

**D85. Writing never skips an animation.** Online, someone else's move can be playing while a player writes. The skip handler ignores input inside `data-no-skip` zones (the chat, the stamp tray, the message preview, voice controls) and key presses in text boxes, so no key is lost and the move plays on; everywhere else any input still skips (D51, D75).

**D86. Chat lives beside the game, not in it.** Messages are kept in their own store keys (a list, a counter and a send-time hash per room) and never change the room's version, so a message can never make a game action stale. The newest 100 are kept, and they expire with the room (each message takes the room's remaining time, so chat never keeps a room alive). A message is one line of plain text (control, line-break and text-direction characters removed, spaces collapsed, 200 characters at most) or one of six stamps, with the sender's name and colour as they were. A seat may send a message every 0.6 s and a stamp every 1.5 s; the store script enforces it (429 `slowDown`) and the browser keeps the same pace, so it does not send requests that would be refused.

**D87. Chat delivery.** The stream sends `chat` events after a chat cursor (`&chat=`), with no event id (the id is always a game version). A message is announced on the room's channel as JSON, and open streams relay it from the announcement without reading the store; they read the store on connect, when an id is skipped and at the 60 s recheck. Polling carries chat too (`&chat=` on `GET /api/room?since=`). On the device, chat is shown at once, never queued behind animations.

**D88. Where the chat is.** Large screens: a Chat tab beside the log, and a Chat button (with the unread count) in the top bar beside Join voice, which opens and closes it even while a decision panel is open (owner feedback: the tab alone was hard to find, and it is hidden behind panels). While the chat is open, a decision panel takes the play area only, so the conversation stays in view; on compact screens the chat floats over the stage, above a panel, until the player goes back to the log. Below 1280 px the top bar's Chat and voice buttons show icons only, so the bar fits. Phones: a Chat tab in the sheet; someone else's decision does not pull a player out of it, nor does their own while they are writing (draft or focus). Lobby: a Chat button opens it in a sheet. While the chat is closed, others' messages count as unread on the tab or button and show for 4.5 s as a preview under the turn banner, which opens the chat. Messages sent before this device joined are history: no sound, not unread; one arriving more than 15 s late is silent.

**D89. Stamps.** Six words, no emoji (CLAUDE.md): Nice, Ouch, Ha ha, Wow, Hurry up, Good game, each with an icon and its own sound after the stamp thud. A stamp lands on the sender's player card (or lobby row, or the board when the card is not on screen) for 2.6 s, tilted, with a double border in the sender's colour darkened just enough for AA on paper (`inkOnPaper`). The stamps sit in a tray beside the message box, which stays open after a stamp so several can follow.

**D90. Voice chat is peer to peer, audio only.** Each pair of devices in voice connects directly (WebRTC), so no media server or account is needed and the audio never passes through Vercel or Upstash. With at most six devices that is at most 15 connections, each an Opus stream of a few dozen kbit/s. A voice peer is a device, not a seat: one microphone speaks for everyone sitting at it. Echo cancellation, noise suppression and automatic gain are on, and a hint suggests headphones.

**D91. Connection set-up.** One offer and one answer, each with all its network candidates (no trickle; candidates are gathered for 3 s at most), so a connection needs two messages. Of two devices, the one with the smaller id offers, so they never offer at once; the other rebuilds its side on every offer. A connection that is not up within 15 s, or fails later, is offered again after 1.5, 4, 10, then every 20 s. Set-up messages are kept per receiver (the newest 12) and announced on the room's stream only as receiver and id; the receiver fetches the content with its seat tokens (`op=signals`), so session descriptions (which carry network addresses) never travel on the shared stream. While a device polls instead of streaming, it fetches its messages every 2 s.

**D92. Who is in voice.** `op=voice` joins, mutes, unmutes or leaves; heartbeats keep the entry fresh, and the next voice write drops entries not seen for 45 s (the same presence timeout as seats). Changes are announced on the room's channel and relayed by the streams; streams also send the list when they open and at their recheck, and polling carries it. A closing tab sends a leave beacon. Voice keys expire with the room, and voice never changes the room's version.

**D93. Help for getting through networks, and the one third-party server.** By default devices learn their public address from Cloudflare's free STUN server (`stun.cloudflare.com`, with Google's as a second). It is contacted only online, and only after a player presses Join voice: the one exception to "no network calls" besides the game's own server (section 17). Peer to peer means the devices in a voice chat learn each other's public network addresses, which suits friends' rooms. Some networks (many mobile ones) need a relay: a TURN server is optional, either Cloudflare TURN (`CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_API_TOKEN`: the server asks for short-lived credentials on each join and drops port-53 addresses, which browsers block) or any TURN service (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`). The local server and the tests hand out no servers at all, so tests never touch the internet.

**D94. Voice controls and signs.** Large screens: Join voice in the top bar (with a count of who is already in), then Mic on or Muted (a green ring while you talk) and Leave. Phones: one status-bar button that joins and then mutes, in place of Rules, which moves into the menu online (otherwise the bar does not fit 360 px); Leave voice is in the menu. The lobby has the same button. A badge on the corner of each player's token (and on lobby rows) shows listening, talking (green, pulsing) or muted (red); talking comes from a level meter on each stream (read every 100 ms, held 450 ms between words), so a device hears and shows talking only while it is in voice itself. Voice volume is a device preference in the menu. Joining needs a tap (browsers open the microphone only then) and a secure address. On Safari the audio session switches to play-and-record for the call and back to ambient after it (D82).

## Room play fixes and the board size (owner request, 2026-10-09)

**D95. Too little cash to buy: the big button passes.** On a property the player cannot afford, the primary button was a disabled Buy, and the only way on was the small Pass in the panel; players took the game for stuck (owner report). The primary button now offers Pass whenever the engine refuses the purchase, and the buy panel says how much is missing (from the engine's refusal). Pass in the panel and the P key still work.

**D96. The board's size and shape are two constants; the board in play has 60 spaces, square.** The owner found the 80-space board too crowded (above all the long left and right sides, 22 spaces each) and asked for 60 spaces, set by a number in the code, and a square board, with a constant to choose square or rectangle. `BOARD_SIZE` and `BOARD_SHAPE` in `balance.ts` choose the board; the full 80-space board of spec section 3 stays the data, and `buildBoard` (board.ts) makes any board from 40 to 80 spaces out of it.
- *What goes.* A smaller board leaves out spaces in a fixed order (`LEAVE_OUT`): whole countries (a country is always kept or dropped whole), airports and Chance, Event and Free Parking spaces, interleaved so the board stays balanced at every size. The kept spaces stay in their order, so prices still rise around the board. Never left out: the corners, both taxes, the four countries Chance cards send players to (Brazil, Japan, Myanmar, United States), and the companies on boards of 57 spaces or more. Below that a company goes with a neighbouring country, and the Event cards about it leave the deck, which keeps at least 30 cards (spec section 6) and its fixed cash still sums to about zero. A company's two countries are worked out from the cities beside it.
- *The 60-space board* drops Netherlands, Canada, Spain, South Korea and France (31 cities in 11 countries remain: three in the Americas, Egypt, Israel, three in Europe, three in Asia), the Mexico, China and Germany airports (7 remain, so airport rent tops out at $625 instead of $1,250), two Chance, three Event spaces and Free Parking. All 8 companies stay. The full list is in the board test.
- *Square* means the same number of spaces along every side (14, plus the corners); the board still fills the play area, so on a wide screen its tiles are wider than they are tall. Spec section 3 rejected a ring that is square on screen: at 1280 × 720 its tiles would be about 40 px wide. *Rectangle* keeps the full board's proportion (16 across to 22 down). A square board needs a size that divides by 4, a rectangle an even size; anything else stops the app at start with a sentence saying what to change.
- *Old games.* The settings now record the board (`settings.board`, save version 3). Saves from version 1 and 2 were all on the full board and are migrated as such, so they load only while the board in play is 80/rectangle; otherwise the start screen says the save was played on a different board. Online, a room whose game began on another board reads as closed (the server answers as for an expired room). Changing either constant later has the same effect on saves and running rooms.
- *Balance.* No price or rule changed. With 4 bots, Quick games run a median of 36 rounds (32.5 on the full board) and 15% reach the round limit (3%); Normal games run far longer, a median of 606 rounds (150), and 37.5% reach the simulation's 2,000-round cap (7.5%), because players pass World Start more often on a shorter lap. Scaling the World Start money with the board would shorten them; it is a rule change, so it waits for the owner.

**D97. Room play on large screens: the players in the top bar, the chat in front, the card on hover.** The owner marked up the live game (online, desktop): the players column and the empty top bar, the Focus Card, the dice box and the small log. Changes, for room play on large screens only (one shared device and phones are unchanged, since there "this player" and "the other players" mean nothing or the layout is already different):
- *Top bar.* This device's player in full (token, name, cash, owned counts as icon and number, Free Stay, held cards, Jail or Vacation), on a tint of their colour; every other player as token, name and money (owner follow-up: "show player name beside money"; with five or six players below 1900 px the name sits above the money so the chip stays as narrow as the money alone), with one sign on the token (Disconnected, played by someone, Jail, Vacation; words in the tooltip). When the bar is still too short, names end in an ellipsis before any button is pushed off. The current player's chip has a ring in their colour. Two seats on one device: the one deciding now, else the current one, else the first. A chip opens the property list, where the host's Play for them and Remove now live (they were on the cards; ids `sheet-play-for-N`, `sheet-remove-N`). The title and the turn number go; the round becomes a small counter, and active events move into the play area above the dice (in the bar they were squeezed to nothing with six players). To fit six players with this device's player in Jail holding both kinds of card, in voice, at 1024 px: icons only below 1900 px; with five or six players below 1600 px its badges' words go and the round counter moves into the play area; below 1280 px Rules and the sound switch go into the menu and voice keeps only the microphone switch (Leave voice is in the menu), and the chips tighten. Money floats drop under the chips, rent coins fly between them on a layer over the whole screen, and stamps land just below the chips.
- *Chat.* Open from the start in a column of 40% of the play area (260 to 460 px), full height from 1280 px; the Log is a tab beside it. With a mouse the message box keeps the cursor (the owner: "make cursor always active on text box so player can type and enter to send"): it takes the cursor back after a click or when the focused control disappears, never from another text field or list, an open sheet, dialog, menu, rule guide or pass screen, nor while text is selected, and never on touch screens. The cost: while the cursor is in the chat the one-key shortcuts type letters; Escape still works, and the shortcuts work on the Log tab. Since the chat no longer floats on compact screens, D88's floating chat applies to no screen now.
- *Focus Card.* Hidden until a tile is hovered, focused or pinned; then it floats inside the ring beside that tile, on the ocean's nearest edge, and lets the pointer through unless pinned.
- *Dice.* 36 px dice (44 px from 1600 px), total and recap in a small block just above the buttons.

**D98. Building covers the whole country you land in.** The owner changed the house rule of spec 5.8 (it said "implement exactly"): landing on any city of a country the player owns whole now opens building on every city of that country during that move, not only on the city landed on. The even rule stays as it was, and it is what the owner described: a city gets its next house only when every city of the country has as many ("p1 → h1, p2 → h1, p3 → h1, then you can build more"). I read "you can build on all its cities" as a choice of where to build, one house at a time, not as one press that adds a house to every city at once; all the rest (no mortgaged city, cash, hotel after 4 houses, the Free House card, permission until the next roll) is unchanged. The build panel now lists every city of the country with its buildings, rent and own Build button, and the board marks every city that can take a building now. Bots build the same way (they take the first city the even rule allows). In the simulation (60-space square board, 4 bots) houses are built far more often: Quick games build 13.8 houses and 2.9 hotels a game (2.4 and none before), run a median of 33 rounds (36) and reach the round limit in 3% of games (15%); Normal games run a median of 250 rounds (606, against 150 on the full board under the old rule), and 32.5% reach the 2,000-round cap (37.5%).

**D99. Open trading with counter-offers.** The owner, playing online: offers between other players could not be seen, there was no negotiating ("not just deny"), and an offer should not belong to whoever's turn it is. Spec 7.2 had trades opened by the current player only, answered yes or no, with no counter-offers. Now:
- *Who and when.* Any living player may offer whenever the game is between decisions, which is exactly when the engine has a free actor (about to roll or end the turn, a Jail choice, a build offer, a debt being raised) and no offer is on the table. During any other decision the offer waits (`tradeWait`: "Offers can be sent once Mia has made their decision"); the builder stays open and can send once trading opens. Trades during an auction, rent or a card would change cash or ownership halfway through a decision, so they stay closed then.
- *One offer on the table, blocking.* As at a real table, the game waits while an offer is on the table (the partner decides). The alternative, offers that run beside the game, would let a trade land in the middle of a decision and would need every offer re-checked at every step; one blocking offer keeps the engine's rules and invariants as they were. The offerer can withdraw (`withdrawTrade`, theirs only), so nobody is stuck waiting on an offer, and the host's Play for them covers a partner who disconnects.
- *Counter-offers.* `counterTrade` replaces the offer on the table with a new one back the other way (from the partner to the offerer), checked like any offer; then the first player answers. There is no limit on rounds. A counter-offer is stamped "Counter-offer" (with its round from the second), and items added, taken out or changed since the previous offer are marked (the previous offer is remembered on the device, so a device that joins mid-talks shows no marks).
- *Seen by everyone.* The offer on the table is a decision panel, shown on every device: the partner gets Accept, Counter-offer and Reject, the offerer Withdraw beside "Waiting for <partner>", everyone else the offer itself. It sits in the play area (on phones in the Decision tab), so the chat stays open beside it for talking terms. On one device the answer is still handed over first, and the offer can be withdrawn on the handover screen.
- *The builder.* It asks who is offering on one device (any player), and online offers as this device's player (or one of its seats). The Trade button (and T) is there for every player, on anyone's turn, except while an offer is on the table and for a debtor, whose debt panel has its own. The builder now closes only once its offer is on the table, so an offer refused by the server can be sent again.
- *Server.* An offer or a withdrawal does not depend on the moment it was made, so the server checks it against the latest game instead of refusing it as stale, and tries again if another action lands at the same instant (`isOpenAction`). The server checks each action against what that player may do (`legalActionsFor`).
- No save or state shape changed: `flow.trade` still holds one offer, and the new events (`tradeCountered`, `tradeWithdrawn`) are log entries like any other. Random bots in the simulation sometimes counter (about 5,200 counter-offers in each mode's 200 games, no crash or invariant failure); sensible bots still only accept or reject. The report's numbers move because the random bots' choices changed, not the rules.

**D100. World Start pays $1,000.** The owner asked for the World Start pay ("တာထွက်") to be $1,000 instead of the spec's $500, for passing or landing on it, by dice or forward card movement. `BALANCE.startBonus` is the one number; the Chance card texts and the help texts now read it, so they can never disagree with it. Other money is unchanged (taxes, fines, prices, starting cash). With twice the money coming in each lap, games run much longer before anyone goes bankrupt. In the simulation (4 bots, 60-space board): Quick games reach the round limit in 40% of games (3% before) with a median of 46.5 rounds (32); Normal games reach the simulation's 2,000-round cap in 84.5% (25.5%), so a Normal game may rarely end by bankruptcy. Quick mode, which always ends at its round limit, is the safer choice with this pay.

## The Myanmar map (owner spec, 2026-10-14)

The owner's spec (`docs/myanmar-map-spec.md`, in English in spec section 19) adds a second map, built in four stages. Everything below applies to the Myanmar map only; World games, saves and rooms play exactly as before (checked: the World simulation report is identical, and every World text is the same, compared string by string before and after).

**D101. Stage 1: the Myanmar board, its money and its two languages.**
- *Choosing it.* The setup screen has World | Myanmar beside its title; the lobby has the same choice above the starting money (the host's). The map is a setting (`settings.map`), so saves are version 4: a version 3 save loads as a World game, with the new fields empty (merit 0, no military service, no loan offer, an empty pot and loan list). Rooms record the map in their settings; a room or game kept from before reads as World. A Myanmar save or room is never mistaken for a World one: its board (48 spaces) is checked like any other (D96).
- *One engine, two maps.* `board.ts` exports the map in play (`MAP`, `RULES`, `BOARD`, `SPACES` and the rest) as live bindings, and every engine entry point (`reduce`, `legalActions`, `legalActionsFor`, `validateAction`, `checkInvariants`, net worth, `createGame`, reading a save) first switches to its game's map. Engine calls are synchronous, so one server process handles rooms of both maps without them touching: tests play a World and a Myanmar game in turns, in the engine and through the online API, and check each ends exactly as when played alone. The screens switch with the game on screen; the start screen is always the World map. Numbers that differ by map are in `RULES` (`MYANMAR` and `MapRules` in `balance.ts`); cards in `myanmarCards.ts`.
- *The board.* Exactly the owner's list. The owner numbers the 44 spaces between the corners; the board numbers every space, so the corners are 0 (Start), 12 (Military camp), 24 (Refuge) and 36 (Call-up letter) and Falam is 1, Monywa 13, Mawlamyine 25, Taunggyi 37. Square, 11 spaces along each side. Region colours were chosen for the regions (Chin teak brown, Kachin jade green, Anyar dry-zone ochre, Rakhine bay blue, Southern Andaman teal, Delta paddy green, Shan Inle violet, Mandalay palace red, Yangon pagoda gold) and pass the band contrast test; Yangon's gold (#D4A017) is darker than the signal yellow, which stays the primary button's. English region names: Anyar (အညာ), Southern (တောင်ပိုင်း), Delta (မြစ်ဝကျွန်းပေါ်).
- *Corners keep the World turn flow.* The Military camp is the Jail corner, Call-up letter the Go To Jail corner, the Refuge the Vacation corner. **Until stage 2 the Military camp works as the World Jail** (pay 300 lakh, a Call-up exemption card or doubles; three failed rolls force the fine), and the pagodas and the Refuge are places where nothing happens; taxes go to the bank until the pot (stage 3). Vacation and Free Stay are off on this map and their switches are hidden (spec: merit replaces Free Stay).
- *Rents.* Cities as the spec (base a tenth of the price, the World multipliers). Transport: 50, 100, 200, 400 by how many the owner holds. Companies: the dice total × 25, 50, 100 or 200 by how many companies the owner holds.
- *Stage 1 cards.* The six Chance cards and three News cards that need no new rule: On the conscription list, Call-up exemption, Yangon traffic jam, Hospital bill, Fly from the nearest airport, Back to Start; Tourist season, Rice prices climb, Border trade closed. The other nine arrive with their stages. "Nearest airport" means one of the two airports (not the Expressway or the Muse gate), and rent there is doubled; "this round" lasts until the drawer's next turn, like World Events. Each card has a Burmese title and text.
- *Money.* "830 lakh" in English and "၈၃၀ သိန်း" in Burmese (Burmese digits), always with its sign where the World map shows one. Cash is set smaller where lakh would not fit (player cards, status bars), and rent values never break.
- *Burmese and English.* The switch is a preference of each device (`prefs.language`), not a game setting: each player reads the board in their language, online too. It is on the setup screen and in the lobby when Myanmar is chosen, and in the game menu. It changes what spec 7.6 names: city, region and space names, card titles and texts, and the money; the rest of the interface (buttons, panels, log sentences, rule guide) stays English. The Burmese face is Noto Sans Myanmar (its Myanmar-script files, four weights), bundled and inlined like Barlow and registered under the same family names for the Myanmar Unicode blocks only, so Latin text keeps Barlow. Long Burmese words may break between letters on crowded tiles.
- *Look.* The board centre keeps the Ocean's graticule and draws the Ayeyarwady, Chindwin and Thanlwin with the 25 cities as dots in their region colours and the three pagodas in gold (it shows fully on phones; on large screens the HUD covers its middle, as with the World art). Corner signs: a tent for the Military camp, a letter for Call-up, trees for the Refuge; the pagoda sign is drawn for this game on lucide's grid. Transport spaces show a plane, a milestone (Expressway) or a fence (border gate), and their short names on tiles. Below 1280 px the World board hides tile names (flags name the countries); the Myanmar board has no flags and wider tiles, so its names stay.
- *Simulation* (`npm run sim -- --map myanmar`, `reports/sim-report-myanmar.json`; 4 bots): Quick games run a median of 32 rounds, 7% reach the round limit; Normal games a median of 117.5 rounds, 23% reach the 2,000-round cap. 400 games, no crash, no invariant failure. Shorter than World games (500-lakh Start on a 48-space lap against $1,000 on 60).
- *To check with the owner.* The Burmese spellings of the names and card texts were written for this build and should be read by a Burmese speaker.

**D102. Stage 2: military service, merit, the company news and inflation.** The Military camp stops working as the World Jail.
- *Called up* by the Call-up letter, the "On the conscription list" card or three doubles: the player goes to the camp and chooses at once in a panel (no yellow button: none of the choices is the obvious next step). Pay: a tenth of their cash, rounded, at least 500 lakh, to the bank (to the pot in stage 3). Hide: 2 turns skipped. Flee: 800 lakh, straight to the Muse Border Gate like the World's trip to Jail (no landing there, no Start money on the way), 1 turn skipped. Serve: 3 turns skipped, 300 lakh when the last one is over. A merit point or a Call-up exemption card: free at once. Pay and Flee need the cash in hand (the player may mortgage or trade first, as at the World Jail choice); Hide and Serve are always possible, so nobody is ever stuck.
- *Skipped turns* count down at the start of each of the player's turns ("Mia is in hiding; 1 more turn after this one"), and the player may leave at that moment with a merit point or the card and play the turn. Hiding and serving owners collect no rent (the payer pays nothing; the log says why); a player who fled collects rent. A Fuel shortage skip that was waiting is dropped when the player is called up, so the two never add up; players in service are left out of a Fuel shortage.
- *Merit.* Landing on a pagoda offers a 200-lakh donation for 1 merit point (a panel with Donate and No thanks, keys B and P), unless the player holds 3 or has less than 200 lakh. A point skips one rent owed to another player (any property: cities, transport, companies; never a tax) or cancels a bad Chance card (the two bad Myanmar Chance cards: the call-up and the broker), or frees the player from service. Merit points cannot be traded. The Pagoda festival card charges its 100 lakh even when the player already holds 3 points (then without a fourth).
- *The broker card* ("A broker calls: pay 500 lakh and your name comes off the list") is read as "pay or be called up": Pay 500 lakh, or Go to the Military camp (the yellow button). A merit point can cancel it.
- *Company news* lasts until the next turn of the player who drew it, like every News card. Blackout: city rents × 0.5 and YESC's rent × 2 (its "income"). Internet cut: only the owner of MPT may make or counter an offer; anyone may still accept or reject one (the engine refuses the rest, so the server does too). Fuel shortage: every player skips their next turn, except the owner of Denko and players in service. Inflation: see below.
- *Inflation* (spec 7.4, the owner's stage 3) was built now because the Inflation card needs it. City rents (not transport or companies) are multiplied by 100% + the rate; the rate rises 10 points at the start of rounds 6, 11, 16 and so on, and 10 more with each Inflation card. The owner of KBZ Bank "is not affected": read as paying city rent without inflation. The rate shows beside the active events (on phones above the players), and rent explanations include it.
- *Shown on the board.* Player cards and chips show service ("Hiding, 2 turns", "In the army", "At the border") with the tent sign, and merit points with the pagoda sign. The rule guide's Military camp topic becomes Military service, and Merit and Company news topics are added (Myanmar only).
- *State.* No new fields: version 4 already had merit, service, the economy (inflation) and their places. New decisions are pending kinds of existing phases (`draftChoice` and `draftSkip` in TurnStart, `donation` in BuyDecision), so the twelve phases stay; saves made in the middle of each load back exactly (tested).
- *Simulation* (Myanmar, 4 bots; sensible bots spend merit first, then the card, pay when they keep 1,000 lakh, else hide; donate above 1,500; spend merit on rent of 400 or more): Quick games run a median of 30 rounds; Normal games a median of 83 rounds and none reaches the 2,000-round cap (23% did in stage 1): inflation ends long games. 400 games, no crash, no invariant failure. The World report is identical.

**D103. Stage 3: the earthquake, tolls, the lottery, the community pot and remittance.**
- *The community pot.* What goes in: both taxes, the pay-out and flee costs of military service, the broker's fee and the Community donation card (the spec: "taxes and fines"); other card payments, such as the hospital bill or the lottery ticket, go to the bank. Whoever lands on the Refuge, by dice or card, takes it all. The pot is shown in the middle of the board: under the dice on large screens, in the open middle of the phone board (plus the Players tab), and as the Refuge corner's value.
- *Tolls* (20 lakh) are owed for every Expressway or Muse Border Gate passed over in a move, in either direction, but not for the space landed on (that is rent). None when the space has no owner, is the mover's own or is mortgaged, or its owner is hiding or serving (they collect no rent either). Tolls are paid like rent, before the landing; a player who cannot pay raises the money (Debt) and then lands; the "nearest airport" card's double rent is kept across that pause.
- *The lottery card* offers Buy a ticket (10 lakh, then two dice: 12 wins 3,000, 10 or 11 wins 500, 7 to 9 wins 100) or No ticket (the yellow button); the dice show like any roll. Prizes come from the bank.
- *The earthquake card* rolls one die: odd destroys every house and hotel in the Mandalay region, even in Anyar, with nothing paid back.
- *Remittance.* A player who fled receives 200 lakh at the start of every round while their service lasts (they are at the border until then).
- *Not changed:* World games (simulation report identical; World texts unchanged apart from new labels).
- *Simulation* (Myanmar, 4 bots; sensible bots buy a lottery ticket when they hold more than 1,000 lakh): Quick games run a median of 33 rounds; Normal games 104.5 rounds, 1% reach the 2,000-round cap. 400 games, no crash, no invariant failure.

**D104. Stage 4: loans between players.**
- *Asking.* A player asks another for a loan from the Loan button beside Trade (phones: the Mine tab): the amount, the interest each round (a whole percent, 0 to 20), the rounds to pay it back (1 to 30) and at least one of their own properties as collateral. "At any time" is read as with trading (D99): whenever the game is between decisions, on anyone's turn. Only one offer, trade or loan, is on the table at a time, and the game waits for its answer. The other player accepts (the lender must have the cash then), rejects or sends new terms (the same lender and borrower; any amount, rate, term or collateral), and the talks go on until one of them accepts or rejects; online the asker may withdraw. On one shared device there is no handover screen for loans: the panel names whose decision it is. During an Internet cut only the owner of MPT may ask or send new terms.
- *Collateral* must be the borrower's, unmortgaged, not already pledged, and in a region with no buildings. While pledged it cannot be mortgaged or traded, and nothing can be built anywhere in its region (building one city would leave the others stuck under the even rule). A chain marks it on the board. Pledged property does not count as a way to raise money, so a player whose only assets are pledged goes bankrupt instead of being stuck in Debt.
- *Interest* is simple, on the full amount lent even after part is paid back (the spec's formula as written): debt = amount + amount × rate × rounds passed, never more than three times the amount, less what was paid. A round counts at each round start after the loan, and the debt is worked out when needed, never stored, so the list always shows it up to date.
- *Paying back.* The borrower pays back on their own turn, between decisions and not while raising money, from the Loans list (in each player's property sheet and the phone Mine tab), up to the debt or their cash. Passing Start pays a quarter of each debt (rounded) to its lender when the cash is there, never as a debt.
- *Unpaid at the end of the term* (at the round start that ends it), the collateral goes to the lender and the loan ends, whatever was paid before. *If the borrower goes bankrupt*, each lender takes their collateral first, before any other creditor or the bank. *If the lender goes bankrupt*, their loans are cancelled and the collateral is freed.
- *Net worth* counts loans: the lender's debt owed to them, less the borrower's debt. This matters for Quick game winners.
- *Bots.* Random bots ask for, counter and answer loans at random; sensible bots never ask, lend at 5% a round or more against collateral worth the amount, borrow at up to 10%, and pay back when they hold plenty.
- *Simulation* (Myanmar, 4 bots): Quick games run a median of 34 rounds, Normal games 118.5 rounds (0.5% reach the cap). In 60 games every path happened: about 560 loans, 490 paid off, 86 Start repayments, 61 defaults at the end of the term, 7 collaterals taken at bankruptcy, 5 loans cancelled with their lender. 400 games, no crash, no invariant failure; the World report is identical.

## The Myanmar map, spec v2 (owner, 2026-10-15)

The owner's additions (`docs/myanmar-map-spec-v2.md`, in English in spec section 19) change the Myanmar map only; World games, saves and rooms play exactly as before (World simulation report identical; World texts unchanged).

**D106. Spec v2, stages 1 and 2: Chiang Mai, Brycen Myanmar, the porter cards.**
- *Chiang Mai.* The Refuge corner is renamed Chiang Mai (ချင်းမိုင်) and still pays out the community pot. Spec v2 also makes it where a player who flees military service goes: fleeing now takes them straight to Chiang Mai instead of the Muse Border Gate. They teleport, so they do not take the pot (only landing does); remittance still comes in while they are there.
- *Brycen Myanmar* (IT company, 250 lakh) takes the Special tax space (the owner's number 41, board space 44), so the map has one tax (Income tax, 300). Companies now pay the dice total times 25, 50, 100, 200 or 400 by how many of the five the owner holds.
- *Saves are version 5.* Version 4 saves and running rooms migrate: World games only gain the new (empty) fields. A Myanmar game also gains Brycen Myanmar, unowned, and the new cards go to the bottom of their draw piles, so a game in progress plays on (tested against a real version 4 Myanmar save, and against one in the middle of paying the Special tax).
- *Taken as a porter* (Chance): straight to the Military camp, no Start money, and the one way out is paying 500 lakh. No hiding, fleeing, serving, merit or exemption card, and a merit point cannot cancel the card (it says so). The 500 is owed like any card payment, so a player who is short raises it or goes bankrupt; nobody is ever stuck. It goes into the community pot, like the other military-service payments. The turn ends.
- *Brycen Myanmar posts a loss* (Chance): every player except the owner pays the owner 100 lakh, in turn order from the drawer. If the drawer owns it, they collect from the rest. If nobody owns it, every player puts 100 lakh into the pot.
- *Porters wanted* (News): one player is picked at random by the game's generator, the drawer included, among players not already in military service (nothing happens when nobody is free). If it is the drawer, they are called up at once, as by the conscription card. Anyone else goes to the Military camp now, marked "Called up" (no rent meanwhile, and a fuel shortage skips them), and chooses one of the usual ways out at the start of their next turn. Paying, a merit point or the exemption card frees them and they play that turn. Hiding, serving or fleeing counts that turn as the first one skipped, so they lose no more turns than a player called up on their own move.

**D107. Spec v2, stage 3: rank, the general, unrest and bribes.**
- *Rank.* When a player's service ends after serving (not hiding or fleeing), one die is rolled: even +2, odd +1, at most 6. The salary, rank × 200 lakh from the bank, is paid then, once per service. v2 says it extends serving, so it comes on top of the original 300 lakh return pay. Rank lasts for the rest of the game, except for a general brought down by unrest and a player who goes bankrupt.
- *The general* is the one living player with the highest rank, 4 or more. Of equal ranks, whoever reached that rank first stays (or becomes) general. Someone who climbs strictly higher takes over, and the previous general keeps their rank. When there is a new general for any reason, every player gets their unrest cups back, the x/3 count and bribes start afresh, and the power is ready at once. v2 says cups come back after a fall; a new general taking over starts the same way.
- *The power.* The general uses it on their own turn while the game is between decisions (before or after rolling), once in two rounds. Two dice: up to 8 takes 1,000 lakh, above 8 takes a property; the spec's "below 8 / above 8" leaves 8 itself open, and it counts as money. The general picks the target after the roll: any other player, and for land one of that player's properties. A property cannot be taken if it has buildings, is pledged for a loan, or is a city in a region with buildings (the rest of the region would be left with houses on a region nobody owns whole). A mortgaged property may be taken and stays mortgaged. If no other player has a property that can be taken, the use is spent and nothing happens. The 1,000 lakh is owed like rent: a target who is short raises it or goes bankrupt to the general.
- *Blocking.* The player hit may spend 2 merit points to block that one use. They choose this in the unrest window, in place of showing a cup.
- *The unrest window* opens after every use, once the target is chosen. Every other player still holding a cup answers, and so does the target if they can block: show a cup or hold back. Answers come in any order, from each player's own device. Who did what is shown to all as they answer (v2's "open" version). The engine has no clock, so the 20 seconds is the screen's countdown: when it runs out, each device holds back for its own players who have not answered. A player whose device has gone away waits for the host's play-for, as with any decision. Once everyone has answered, the cups shown against this general are counted. At 3 (2 with two players, who only hold 2 cups between them) the general falls: that use is cancelled, they lose all rank, and everyone gets their cups back. Otherwise the use happens unless it was blocked.
- *Bribes.* While their power is ready, the general may offer one player money (any whole amount they have) to hold back. The offer waits for that player's answer, like a trade offer, and the game waits. If accepted, the money is paid at once and that player cannot show unrest at the next use (they may still block with merit if they are the target). Bribes lapse after each use. v2 suggests the trade screen; a bribe has its own small offer and answer instead, since a trade cannot express "holds back".
- *Shown on screen.* Each player card shows the general badge, rank and cups left. Room chips show the same, and the general's chip has a medal. A line under the pot names the general and shows the unrest count (for example 1/3) and when the power is next ready. Panels cover the target choice, the window with its countdown, and the bribe answer. Use power and Bribe buttons appear for the general. The rule guide has a Rank and the general topic.
- *Bots.* Sensible bots now serve rather than hide (serving pays now), always use the power, take money from the richest player or the dearest property, and take bribes of 300 lakh or more. In the window, the target blocks with merit if they can and otherwise shows a cup; others hold back. Random bots also bribe. In 80 simulated games: 168 promotions, 24 new generals, 56 uses of power, 21 generals brought down, 12 blocks.
- *Simulation* (Myanmar, 4 bots): Quick games run a median of 31 rounds, Normal games 112 rounds (0.5% reach the cap). 400 games, no crash, no invariant failure. The World report is identical.

**D108. A loan that falls due is paid, with its interest, before any collateral is taken.** The owner found the lender losing money: interest built up as it should, but at the end of the term D104 handed the collateral to the lender and wiped the debt out, even when the borrower had the cash. A 1,000-lakh loan at 10% for 10 rounds owed 1,500 at the due date; the borrower held 5,100 lakh but kept it, and the lender got a 60-lakh city. The spec says the collateral goes to the lender when the borrower *cannot* repay ("မဆပ်နိုင်ရင်"). So now, at the round start that ends the term, the debt (the amount lent plus interest, less what was paid) is paid from the borrower's cash. Only if the cash does not cover it does the borrower pay all they have and the lender take the collateral as well, for what is missing. The same loan now returns 2,000 lakh to the lender (400 at Start, 1,600 at the due date). In the simulation, 62 loans that fell due were paid in full and 2 ended with the collateral; before the fix, 61 had ended by losing the collateral. Interest, Start repayments and bankruptcy are unchanged.

**D109. Rent during military service; army pay and half rent for ranks.** The owner changed two rules on 2026-10-15:
- *Rent during service.* A player in military service (hiding, serving or called up) now collects rent like anyone else, and tolls too. This replaces spec 7.1's "no rent during conscription except fled" and the D102 rule built from it.
- *Half rent for a rank.* A player with an army rank (1 or more) collects half rent on everything they own (cities, transport and companies), "because the army pays them". Rank only comes from serving, so the cut starts with a player's first promotion and lasts as long as they have a rank. Tolls are not rent and stay whole. The rent panel says why the rent is halved.
- *Army pay is now regular.* The owner asked what I thought. Until now (D107) the salary, rank × 200 lakh, was paid once, at the end of each service. A permanent halving of rent for a single 200 to 400 lakh would make serving a loss, so nobody would serve and no general would ever appear. Since the reason given for the cut is the army salary, the salary is now paid every time the player passes Start, as well as on return from serving. Low ranks still give up more rent than they earn once they own a lot, while high ranks and the general come out ahead. That keeps the trade-off without making the army pointless. This is my call: if the owner wants the salary once only, it is one line in `general.ts` (`startSalary`).
- *Simulation* (Myanmar, 4 bots): Quick games run a median of 34 rounds (31 before); Normal games 152 rounds (112), and 3.5% reach the 2,000-round cap (0.5%), because owners with a rank collect half rent. Players still serve (148 times in 80 games), and generals still rise and fall. 400 games, no crash, no invariant failure. The World report is identical.

**D110. Myanmar Start pays 750 lakh.** The owner asked for the Myanmar map's Start pay to be 750 lakh instead of the spec's 500, for passing or landing on it (as D100 did for World Start). `MYANMAR.startBonus` is the one number; the three Chance card texts that state it were updated in English and Burmese. Everything else is unchanged, including the army salary and the 25% loan repayment at Start. Merged at the owner's request without running the tests again.

**D111. Ranks are seen by all; a player with a rank may not buy land.** The owner, 2026-10-15:
- *Everyone sees everyone's rank.* In room play on large screens the other players were only chips with name and money, so their rank could not be seen. Each chip now carries a small gold badge with the rank number on its token, the tooltip names the rank and the general, and every player's property sheet shows their rank. Player cards (one shared device, phones) already showed it.
- *No land for a rank.* A player with an army rank (1 or more) may not buy land. Landing on an unowned property, they can only pass, and the panel says why. The auction that follows leaves out every player with a rank. In a trade they cannot receive a property (that would be buying it from a player); they can still give one. The general's power still takes a property, since spec v2 grants it, and a lender with a rank still gets the collateral of an unpaid loan.

**D112. Players with a rank may buy land again.** At the owner's request (2026-10-15), D111's ban on buying land for a player with an army rank is withdrawn: they buy, bid and trade like anyone else. D111's other half stays: every player's rank is shown to all.

**D113. From rank 4, no land and no auction; the rule guide explains rank, salary and powers.** The owner, 2026-10-15:
- *Rank 4 or more may not buy land.* A player of rank 4, 5 or 6 who lands on a property for sale goes past it with no Buy decision; the property stays for sale and is not put up for auction (the owner: "skip it as it is"). The log says why. Such a player also does not bid in auctions others start, since bidding is buying. Ranks 1 to 3 buy as before (D112). Trades, the general's power and loan collateral are unchanged.
- *Rule guide.* The single "Rank and the general" topic becomes three: *Military rank* (how rank is earned, that everyone sees it, half rent, no land from rank 4), *Army salary* (when it is paid, with a table of the salary for each rank), and *The general's powers* (who is general, the power, blocking, unrest, bribes, where to see it all).


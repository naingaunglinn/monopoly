# Global Monopoly — Complete Build Specification

Oct 8, 2026 · @Brycen Claude Max

## 1. How to work

Build a complete, playable game the owner can start and play at once. A mockup is a failure.

- The owner will not answer design questions. Never stop to ask one. When something is undefined, choose the simplest option that fits this spec and log it in `DECISIONS.md`.
- This document is the single source of truth. Do not change prices, the board or the rules.
- When goals conflict: gameplay > readability > performance > animation > decoration.
- Never claim something works unless you ran it.

**Stack.** TypeScript, React, Vite, Vitest, Playwright, plain CSS with custom properties. Use pnpm, or npm if pnpm is missing. No backend, database, login, network call, CDN or remote asset.

**Scripts.** `dev`, `build`, `preview`, `test`, `test:e2e`, `sim`.

**Files to create first.** `CLAUDE.md` (commands, folder layout, codebase rules), `DECISIONS.md`, `README.md` (how to run and how to play).

**Milestones.** Finish and commit each one before starting the next.

| Milestone | Deliverable | Exit check |
| --- | --- | --- |
| M1 | Data and engine, no UI | All engine tests in section 15 pass |
| M2 | Headless simulation | 400 seeded games finish with no crash and no invariant failure |
| M3 | Playable UI, no animation | A full game can be played by clicking, from setup to winner |
| M4 | Visual identity, animation, responsive layout, accessibility | The screenshot review in section 15 passes |
| M5 | Verification and final report | Every item in section 15 is done |

If a frontend-design skill is available, use it in M4, inside the identity set in section 10.

## 2. Product and principles

GLOBAL MONOPOLY is a property board game for 2 to 6 players who share one device and pass it around. The title lives in one constant, `GAME_TITLE`, so it can be renamed in one place.

- No account, login, server, database, networking or turn timer.
- Fully offline once loaded. All state lives in memory and localStorage.
- A turn lasts as long as the player wants. The next player starts only after the current one ends their turn.
- The board is fixed. Dice, card order and (optionally) the first player are random.
- Cities, airports, companies, cards, prices and UI text are data, never hard-coded into components.
- The look is original. Do not copy Monopoly's logo, artwork, typography, tokens or card wording.
- English UI. Every string sits in `src/ui/strings.ts` so another language (for example Burmese) can be added later.

| Screen | Support |
| --- | --- |
| 1280 × 720 and larger, landscape | Primary target; everything comfortable |
| 1024 × 768 | Must stay fully playable |
| Tablet, landscape | Playable by touch |
| Tablet portrait and phones | Not a target; show a rotate hint and do not break |

## 3. Board

The board has exactly 80 spaces, indexed 0 to 79, and players always move clockwise (index +1, wrapping 79 to 0). This layout is final; do not rearrange it.

Counts: 42 cities, 10 airports, 8 companies and 20 special spaces (World Start, Jail, Go To Jail, Vacation, Free Parking, Income Tax, Luxury Tax, 6 Chance, 7 Event).

### Top row, left to right

| Index | Space | Type |
| --- | --- | --- |
| 0 | World Start (corner) | start |
| 1 | Brasília | city |
| 2 | Chance | chance |
| 3 | Rio de Janeiro | city |
| 4 | Brazil Airport | airport |
| 5 | Income Tax | tax |
| 6 | Mexico City | city |
| 7 | Event | event |
| 8 | Guadalajara | city |
| 9 | Mexico Airport | airport |
| 10 | Monterrey | city |
| 11 | Transportation Company | company |
| 12 | Cairo | city |
| 13 | Chance | chance |
| 14 | Alexandria | city |
| 15 | Egypt Airport | airport |
| 16 | Oil Company | company |
| 17 | Jail (corner) | jail |

### Right column, top to bottom

| Index | Space | Type |
| --- | --- | --- |
| 18 | Jerusalem | city |
| 19 | Event | event |
| 20 | Tel Aviv | city |
| 21 | Haifa | city |
| 22 | Madrid | city |
| 23 | Chance | chance |
| 24 | Barcelona | city |
| 25 | International Shipping Company | company |
| 26 | Rome | city |
| 27 | Italy Airport | airport |
| 28 | Milan | city |
| 29 | Event | event |
| 30 | Venice | city |
| 31 | Electricity / Power Grid | company |
| 32 | Berlin | city |
| 33 | Munich | city |
| 34 | Free Parking | freeParking |
| 35 | Germany Airport | airport |
| 36 | Frankfurt | city |
| 37 | Global Trading Company | company |
| 38 | Tokyo | city |
| 39 | Japan Airport | airport |
| 40 | Vacation (corner) | vacation |

### Bottom row, right to left

| Index | Space | Type |
| --- | --- | --- |
| 41 | Osaka | city |
| 42 | Event | event |
| 43 | Seoul | city |
| 44 | Busan | city |
| 45 | Telecommunications Company | company |
| 46 | Beijing | city |
| 47 | Chance | chance |
| 48 | China Airport | airport |
| 49 | Shanghai | city |
| 50 | Shenzhen | city |
| 51 | Rice Trading Company | company |
| 52 | Yangon | city |
| 53 | Event | event |
| 54 | Mandalay | city |
| 55 | Myanmar Airport | airport |
| 56 | Naypyitaw | city |
| 57 | Go To Jail (corner) | goToJail |

### Left column, bottom to top

| Index | Space | Type |
| --- | --- | --- |
| 58 | Paris | city |
| 59 | Chance | chance |
| 60 | Lyon | city |
| 61 | Marseille | city |
| 62 | Event | event |
| 63 | Amsterdam | city |
| 64 | Rotterdam | city |
| 65 | Luxury Tax | tax |
| 66 | London | city |
| 67 | United Kingdom Airport | airport |
| 68 | Manchester | city |
| 69 | Birmingham | city |
| 70 | Chance | chance |
| 71 | Toronto | city |
| 72 | Vancouver | city |
| 73 | Global Finance Company | company |
| 74 | New York | city |
| 75 | Event | event |
| 76 | Los Angeles | city |
| 77 | United States Airport | airport |
| 78 | Chicago | city |
| 79 | San Francisco | city |

### Geometry

The board is a rectangular ring on a grid of 18 columns by 24 rows, with corners at spaces 0, 17, 40 and 57. A square ring would leave tiles about 32px wide at 1280 × 720, which is unreadable.

| Index i | Column | Row |
| --- | --- | --- |
| 0 to 17 | i | 0 |
| 18 to 40 | 17 | i − 17 |
| 41 to 57 | 57 − i | 23 |
| 58 to 79 | 0 | 80 − i |

Write a test that asserts the counts above, the country order in section 4, and that each company sits between its two countries.

## 4. Property data

There are 60 properties: 42 cities in 16 countries, 10 airports and 8 companies. Use every number below exactly.

Countries in clockwise order: Brazil, Mexico, Egypt, Israel, Spain, Italy, Germany, Japan, South Korea, China, Myanmar, France, Netherlands, United Kingdom, Canada, United States. France is the country; Paris is one of its cities.

### Cities

Hotel cost is always house cost × 2.

| Country | City | Space | Buy ($) | Base rent ($) | House cost ($) |
| --- | --- | --- | --- | --- | --- |
| Brazil | Brasília | 1 | 70 | 7 | 40 |
| Brazil | Rio de Janeiro | 3 | 90 | 9 | 40 |
| Mexico | Mexico City | 6 | 110 | 11 | 45 |
| Mexico | Guadalajara | 8 | 130 | 13 | 45 |
| Mexico | Monterrey | 10 | 150 | 15 | 45 |
| Egypt | Cairo | 12 | 170 | 17 | 50 |
| Egypt | Alexandria | 14 | 190 | 19 | 50 |
| Israel | Jerusalem | 18 | 210 | 21 | 55 |
| Israel | Tel Aviv | 20 | 230 | 23 | 55 |
| Israel | Haifa | 21 | 250 | 25 | 55 |
| Spain | Madrid | 22 | 270 | 27 | 60 |
| Spain | Barcelona | 24 | 290 | 29 | 60 |
| Italy | Rome | 26 | 310 | 31 | 65 |
| Italy | Milan | 28 | 330 | 33 | 65 |
| Italy | Venice | 30 | 350 | 35 | 65 |
| Germany | Berlin | 32 | 370 | 37 | 70 |
| Germany | Munich | 33 | 390 | 39 | 70 |
| Germany | Frankfurt | 36 | 410 | 41 | 70 |
| Japan | Tokyo | 38 | 430 | 43 | 75 |
| Japan | Osaka | 41 | 450 | 45 | 75 |
| South Korea | Seoul | 43 | 470 | 47 | 80 |
| South Korea | Busan | 44 | 490 | 49 | 80 |
| China | Beijing | 46 | 510 | 51 | 85 |
| China | Shanghai | 49 | 530 | 53 | 85 |
| China | Shenzhen | 50 | 550 | 55 | 85 |
| Myanmar | Yangon | 52 | 570 | 57 | 90 |
| Myanmar | Mandalay | 54 | 590 | 59 | 90 |
| Myanmar | Naypyitaw | 56 | 610 | 61 | 90 |
| France | Paris | 58 | 630 | 63 | 95 |
| France | Lyon | 60 | 650 | 65 | 95 |
| France | Marseille | 61 | 670 | 67 | 95 |
| Netherlands | Amsterdam | 63 | 680 | 68 | 100 |
| Netherlands | Rotterdam | 64 | 690 | 69 | 100 |
| United Kingdom | London | 66 | 700 | 70 | 105 |
| United Kingdom | Manchester | 68 | 710 | 71 | 105 |
| United Kingdom | Birmingham | 69 | 720 | 72 | 105 |
| Canada | Toronto | 71 | 730 | 73 | 110 |
| Canada | Vancouver | 72 | 740 | 74 | 110 |
| United States | New York | 74 | 750 | 75 | 115 |
| United States | Los Angeles | 76 | 760 | 76 | 115 |
| United States | Chicago | 78 | 770 | 77 | 115 |
| United States | San Francisco | 79 | 780 | 78 | 115 |

### City rent

If the owner does not hold the whole country, rent is the base rent. Once the country is complete, rent follows this table.

| Building level | Rent |
| --- | --- |
| No building | Base rent × 2 |
| 1 house | Base rent × 4 |
| 2 houses | Base rent × 7 |
| 3 houses | Base rent × 11 |
| 4 houses | Base rent × 15 |
| Hotel | Base rent × 20 |

### Airports

| Airport | Space | Price ($) |
| --- | --- | --- |
| Brazil | 4 | 100 |
| Mexico | 9 | 110 |
| Egypt | 15 | 120 |
| Italy | 27 | 130 |
| Germany | 35 | 140 |
| Japan | 39 | 150 |
| China | 48 | 160 |
| Myanmar | 55 | 170 |
| United Kingdom | 67 | 180 |
| United States | 77 | 200 |

Airport rent depends on how many airports the owner holds.

| Airports owned | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rent ($) | 40 | 90 | 160 | 250 | 350 | 475 | 625 | 800 | 1,000 | 1,250 |

### Companies

Rent is the total of two fresh dice × the multiplier. Example: 4 + 3 = 7 on Transportation costs 7 × $25 = $175.

| Company | Space | Between | Price ($) | Multiplier ($) |
| --- | --- | --- | --- | --- |
| Transportation Company | 11 | Mexico and Egypt | 200 | 25 |
| Oil Company | 16 | Egypt and Israel | 180 | 25 |
| International Shipping Company | 25 | Spain and Italy | 280 | 35 |
| Electricity / Power Grid | 31 | Italy and Germany | 220 | 30 |
| Global Trading Company | 37 | Germany and Japan | 320 | 40 |
| Telecommunications Company | 45 | South Korea and China | 360 | 45 |
| Rice Trading Company | 51 | China and Myanmar | 260 | 35 |
| Global Finance Company | 73 | Canada and United States | 400 | 50 |

## 5. Core rules

Implement these rules as written. They follow standard Monopoly except where this spec sets a custom rule; where the spec is silent, the standard rule applies.

### 5.1 Starting a game

- Every player starts on space 0 with the chosen starting money and 3 Free Stay tokens (0 if Free Stay is off).
- Turn order is seating order. Player 1 goes first, or a random player if that setting is on.

### 5.2 Turn flow

1. Pass-device screen (if on). The player taps I'm ready.
2. Turn start. If this turn is to be skipped (Vacation), show a short notice, clear the flag and pass the turn. If the player is in Jail, show the Jail choices (5.11).
3. Roll two dice.
4. A third double in the same turn sends the player to Jail and ends the turn.
5. Move clockwise one space at a time. Collect $500 when passing or landing on World Start.
6. Resolve the space (5.4). A card may move the player again; resolve the new space too.
7. If the player stands on their own city in a complete country, offer building on that city only (5.8).
8. Settle any debt (section 7), then check bankruptcy and the win condition.
9. After doubles, and if not in Jail, go back to step 3. Otherwise the player presses End turn.
10. The turn passes to the next living player.

During their own turn, whenever no decision is pending, the player may also trade, view properties, sell buildings, and mortgage or unmortgage properties.

### 5.3 Dice

- Doubles grant another roll. The doubles counter is per turn and resets when the turn ends.
- Three doubles in one turn: go to Jail at once. The third roll does not move the token.
- A Roll again card grants one extra roll and does not count as doubles.

### 5.4 What each space does

| Space | Result |
| --- | --- |
| Unowned city, airport or company | Buy or Pass (5.5) |
| Another player's city | Pay rent, or use a Free Stay token (5.6, 5.10) |
| Another player's airport | Pay airport rent |
| Another player's company | Roll two new dice and pay total × multiplier |
| Own property | Nothing to pay; a city may offer building (5.8) |
| Chance or Event | Draw the top card and apply it (section 6) |
| World Start | +$500, never doubled with passing |
| Income Tax | Pay $300 to the bank |
| Luxury Tax | Pay $500 to the bank |
| Jail | Just visiting; nothing happens |
| Go To Jail | Go to Jail (5.11) |
| Vacation | The player's next turn is skipped (5.12) |
| Free Parking | Nothing happens |

### 5.5 Buying

- Buy: pay the price to the bank and take ownership.
- Pass: the property goes to auction (section 7). With auctions off it stays unowned.
- Without enough cash, Buy is disabled and says why. The player can still bid in the auction.

### 5.6 Rent

- City in an incomplete country: base rent.
- City in a complete country: base rent × the multiplier for its building level (section 4).
- Airport: by the number of airports the owner holds.
- Company: the lander rolls two new dice. These dice never count as doubles and never move the token.
- Owners collect rent while in Jail or on Vacation. A mortgaged property collects no rent.
- Active Event modifiers apply last. Round to whole dollars.

### 5.7 Complete country

A country is complete when one player owns every city in it. Airports and companies belong to no country set. A mortgaged city still counts as owned.

### 5.8 Building: the house rule (implement exactly)

A player may build only on the city they have just landed on.

- The player must own every city in that country, and none of them may be mortgaged.
- The player must be standing on that exact city, having arrived on this move by dice or by card.
- The permission lasts from landing until the player rolls again or ends the turn. It never covers another city, even in the same country.
- Even building: after any build, no city in the country may be more than one level above another.
- Levels are 0, 1, 2, 3 and 4 houses, then a hotel (level 5). One hotel at most.
- A house costs the city's house cost. A hotel needs 4 houses, costs house cost × 2 and replaces the 4 houses.
- Several levels may be built in one landing if the even rule allows and cash covers it.
- Houses and hotels are unlimited in supply.
- Airports and companies never have buildings.

Example: a player owns Brasília and Rio de Janeiro and lands on Brasília. They may build on Brasília only, never on Rio this move. With Brasília at 2 houses and Rio at 1, a third house on Brasília is refused until Rio reaches 2.

### 5.9 Selling buildings

- Allowed on the player's own turn and whenever they are in debt, on any city they own. The landing rule does not apply to selling.
- One level at a time, with the even rule in reverse: sell from the highest city first.
- A house refunds house cost × 50%. A hotel refunds house cost × 1 (50% of the hotel cost) and the city drops to 4 houses.

### 5.10 Free Stay

- Usable only when landing on another player's city, instead of paying that rent.
- Not usable on airports, companies, taxes, cards or fees.
- A player never holds more than 3. A Free Stay card drawn while holding 3 pays $100 instead.

### 5.11 Jail

- A player goes to Jail by landing on Go To Jail, drawing a Go To Jail card, or rolling three doubles in one turn.
- Going to Jail: move straight to space 17, collect no Start money, the turn ends, doubles are ignored.
- At the start of a turn in Jail the player picks one option.

| Choice | Result |
| --- | --- |
| Pay $300 | Leave, then roll and move as a normal turn |
| Use a Get Out of Jail card | Leave, then roll and move as a normal turn |
| Roll for doubles | Doubles: leave and move that total, with no extra roll. Otherwise stay, and the turn ends |

- After a third failed roll the player must pay $300 (debt rules apply) and moves that total.
- Jailed players still collect rent, trade and bid.

### 5.12 Vacation

- Landing on Vacation skips that player's next turn, exactly once.
- The current turn continues normally, including a re-roll after doubles.
- Ownership and rent income are unaffected. A skipped turn is not a Jail attempt.
- With Vacation off, the space does nothing.

### 5.13 World Start

- $500 for passing or landing, by dice or by forward card movement.
- Nothing for moving backward or for going to Jail.

### 5.14 Mortgage

Mortgaging lets a player raise cash from a property without losing it, as in standard Monopoly.

- Any city, airport or company can be mortgaged for 50% of its price, paid by the bank.
- A city can be mortgaged only when no city in its country has buildings. Those buildings must be sold first.
- A mortgaged property collects no rent. It still counts as owned, both for completing a country and for the airport count.
- No building is allowed in a country while any of its cities is mortgaged.
- To unmortgage, pay the mortgage value plus 10%, rounded up to a whole dollar. Example: Tokyo costs $430, mortgages for $215 and unmortgages for $237.
- A player may mortgage and unmortgage on their own turn whenever no decision is pending, and may mortgage while in debt.
- A mortgaged property can be traded and stays mortgaged. No fee is charged when it changes hands.

## 6. Cards

Each deck is a shuffled list of at least 30 cards defined as data. Draw the top card, apply it, discard it; when a deck is empty, shuffle its discard pile into a new deck.

Card fields: `id`, `deck`, `title`, `text`, `icon`, `tone` (good, bad or neutral) and `effect`.

### Effect types (use only these)

| Effect | Meaning |
| --- | --- |
| cash(n) | The drawing player gains or loses n |
| allPlayersCash(n) | Every player gains or loses n |
| cashPerPlayer(n) | Positive: collect n from each other player. Negative: pay n to each |
| move(n) | Move n spaces forward or backward |
| moveTo(target) | Move forward to the nearest airport, the nearest company, a country's first city, or a space index |
| goToJail, goToVacation, rollAgain | As named |
| freeStay | +1 Free Stay token |
| freeHouseVoucher | Kept by the player. Pays for the next house (not hotel) they legally build. Does not bypass the landing rule |
| getOutOfJail | Kept by the player until used, then discarded. Can be traded |
| perBuildingFee(house, hotel) | Pay the bank per building owned |
| companyOwnerCash(company, n) | That company's owner gains or loses n. Nothing happens if it is unowned |
| perAssetCash(kind, n) | Every player gains or loses n per airport, company or city owned, capped at $300 per player |
| modifier(type, factor) | A temporary change to cityRent, airportRent, companyRent or buildCost |

### Rules

- Nearest means the next one clockwise from the player. Forward movement past World Start pays $500.
- After any card movement, resolve the new space fully: rent, buy, build offer or another card.
- A modifier's factor is between 0.5 and 1.5. It lasts until the drawing player's next turn begins. Only one per type is active; a new one replaces the old. Active modifiers show as chips in the top bar.
- Held cards (Jail card, house voucher) leave the deck until used.
- With Chance or Event off, those spaces do nothing and are drawn as Rest spaces.
- With Vacation off, remove Go to Vacation cards. With Free Stay off, Free Stay cards pay $100.

### Balance limits

- A single cash effect stays within ±$300. Per-player transfers are at most $100 each.
- Each deck's fixed cash effects sum to roughly zero.
- Chance holds at most 2 each of Go To Jail, Go to Vacation, Get Out of Jail, Free House and Roll again.
- The Event deck has no Go To Jail. No card ever destroys buildings or changes ownership.

### Required content

Chance must include at least: Collect $200, Collect $300, Pay $150, Pay $250, Move forward 3, Move backward 2, Move to nearest Airport, Move to nearest Company, Move to Brazil, Move to United States, Roll again, Free Stay +1, Free House, Go to Vacation, Go to Jail, Collect $100 from every player, Pay $100 to every player, Get Out of Jail Free.

Event must include these themes, each mapped to an effect above: Tourism Boom, Global Recession, Oil Price Boom, Oil Price Crash, Electricity Crisis, Rice Export Boom, Transportation Strike, Shipping Boom, Trade Agreement, Currency Crisis, Tax Refund, Salary Bonus, Medical Expense, Natural Disaster, Construction Discount, Construction Cost Increase, Airport Promotion, Business Expansion, Global Market Boom, Economic Slowdown.

Write original card text. Chance cards read like a traveller's luck; Event cards read like world news headlines. Every card states its exact effect in plain words.

## 7. Auction, trading, debt and bankruptcy

All four happen on the one shared device, so every panel names whose decision it is.

### 7.1 Auction

- An auction starts when a player passes on an unowned property and auctions are on. Every living player may bid, including the one who passed.
- Bidding goes clockwise, starting with the player after the lander. The lander bids last.
- On their turn a bidder raises (+$10, +$50, +$100 or a typed amount) or folds. A bid must beat the current high bid and cannot exceed the bidder's cash. The first bid is at least $1.
- A fold is final. A player who cannot afford the next bid folds automatically.
- The auction ends when one bidder remains and holds the high bid. They pay the bank and own the property. If everyone folds with no bid, it stays unowned.

### 7.2 Trading

- The current player may open a trade whenever no decision is pending, and while in debt.
- They pick one partner, then fill two columns, You give and You get, with cities, airports, companies, Get Out of Jail cards and cash.
- On submit the panel says Hand the device to the partner. The partner accepts or rejects. There are no counter-offers and no forced trades.
- A city cannot be traded while any city in its country has buildings. Sell the buildings first. A mortgaged property can be traded and stays mortgaged with its new owner.
- Free Stay tokens and house vouchers cannot be traded.
- An accepted trade applies in one step.

### 7.3 Debt

- A player who owes more than their cash enters the Debt phase. The panel shows the amount, the creditor and the shortfall.
- To raise money they may sell buildings (5.9), mortgage properties (5.14), or propose a trade.
- Pay becomes available once cash covers the debt. The turn cannot end while in debt.
- A payment owed to several players is paid in turn order.

### 7.4 Bankruptcy

- A player in debt may declare bankruptcy at any time. With no buildings and no unmortgaged properties left, bankruptcy is automatic.
- Their buildings are sold to the bank at 50% first.
- If the creditor is a player, that player receives all remaining cash and properties. Mortgaged ones stay mortgaged.
- If the creditor is the bank, the properties become unowned and unmortgaged again.
- Held cards return to the discard piles. The player is out of the game.

## 8. Winning, modes and settings

Quick mode is the default, because the landing-only building rule makes last-survivor games very long.

| Mode | The game ends when | Winner |
| --- | --- | --- |
| Quick (default) | The round limit is completed, or the first player goes bankrupt | Highest net worth |
| Normal | One player is left | The survivor |

- A round ends each time the turn order wraps to the first living player.
- Net worth = cash + purchase price of every owned city, airport and company + building value. Building value is house cost per house; a hotel counts as 6 × house cost. A mortgaged property counts at half its price.
- Ties: more cash wins. Still tied: the win is shared.
- A bankrupt player ranks last.

### Setup options

| Setting | Options | Default |
| --- | --- | --- |
| Players | 2, 3, 4, 5, 6 | 2 |
| Player names | Editable text | Player 1 to Player 6 |
| Starting money | $3,000, $4,000, $5,000 | $4,000 |
| Game mode | Quick, Normal | Quick |
| Round limit (Quick only) | 30, 50, 100 | 50 |
| Free Stay | On, Off | On |
| Vacation | On, Off | On |
| Auction | On, Off | On |
| Chance | On, Off | On |
| Event | On, Off | On |
| Random first player | On, Off | Off |
| Pass-device screen | On, Off | On |
| Animation speed | Normal, Fast, Off | Normal |

Pass-device screen and animation speed can also be changed during a game. Player colours and tokens are assigned automatically in seat order.

## 9. Architecture

Rules live in a pure engine; the UI only reads state and sends actions, so every rule is testable without rendering.

```text
src/
  engine/   reducer, phases, rent, building, cards, auction, trade, debt, rng
  data/     board, cities, airports, companies, chance, events, balance
  ui/       screens, components, animation player, strings.ts, theme.css
  sim/      bots and the simulation runner
tests/      engine unit tests and e2e tests
```

### Engine contract

- `reduce(state, action)` returns `{ state, events }`. It is pure: no React, DOM, timers, `Date.now` or `Math.random`.
- An illegal action returns a typed error with a plain-language reason. The UI shows that reason.
- `legalActions(state)` lists what the current decision-maker can do. The UI enables buttons from it and the bots choose from it.
- `events` describe what just happened: dice rolled, token path, money moved, card drawn, building added, player jailed. The UI animates them. State is already final when they are emitted.
- All numbers come from `src/data/balance.ts`.

### Game state

| Part | Holds |
| --- | --- |
| players | id, name, colour, token, cash, position, freeStay, inJail, jailAttempts, skipNextTurn, jailCards, houseVouchers, bankrupt, recap |
| properties | owner, building level and mortgaged flag per space index |
| decks | chanceDeck, chanceDiscard, eventDeck, eventDiscard |
| turn | currentPlayerIndex, doublesCount, landedCity, turnNumber, roundNumber |
| flow | phase, pending decision (auction, debt, trade, card), modifiers |
| meta | settings, rngState, winner, log, schemaVersion |

### Phases

The phase is an explicit, serialisable state machine with exactly these values: PassDevice, TurnStart, AwaitRoll, BuyDecision, Auction, RentDue, CompanyRoll, CardReveal, BuildOffer, Debt, AwaitEndTurn, GameOver. No invalid transition may be reachable from the UI.

### Randomness

- Use a seeded PRNG (for example mulberry32) whose state is part of the game state. The same seed and the same actions always produce the same game.
- Seed from `crypto.getRandomValues`, or from `?seed=N` in the URL. Players never see the seed.

### Save and resume

- localStorage key `global-monopoly/save/v1`, with a `schemaVersion` field.
- Autosave after every action. Animations are not state, so every save is at a clean point.
- Start screen: New game, Continue (enabled when a save exists), Rules. In game: Save, which confirms with a toast, and New game, which asks for confirmation.
- Continue restores the exact phase and pending decision.
- A corrupt or older save shows a clear message and offers a new game. It never crashes.

### Debug tools

`?debug=1` adds a panel to set the next dice, move a player, add or remove cash, set an owner, set building levels and force the next card. It is hidden otherwise.

## 10. Visual identity

The game looks like a world atlas laid on a table and labelled like airport signage: paper tiles around a deep-blue ocean, and one signal-yellow button that always means do the next thing.

The ocean in the centre of the board is the one bold element. Everything around it stays quiet.

### Palette

| Token | Hex | Use |
| --- | --- | --- |
| Chart paper | #EEF2F5 | App background |
| Tile | #FFFFFF | Tiles, panels, cards |
| Tile line | #D5DCE3 | Borders and dividers |
| Ocean | #12436B | Board centre |
| Ocean line | #1E5A8A | Map lines drawn on the ocean |
| Ink | #14202B | Main text |
| Ink soft | #5B6875 | Secondary text |
| Signal yellow | #FFC233 | The primary button only, with Ink text |
| Gain green | #1E9E5A | Money gained, success |
| Loss red | #D6362B | Money lost, danger |
| Amber | #E8930C | Warnings |
| Info blue | #2B6CD9 | Hints and links |

Money always carries a sign and a symbol, such as +$500 or −$300, never colour alone.

### Country colours

| Country | Colour | Hex |
| --- | --- | --- |
| Brazil | Rainforest green | #2F9E63 |
| Mexico | Terracotta | #B8543A |
| Egypt | Desert sand | #C9A13E |
| Israel | Sky blue | #4A9FE0 |
| Spain | Saffron orange | #E3812B |
| Italy | Olive | #7D8F2E |
| Germany | Steel grey | #5F6B78 |
| Japan | Sakura pink | #E06C9A |
| South Korea | Jade teal | #2FA3A0 |
| China | Lacquer red | #C4372F |
| Myanmar | Pagoda gold | #E0B21C |
| France | Lavender | #7C68C6 |
| Netherlands | Tulip magenta | #B83F8E |
| United Kingdom | Royal blue | #2F4FB5 |
| Canada | Maple brown | #9A5B2C |
| United States | Midnight navy | #1C2F4F |

- Use a country colour only for the tile's colour band, the Focus Card header and country chips. Never for large areas.
- Text on a band must pass WCAG AA: white on dark bands, Ink on light ones.
- If two neighbouring countries look alike on screen, adjust one and log it.

### Players

| Seat | Colour | Hex | Token |
| --- | --- | --- | --- |
| 1 | Red | #E5484D | Globe |
| 2 | Blue | #3E63DD | Plane |
| 3 | Green | #30A46C | Compass |
| 4 | Orange | #F76B15 | Crown |
| 5 | Purple | #8E4EC6 | Rocket |
| 6 | Teal | #0E9C9C | Star |

A token is a round chip in the player's colour with a white glyph, a white ring and a thin Ink outline, so it stays visible on any background. Draw the six glyphs as original inline SVG that read clearly at 16px.

### Type

- One family, Barlow, bundled with @fontsource (no remote fonts): Barlow for body and controls, Barlow Semi Condensed for tile names, Barlow Condensed for the title, dice total and large money.
- Sentence case everywhere. No letter-spaced all-caps labels.
- Tabular numerals for all money.
- Sizes in px: 11 on tiles (10 is the floor), 13 secondary, 15 body, 20 panel titles, 32 key numbers, 64 or more for the start-screen title.

### Shape and depth

- Tiles: 6px radius, 1px Tile line border, no shadow.
- Panels: 14px radius and one soft shadow.
- Buttons: 10px radius. The primary button has a 3px darker bottom edge and presses down 2px, like a physical game button.
- Dice: ivory cubes with Ink pips and the same pressed-edge depth.
- No decorative gradients and no glass blur. Glow appears only in the short landing and hotel highlights.

### Signature pieces

- Ocean: an SVG graticule (latitude and longitude lines), a compass rose and a few dotted flight arcs in Ocean line. Simplified continents are optional; skip them if they take more than an hour.
- Chance card: a boarding pass with a perforated stub.
- Event: a news-ticker banner across the ocean.
- Property deed (the Focus Card): a luggage tag with the country band on top.
- Start screen: the Ocean as background and a small ring drawn from the real board data in country colours.

### Icons and flags

- Never use flag emoji. Windows shows them as two letters. Bundle SVG flags locally, for example with the `flag-icons` package.
- Use one bundled icon set, for example lucide-react, for interface icons. Houses, hotels and tokens are original inline SVG.
- No emoji anywhere in the interface.

## 11. Screens and layout

The whole game fits one screen with no page scrolling: a slim top bar, the board ring filling the rest, and every control inside the ring.

### Start screen

The title, the line Build your global empire, and three buttons: New game, Continue (disabled without a save) and Rules. It loads instantly, with no intro animation.

### Setup screen

One screen, not a wizard: player count, names shown with their colour and token, the options from section 8, then Start game. The defaults are good enough to start a game in two clicks.

### Game screen at 1280 × 720

```text
+--------------------------------------------------------------------+
| Global Monopoly    Round 12   Turn 34    (token) Mia  $3,420  Menu |
+-----------+------------------------------------------+-------------+
| corner    |  16 card tiles (top row)                 |  corner     |
+-----------+------------------------------------------+-------------+
|           |  token lane                              |             |
| 22 row    |  +----------+ +-------------+ +--------+ |  22 row     |
| tiles     |  | Players  | | Focus Card  | | Log    | |  tiles      |
|           |  |          | | Dice        | |        | |             |
|           |  |          | | Primary btn | |        | |             |
|           |  +----------+ +-------------+ +--------+ |             |
|           |  token lane          (ocean)             |             |
+-----------+------------------------------------------+-------------+
| corner    |  16 card tiles (bottom row)              |  corner     |
+-----------+------------------------------------------+-------------+
```

- Top bar, about 44px tall: title, round, turn, the current player's token, name and cash, active modifier chips, a Rules button that is always visible, and a menu with Settings, Save and New game.
- Board grid: columns `150px repeat(16, 1fr) 150px` and rows `78px repeat(22, 1fr) 78px`, scaled up with `clamp()` on larger screens.
- Token lanes run along the inner edge of the ring, so tokens never cover tile text.
- The centre is the Ocean. It holds the HUD in three columns: players, play area and log.
- Decision panels open over the play area and the log. They never cover the ring or the players column.
- Only these may cover the board: setup, pass-device, trade, property list, rules and results.

### Other screens

| Screen | Content |
| --- | --- |
| Pass-device | Pass the device, the next player's name, colour and token, and an I'm ready button. Shown at the start of each player's turn, never on a doubles re-roll. Everything in this game is public, so this is a handover, not a privacy wall |
| Rules | The rule guide in section 16. It opens over the game at any time, even during a decision, and never changes game state |
| Winner | The winner's name and token, net worth, counts of cities, airports and companies, and buttons View results and New game |
| Results | Ranking of all players with cash, property value, building value, airport value, company value and net worth. Bankrupt players are marked |

## 12. Tiles and components

Tiles are compact by design; the Focus Card is where details are read at full size.

### Tiles

| Tile | Size at 1280 × 720 | Shows |
| --- | --- | --- |
| Card tile (top and bottom rows) | About 61 × 78 px | Country band with flag, name on up to 2 lines, price or rent, building pips, owner marker |
| Row tile (left and right columns) | About 150 × 24 px | One line: colour bar, flag, name, price or rent, building pips, owner marker |
| Corner tile | About 150 × 78 px | Icon and name |
| Special tile | Same as its neighbours | Icon and short name; taxes show the amount |

- An unowned property shows its price. An owned one shows its current rent, so players see what landing costs.
- Owner marker: the owner's token glyph in their colour, never colour alone.
- Buildings: 1 to 4 house pips, or one hotel pip. A mortgaged property has a hatched colour band and shows the word Mortgaged in place of its rent.
- No text below 10px. Whatever does not fit is dropped from the tile and shown in the Focus Card.
- The current player's tile has a clear ring. A city that can be built on right now shows a can-build marker.
- Hover or keyboard focus lifts the tile slightly and points the Focus Card at it. A click pins it.
- Below about 1100px wide, card tiles drop the name and keep the flag and the price or rent.

### Tokens

- Tokens stand in the token lane beside their tile. The current player's token is larger and on top.
- Several tokens on one space fan out and overlap by at most half.

### Focus Card

The Focus Card shows the hovered, focused or pinned tile, and otherwise the current player's tile.

| Tile type | Content |
| --- | --- |
| City | Name, flag, country, owner, price, house cost, hotel cost, the full rent table with the current row highlighted, building level, mortgage value and status, country status (complete, or 2 of 3 owned) |
| Airport | Owner, price, the rent ladder with the current step highlighted, mortgage value and status |
| Company | Owner, price, mortgage value and status, and the formula dice total × multiplier |
| Special | What happens when a player lands there |

### HUD

| Part | Content |
| --- | --- |
| Players column | One compact card per player: token, name, cash, counts of cities, airports and companies, Free Stay tokens, and badges for In Jail, On vacation and Bankrupt. The current player's card is larger with a solid border in their colour. Clicking a card opens that player's property list, grouped by country. On their own turn the current player sells buildings, mortgages and unmortgages from this list |
| Play area | Two large dice, their total and a Move 7 spaces line; the primary button; the secondary buttons Trade and My properties; a one-line recap at turn start |
| Primary button | One button in a fixed position that always shows the next required action: Roll dice, Buy, Pay, OK or End turn |
| Log | Scrolling list, newest at the bottom, one plain sentence per event, a colour dot per player, signed money |

### Decision panels

| Panel | Content | Actions |
| --- | --- | --- |
| Buy | The deed, the price, cash left after buying | Buy, Pass |
| Auction | The property, the high bid and bidder, whose turn it is to bid | +$10, +$50, +$100, custom amount, Fold |
| Rent | Owner, amount, and how it was calculated | Pay; Use Free Stay when allowed, with tokens left shown |
| Company rent | A roll, then dice total × multiplier = amount | Roll, Pay |
| Build | City, current buildings, cost; when blocked, the reason in words | Build house, Build hotel, Done |
| Chance | The boarding-pass card with its text | OK |
| Event | The news banner with its text | OK |
| Jail | Attempts used and the options | Pay $300, Use card, Roll for doubles |
| Vacation | Your next turn will be skipped | OK |
| Debt | Amount, creditor, shortfall, what can be sold or mortgaged | Sell buildings, Mortgage, Trade, Pay, Declare bankruptcy |
| Bankruptcy | The player's name and where their assets go | Continue |
| Trade | The two columns You give and You get | Send offer; then Accept or Reject |

Mandatory panels cannot be dismissed by clicking outside or pressing Esc. Every panel has a small help button that opens the rule guide at the matching topic. A build panel that blocks an action explains why, for example: Your other Japan cities must have the same number of houses first.

## 13. Animation and feedback

Animation explains what happened and never makes a player wait: state changes first, the interface then plays the events, and any click or key press skips them.

| Moment | What the player sees | Normal duration |
| --- | --- | --- |
| Dice roll | Dice tumble and land, the total appears, then Move N spaces | 700 ms |
| Token move | One space at a time; path tiles light briefly | 150 ms a step; 90 ms a step for 10 or more spaces |
| Passing World Start | The Start tile flashes, +$500 floats up, cash counts up | 600 ms |
| Landing | A small bounce and a short glow on the tile | 300 ms |
| Money change | The number counts to its new value; the signed amount floats beside the player card | 700 ms |
| Buying | The tile highlights, the owner marker pops in, a Bought stamp shows | 500 ms |
| Rent | Signed amounts on both player cards; a coin travels from payer to owner | 800 ms |
| House | The new pip scales from 0.7 to 1 with a small bounce | 500 ms |
| Hotel | Four pips merge into the hotel pip with one short glow | 700 ms |
| Chance card | The card slides from the deck to the centre and flips | 600 ms |
| Event | The banner slides across the ocean | 300 ms |
| Go to Jail | The token slides straight to Jail; the tile highlights | 500 ms |
| Turn change and panels | Fade or slide | 200 ms |
| Winner | One short confetti burst, skippable | 2 s at most |

### Rules

- Speed setting: Normal uses the table, Fast halves every duration, Off applies changes instantly.
- With `prefers-reduced-motion`, movement and bounces are off and fades last 150 ms at most.
- Game logic never waits for an animation. Skipping or disabling one cannot change the result.
- A click, tap or key press during an animation finishes it at once.
- Nothing loops. The current player gets one pulse at turn start, then a static highlight.
- Animate only transform and opacity.

### Feedback

- An invalid action shakes the control once and shows a short reason, such as You need every city in Japan before building, or You don't have enough money.
- A disabled button always states why, inline or in a tooltip.
- Every rent or fee panel shows the sum, for example Tokyo, 2 houses: $43 × 7 = $301.

Sound is out of scope for this version. If added after M5, synthesise it with WebAudio, add a Sound on/off switch, and use no audio files or music.

## 14. Comfort, accessibility and responsive behaviour

A player should never wonder what to do next, and never need more than one click to do it.

### Comfort

- The primary button is always the next step. Space or Enter triggers it.
- Shortcuts: B buys, P passes, T opens trade, R opens the rule guide, Esc closes optional panels only.
- Decision panels open by themselves after landing; no extra click is needed to reach them.
- Rent with no choice to make needs a single OK. Free Stay is offered only when it can be used.
- Ask for confirmation only before accepting a trade, declaring bankruptcy or starting a new game.
- At turn start, one line recaps what happened to that player since their last turn, for example +$172 rent from Player 3.
- A small help button beside Free Stay, companies, airports and the building rule opens a two-line explanation and links to the full topic in the rule guide.
- Jail and Vacation status show on both the token and the player card.

### Accessibility

- Every control is reachable by keyboard and has a visible focus ring.
- Text contrast meets WCAG AA.
- Nothing relies on colour alone: owners have a glyph and a name, money has a sign.
- Buttons are at least 40px tall; touch targets are at least 44px.
- New log lines are announced through an aria-live region.

### Responsive behaviour

| Viewport width | Behaviour |
| --- | --- |
| 1600px and wider | The reference layout scaled up, with larger type |
| 1280 to 1599px | The reference layout in section 11 |
| 1024 to 1279px | Card tiles drop names; the log shows its last 3 lines and expands on click |
| Under 1024px or portrait | A rotate hint; the HUD moves below the board; the game stays playable |

No critical control may disappear or overflow at any supported size.

## 15. Testing, verification and report

The game is done only when the engine tests, the simulation, a scripted full game in the real UI and a screenshot review all pass.

### Engine tests (Vitest)

| Area | Must cover |
| --- | --- |
| Board | Counts, country order, company positions, index-to-grid mapping |
| Movement | Normal move, wrap from 79 to 0, passing Start, landing on Start pays once, backward move pays nothing |
| Property | Buy, pass, rent, complete country |
| Auction | Raises, folds, automatic fold, no bids, winner pays the bank |
| Building | Needs a complete country; needs landing on that exact city; refused on a sibling city; even rule; four houses; hotel; permission ends on the next roll; house voucher |
| Selling | Refunds, reverse even rule, hotel back to 4 houses |
| Airports | Buy, rent for 1 to 10 owned |
| Companies | Buy, extra dice, multiplier, extra dice never count as doubles |
| Cards | Every effect type, discard, reshuffle, held cards leave the deck, modifiers expire |
| Jail | Go To Jail space, card, three doubles, pay $300, use card, doubles escape with no extra roll, forced payment after the third failed roll |
| Vacation | Skips exactly one turn; doubles still re-roll on the landing turn |
| Free Stay | Starts at 3, decrements, cities only, cap of 3 |
| Trade | Valid swap, blocked when buildings exist, a rejected offer changes nothing |
| Debt and bankruptcy | Sell buildings, mortgage to cover a debt, bankrupt to a player, bankrupt to the bank, elimination |
| Winning | Normal last survivor; Quick by round limit; Quick by first bankruptcy; net worth; ties |
| Save | Serialise then parse gives an identical state; the same seed and actions give an identical game |
| Settings | Each on/off switch changes behaviour as specified |
| Mortgage | Pays half the price; refused while the country has buildings; no rent while mortgaged; still counts for the country and the airport count; blocks building; unmortgage costs 10% more, rounded up; stays mortgaged after a trade |
| Rule guide | Opening and closing it in every phase leaves the game state identical |

### Simulation (`sim` script)

- Play 200 Quick and 200 Normal seeded games with 4 bots, headless.
- Use two bots: one picks random legal actions; one plays sensibly (buys while keeping $300, builds when legal, uses Free Stay on rent above $150, pays the Jail fee when cash is above $1,000, mortgages its cheapest property when in debt, unmortgages when cash is above $1,500).
- After every action assert: no negative cash outside the Debt phase; one owner per property; building levels 0 to 5 that obey the even rule; no buildings in a country with a mortgaged city; a valid phase; at least one legal action.
- Cap Normal games at 2,000 rounds.
- Report median rounds, the share of Normal games that hit the cap, houses and hotels built per game, and bankruptcies per game.
- Do not change prices or rules because of the results. Put the numbers in the final report.

### UI verification (Playwright)

- Script a seeded Quick game (round limit 5, animation Off) through the real UI to the results screen. Any console error fails the run.
- Save, reload and Continue in the middle of a decision; the state must be identical.
- Repeat one run each with animation Normal and Fast, with reduced motion, and with the network disabled after load.
- Take screenshots at 1280 × 720, 1024 × 768 and 1920 × 1080 of: start, setup, a mid-game board, every decision panel, the rule guide, pass-device, winner and results.
- Open and look at every screenshot. Fix clipped or overlapping text, overflow, text under 10px and unclear ownership, then shoot again.

### Quality checklist

- [ ] City names, prices and rents are readable on the board
- [ ] Tokens are visible and never fully overlapped
- [ ] The current player and their cash are obvious
- [ ] The next action is obvious and one click away
- [ ] Ownership and building levels are visible
- [ ] Jail and Vacation status are visible
- [ ] Cards and events are understandable at a glance
- [ ] No layout overflow at the three screenshot sizes
- [ ] No animation blocks play; Fast, Off and reduced motion all work
- [ ] The winner and the ranking are obvious
- [ ] The game runs with the network disabled

### Final report

1. What was implemented.
2. How to run it: the commands and the local URL.
3. Results of the unit tests, the simulation and the UI run, with numbers.
4. Decisions made, from `DECISIONS.md`.
5. Known limitations.

Finish by starting the app and printing the local URL, so the owner can play at once.

## 16. Rule guide

The rule guide is the in-game help: a player opens it at any moment, finds the answer in a few seconds and returns to the game exactly where it was.

### Behaviour

- It opens from the Rules button in the top bar, the R key, the help button on any panel, and Rules on the start screen.
- It opens as an overlay, even during a mandatory decision, and never changes game state. Esc or Close returns to the game.
- Layout: a topic list on the left, the topic text on the right, and a search box on top that filters topics by any word.
- A help button opens the guide at its own topic: the Jail panel opens Jail, the Build panel opens Houses and hotels, and so on.
- Price and rent tables inside the guide are generated from the game data, never typed by hand.
- A topic that is switched off for the current game, such as Vacation, says so in its first line.
- Use the topic text below as written, one short point per line. Store it in `strings.ts`.

### Topics and text

#### Quick start

- Roll the dice and move clockwise.
- Land on a property nobody owns: buy it, or let everyone bid for it.
- Land on someone else's property: pay rent.
- Own every city of a country and its rent doubles. Then you can build houses, but only on the city you land on.
- Pass World Start and collect $500.
- Quick game: the richest player after the last round wins. Normal game: the last player not bankrupt wins.
- The yellow button always shows your next step.

#### Your turn

1. Tap I'm ready, then Roll dice.
2. Your token moves. Do what the space says.
3. Before or after rolling you can trade, mortgage, or sell buildings.
4. Rolled doubles? Roll again. Three doubles in one turn sends you to Jail.
5. Press End turn and pass the device.

#### World Start

- Collect $500 each time you pass it or land on it.
- You collect nothing when a card moves you backward or when you go to Jail.

#### Buying and auctions

- Land on an unowned city, airport or company and you may buy it at its price.
- If you pass, it is auctioned. Everyone can bid, including you. Bids start at $1.
- In an auction, players take turns to raise or fold. The last bidder left wins and pays the bank.

#### Cities and rent

- Land on another player's city and you pay its rent. The tile shows the rent you would pay right now.
- A mortgaged city charges no rent.
- You can use a Free Stay token instead of paying.

#### Countries

- A country is complete when one player owns all of its cities.
- In a complete country, rent on empty cities doubles and building becomes possible.
- Table: city rent by building level, from the game data.

#### Houses and hotels

- You need the whole country, with none of its cities mortgaged.
- You can build only on the city you have just landed on, and only during that move.
- Build evenly: no city may be more than one house ahead of the others in its country.
- You may build several houses in one landing if the even rule and your cash allow it.
- After 4 houses you can build a hotel. A hotel costs twice the house cost.

#### Selling buildings

- Sell on your own turn or when you owe money. You get half the cost back.
- Sell evenly, tallest city first. Selling a hotel leaves 4 houses.

#### Airports

- Airports never have buildings.
- Rent grows with the number of airports the owner holds.
- Table: airport rent for 1 to 10 airports, from the game data.

#### Companies

- Land on another player's company, roll two dice and pay the total times the company's multiplier.
- Table: each company's price and multiplier, from the game data.

#### Chance and Event cards

- Land on Chance or Event to draw a card, then do what it says.
- Chance mostly affects you: money, movement, Jail and bonus cards.
- Events are world news. They can affect everyone, and some change rents or building costs for one round. Active events show at the top of the screen.
- Free House: your next house is free, still only on a city you land on.
- Get Out of Jail: keep it until you need it. You can trade it.

#### Free Stay

- You start with 3 tokens. Use one to skip the rent on another player's city.
- It does not work on airports, companies, taxes or cards.
- You never hold more than 3.

#### Jail

- You go to Jail from the Go To Jail space, from a card, or by rolling three doubles in one turn.
- To leave: pay $300, use a Get Out of Jail card, or roll doubles.
- Rolling doubles moves you out by that roll, with no extra roll.
- After three failed rolls you must pay $300 and move.
- In Jail you still collect rent, trade and bid.
- Landing on the Jail space during a normal move is just visiting.

#### Vacation

- Land on Vacation and your next turn is skipped, once.
- You still own everything and still collect rent.

#### Taxes and Free Parking

- Income Tax: pay $300. Luxury Tax: pay $500.
- Free Parking: nothing happens.

#### Mortgages

- Short of cash? Mortgage a property to the bank for half its price. You keep it, but it earns no rent.
- For a city, sell all buildings in that country first.
- To unmortgage, pay the mortgage value plus 10%.
- You cannot build in a country while one of its cities is mortgaged.

#### Trading

- On your turn, offer a trade to one player: properties, Get Out of Jail cards and cash, in any mix.
- The other player accepts or rejects. Nobody can be forced.
- Cities in a country with buildings cannot be traded until the buildings are sold.
- A mortgaged property stays mortgaged after a trade.

#### Debt and bankruptcy

- If you cannot pay, raise money: sell buildings, mortgage properties or make a trade.
- If that is still not enough, you are bankrupt and out of the game.
- Owing a player: they receive everything you have left. Owing the bank: your properties become free to buy again.

#### Winning

- Quick game: it ends after the round limit, or when the first player goes bankrupt. The highest net worth wins.
- Normal game: the last player left wins.
- Net worth is cash, plus properties at their price (mortgaged ones at half), plus buildings at cost.

#### Controls

- Space or Enter presses the yellow button. B buys, P passes, T trades, R opens this guide.
- Hover over or tap a tile to see its details. Click a player to see what they own.
- Any click skips an animation. Animation speed is in Settings.

## 17. Online play

Added at the owner's request, after M5. Friends play one game together from different browsers, phones and computers. The one-device mode stays as sections 1 to 16 describe, fully offline, with one exception: the phone layout below applies to both modes and replaces the phone row of section 2 and the rotate hint of section 14 (D73). For online mode only, this section overrides "no backend, no networking" in sections 1 and 2. The decisions behind it are D55 to D79 in `DECISIONS.md`.

### What the player sees

- **Start screen.** Play on this device (New game, Continue) and Play online (Create room, Join room). Rejoin room ABCD appears when this browser holds a seat in a room that still exists.
- **Create.** You get a 4-letter room code and an invite link, `/?room=ABCD`. Share uses the phone's share sheet; elsewhere it copies the link.
- **Join.** Type the code and a name, or open the link.
  - Before the game starts, you take a new seat.
  - After it has started, the join screen lists disconnected seats you can take over.
- **Lobby.**
  - Seats are in joining order. Each player names their own seat and picks a colour nobody else has.
  - "Add a player on this device" gives one device a second seat.
  - Only the host changes the options: the section 8 options without the per-device ones. The host starts the game with 2 to 6 seats.
- **The game.**
  - Each device acts only on decisions that belong to its seats. Everyone else sees the same dice, moves, cards and money live, at their own animation speed, while the primary button says "Waiting for <name>".
  - Bids and trade answers happen on each player's own device.
  - There is no pass-device screen, except between two seats on the same device.
  - When a decision becomes this device's, a banner shows, the tab title changes and the phone vibrates once.
- **Connections.**
  - A seat with no heartbeat (sent every 20 s) for 45 s shows "Disconnected"; the game waits, with no timer.
  - "Reconnecting…" shows while offline and blocks actions.
  - An action not answered within 300 ms shows a spinner, and an action is never sent twice.
- **Host controls.**
  - Play for them: the host acts for a disconnected player until they return.
  - Remove player: bankrupt to the bank. In a Quick game this ends the game, as the first bankruptcy.
  - If the host disconnects, the next connected player becomes host.
- **Rule guide.** A new topic, "Playing online", explains all of this.

### Architecture

```text
browser (Vite app)                  Vercel Functions (Node 24, Fluid compute)       Upstash Redis
GameSession ─ LocalSession          api/room.ts   GET  /api/room?code=&since=        gm:{CODE}:room  JSON
            └ OnlineSession ──POST─▶              POST /api/room?op=...  ─────────▶ gm:{CODE}:v     version
               transport ◀── SSE ── api/stream.ts GET  /api/stream?code=&since=      gm:{CODE}:log   last 64 entries
                         ◀── poll   api/health.ts GET  /api/health                   gm:{CODE}:seen  heartbeats
```

- **GameSession.** The screens talk only to `GameSession`. `LocalSession` runs the engine in the tab and autosaves. `OnlineSession` sends actions to the server and plays the updates it receives, through the same animation path.
- **Handlers.** The API is web-standard `(Request) => Response` handlers (`server/api.ts`) over a `RoomStore` interface.
  - `UpstashStore` is used in production. Credentials come from `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`.
  - `MemoryStore` is used for local development and tests.
  - Function memory never holds room state.
- **The server is authoritative.** Every action is a POST with the version the device saw. The function then:
  1. loads the room;
  2. checks that the game is running and that the version is current (otherwise 409);
  3. checks that the sender's seat token controls the player who must act: the free actor for trading, mortgaging and selling, the decision maker otherwise, or a seat the host plays for;
  4. checks that the action's type is in `legalActions(state)` for that player and that `validateAction` accepts it;
  5. runs `reduce`, and saves with an atomic compare-and-set on the version, in a Lua script.

  When two actions race, one wins and the other changes nothing (409). Debug actions, settings actions and `?seed` do not exist online.
- **Secrets stay on the server.** The seed, the generator state and the order of the face-down decks never leave it. Seat tokens are 32 random bytes kept in the browser's localStorage; the server stores only their SHA-256.
- **Live updates.** Server-Sent Events carry every version after the one the device has: its events, and the view after it.
  - A response ends before the platform's time limit, and the browser reconnects from its last version (`Last-Event-ID` or `?since=`). Missed versions arrive exactly once; a device too far behind gets one snapshot.
  - Streams wait on Redis pub/sub: each commit publishes the new version. Nothing on the server polls.
  - If the stream fails, or ends within 5 s of opening, the browser polls `GET /api/room?since=` every 2 s and retries the stream every 30 s.
  - A device resyncs at once when its tab becomes visible or a heartbeat shows a newer version.
- **Expiry.** Rooms expire 48 hours after their last write (Redis TTL).
- **Local server.** `server/local.ts` mounts the same handlers on `MemoryStore` and can serve the built game: `npm run dev:online`, `npm run serve:online`.

### Phones (both modes)

- **Status bar.** Round, whose turn, my cash, Rules and Menu.
- **The board.** It keeps its 1280 × 720 layout and is scaled as a whole.
  - Pinch to zoom, drag to pan, double-tap for the whole board and back.
  - It centres on the moving token and follows it.
  - Tapping a tile shows its Focus Card.
- **The control sheet.** It sits at the bottom in portrait and on the side in landscape. It holds the primary button (always visible), the dice, and tabs for Card, Players, Log and Mine. Decision panels open in it; a panel's own buttons stay pinned at its bottom while the details scroll.
- **Comfort.** Touch targets are at least 44 px, safe-area insets are respected, and nothing scrolls sideways. The screen stays awake during a game where the Wake Lock API allows it.

### Verification

- **Engine.** A fuzz test removes players from every phase in seeded bot games, with invariants checked after every action.
- **API tests** (Vitest). They run on `MemoryStore`, and on `UpstashStore` against a real Redis through Upstash's REST emulator. They cover:
  - the room lifecycle;
  - wrong-seat, illegal and stale actions;
  - concurrent actions;
  - reconnecting;
  - host handover and host controls;
  - one device with two seats;
  - stream resume that delivers missed events exactly once;
  - polling.
- **Transport tests.** The browser's connection code runs over HTTP and is tested for live delivery, resume, a blocked stream and a stream that ends at once (both fall back to polling), the silence watchdog and resync.
- **Playwright against the local server.**
  - A full Quick game on three devices, one of them a phone, with one device closed and reopened in its seat.
  - The same game with the stream blocked.
  - Live animation and the turn banner, lobby rules, host controls and taking a seat back.
  - Every phone screen in portrait and landscape, audited and reviewed.
- **Deployment.** See `DEPLOY.md`. `npm run smoke -- <url>` checks a deployment end to end.

## 18. Sound, chat and voice

Added at the owner's request, after section 17, to make playing with friends livelier. Section 13 left sound for later, synthesised with WebAudio, with an on/off switch and no audio files or music; this section is that. The decisions behind it start at D80 in `DECISIONS.md`.

### Sound (both modes)

- **Synthesised.** Every sound is made with the Web Audio API as it plays: no audio files, nothing to download, and it works offline. Sounds start after the first tap, click or key press, as browsers require.
- **A travel theme.** The token takes wooden steps; dice clatter and settle; World Start rings a register; buying stamps the passport; rent sends a coin across; Chance plays the two-tone boarding call and Events a teleprinter; Jail slams a cell door; Vacation is a warm chord on a wave; auctions use a gavel; building is hammer taps; trades, debts, bankruptcy and the winner's fanfare each have their own. Online, the player whose decision it is hears a rising airport chime.
- **In time with the board.** Sounds play on the animation timeline, one step sound per space, so they match what is shown. Skipping an animation stops its sounds. With animation Off, reduced motion or nothing to animate, an action plays its key sounds at once (four at most). Reduced motion does not turn sound off.
- **Settings (this device).** Sound effects on or off, and the volume (70% at first), in the menu; a speaker switch in the top bar on larger screens. They are remembered on the device, like the online animation speed.
- **Levels.** Each sound is trimmed so big moments, actions and small feedback sit in three steps; none clips. A background tab plays only the chime, chat and voice sounds.

### Chat and stamps (online)

- **Where.** On large screens a Chat tab sits beside the log; on phones a Chat tab is in the sheet; in the lobby a Chat button opens it. With the chat open on a large screen, a decision panel takes the play area and the chat stays beside it.
- **Messages.** One line of plain text, 200 characters at most, with the sender's token, name and time. Messages from one seat in a row share a heading. One device with several seats chooses which of them writes.
- **Stamps.** Quick reactions, words not emoji: Nice, Ouch, Ha ha, Wow, Hurry up, Good game. A stamp thuds onto the sender's card like a passport stamp, in their colour, with its own sound, and appears in the chat.
- **Noticing.** While the chat is closed, new messages from others count on the Chat tab or button and show briefly as a preview that opens the chat; they make a soft pop. Writing never skips the animation that is playing, and no key is lost.
- **Delivery.** Chat travels with the game updates (stream, or polling) but never changes the game's version. A room keeps its newest 100 messages; they go when the room expires. A seat may send a message every 0.6 s and a stamp every 1.5 s.

### Voice chat (online)

- **Join voice.** On large screens in the top bar, on phones in the status bar (in place of Rules, which moves into the menu), and in the lobby. The button shows how many are already in voice. The browser asks for the microphone; a hint suggests headphones.
- **Talking.** The microphone switch reads Mic on or Muted and glows while you talk. Each player's token carries a badge: listening, talking (green) or muted (red). Leave voice is beside the switch (phones: in the menu). Voice volume is set per device in the menu.
- **How it works.** The devices in voice connect to each other directly, audio only; the game's server only lists who is in voice and passes each connection's set-up to its receiver. Voice carries on from the lobby into the game and stops when the device leaves the room.
- **Networks.** Devices find each other with a public STUN server (Cloudflare's). Some networks also need a relay (TURN), which the deployment can add (DEPLOY.md). Devices in a voice chat learn each other's network addresses.

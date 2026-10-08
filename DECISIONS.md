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

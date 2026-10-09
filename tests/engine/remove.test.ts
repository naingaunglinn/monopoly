// Removing a player (online host control, DECISIONS D60): bankrupt to the bank, from any phase,
// and the game always continues from a valid state. Targeted cases, then a seeded fuzz run that
// removes a random player at a random moment and plays on to the end with invariants checked.
import { describe, expect, test } from 'vitest';
import {
  actorFor,
  checkInvariants,
  decisionMaker,
  freeActor,
  legalActions,
  publicView,
  reduce,
  type Action,
  type GameState,
} from '../../src/engine';
import { mulberry32 } from '../../src/engine/rng';
import { act, dbg, edit, fail, forceCard, game, own, rollTo, run, spaceOf, spacesOf } from './helpers';

const remove = (s: GameState, player: number) => run(s, { type: 'removePlayer', player });
const CAIRO = spaceOf('Cairo');
const ALEXANDRIA = spaceOf('Alexandria');
const BRAZIL_AIRPORT = spaceOf('Brazil Airport');
const GUADALAJARA = spaceOf('Guadalajara');
/** A Chance space reached without passing World Start. */
const CHANCE = spacesOf('chance').find((c) => c >= 7) as number;

describe('removing a player', () => {
  test('they go bankrupt to the bank: properties unowned and unmortgaged, buildings sold', () => {
    let s = own(game({ playerCount: 3, mode: 'normal' }), [CAIRO, ALEXANDRIA, BRAZIL_AIRPORT], 1);
    s = dbg(s, { op: 'setLevel', space: CAIRO, level: 1 });
    s = dbg(s, { op: 'setLevel', space: ALEXANDRIA, level: 1 });
    s = dbg(s, { op: 'setMortgaged', space: BRAZIL_AIRPORT, mortgaged: true });
    const { state, events } = remove(s, 1);
    expect(events.map((e) => e.type)).toContain('playerRemoved');
    expect(events.find((e) => e.type === 'bankrupt')).toMatchObject({ player: 1, creditor: null });
    expect(state.players[1]).toMatchObject({ bankrupt: true, cash: 0 });
    for (const space of [CAIRO, ALEXANDRIA, BRAZIL_AIRPORT]) expect(state.properties[space]).toEqual({ owner: null, level: 0, mortgaged: false });
    // Not their turn: the current player carries on after acknowledging the notice.
    expect(state.turn.currentPlayerIndex).toBe(0);
    expect(state.flow.notices).toEqual([{ kind: 'bankruptcy', player: 1, creditor: null }]);
    expect(state.flow.phase).toBe('AwaitRoll');
  });

  test('in a Quick game it is the first bankruptcy, so the game ends and they rank last', () => {
    const { state } = remove(game({ playerCount: 3 }), 2);
    expect(state.flow.phase).toBe('GameOver');
    expect(state.meta.endReason).toBe('bankruptcy');
    expect(state.meta.winner).not.toContain(2);
  });

  test('on their own turn the turn passes to the next player', () => {
    const { state } = remove(game({ playerCount: 3, mode: 'normal' }), 0);
    expect(state.turn.currentPlayerIndex).toBe(1);
    expect(state.flow.notices[0]).toMatchObject({ kind: 'bankruptcy', player: 0 });
    expect(decisionMaker(state)).toBe(1);
  });

  test('a card they drew is discarded, so every card is still somewhere', () => {
    const s = rollTo(forceCard(game({ playerCount: 3, mode: 'normal' }), 'chance-tour-guide'), CHANCE).state;
    expect(s.flow.phase).toBe('CardReveal');
    const { state } = remove(s, 0);
    expect(state.decks.chanceDiscard).toContain('chance-tour-guide');
    expect(state.turn.currentPlayerIndex).toBe(1);
  });

  test('an auction they started ends unsold; a bidder who leaves folds and their high bid is withdrawn', () => {
    // Player 0 lands on Guadalajara and passes: the auction starts with player 1.
    const start = act(rollTo(game({ playerCount: 4, mode: 'normal' }), GUADALAJARA).state, { type: 'decline' });
    expect(start.flow.pending).toMatchObject({ kind: 'auction' });

    const lander = remove(start, 0);
    expect(lander.events.map((e) => e.type)).toContain('auctionUnsold');
    expect(lander.state.properties[GUADALAJARA]?.owner).toBeNull();
    expect(lander.state.turn.currentPlayerIndex).toBe(1);

    // Player 1 bids $60; player 2 is next. Removing player 1 withdraws the bid.
    const bid = act(start, { type: 'bid', amount: 60 });
    const highBidderGone = remove(bid, 1).state;
    expect(highBidderGone.flow.pending).toMatchObject({ kind: 'auction', auction: { highBid: 0, highBidder: null, current: 2 } });
    // Removing the bidder whose turn it is moves the turn on.
    const currentGone = remove(bid, 2).state;
    expect(currentGone.flow.pending).toMatchObject({ kind: 'auction', auction: { highBid: 60, highBidder: 1, current: 3 } });
  });

  test('rent owed to them is cancelled and the player who landed carries on', () => {
    const s = rollTo(own(game({ playerCount: 3, mode: 'normal' }), [CAIRO], 2), CAIRO).state;
    expect(s.flow.phase).toBe('RentDue');
    const { state } = remove(s, 2);
    expect(state.flow.pending?.kind ?? null).not.toBe('rent');
    expect(state.players[0]?.cash).toBe(s.players[0]?.cash);
    expect(['AwaitEndTurn', 'AwaitRoll', 'BuildOffer']).toContain(state.flow.phase);
  });

  test('a trade offered to them is cancelled', () => {
    const s = act(own(own(game({ playerCount: 3, mode: 'normal' }), [CAIRO], 0), [ALEXANDRIA], 2), {
      type: 'proposeTrade',
      offer: { from: 0, to: 2, give: { properties: [CAIRO], cash: 0, jailCards: 0 }, get: { properties: [ALEXANDRIA], cash: 0, jailCards: 0 } },
    });
    const { state, events } = remove(s, 2);
    expect(state.flow.trade).toBeNull();
    expect(events.map((e) => e.type)).toContain('tradeCancelled');
    expect(state.properties[CAIRO]?.owner).toBe(0);
  });

  test('a debtor who is not the current player leaves; the remaining payments continue', () => {
    // A card makes everyone pay player 0; player 1 cannot pay and must raise money.
    let s = game({ playerCount: 3, mode: 'normal' });
    s = own(s, [CAIRO], 1);
    s = edit(s, (d) => {
      (d.players[1] as { cash: number }).cash = 0;
    });
    s = rollTo(forceCard(s, 'chance-tour-guide'), CHANCE).state; // Tour guide: collect $100 from each player
    s = act(s, { type: 'confirmCard' });
    expect(s.flow.phase).toBe('Debt');
    expect(s.flow.debts[0]?.debtor).toBe(1);
    const { state } = remove(s, 1);
    expect(state.players[1]?.bankrupt).toBe(true);
    expect(state.flow.debts.every((d) => d.debtor !== 1 && d.creditor !== 1)).toBe(true);
    expect(checkInvariants(state)).toEqual([]);
  });

  test('refused for a bankrupt or unknown player and after the game', () => {
    const s = remove(game({ playerCount: 3, mode: 'normal' }), 2).state;
    fail(s, { type: 'removePlayer', player: 2 });
    fail(s, { type: 'removePlayer', player: 7 });
    const over = remove(game({ playerCount: 3 }), 1).state;
    fail(over, { type: 'removePlayer', player: 0 });
  });
});

describe('who sends an action', () => {
  test('free actions belong to the free actor, decisions to the decision maker, admin to nobody', () => {
    const s = act(rollTo(game({ playerCount: 3 }), GUADALAJARA).state, { type: 'decline' });
    expect(actorFor(s, { type: 'bid', amount: 10 })).toBe(1);
    expect(actorFor(s, { type: 'mortgage', space: CAIRO })).toBe(freeActor(s));
    expect(actorFor(s, { type: 'removePlayer', player: 1 })).toBeNull();
    expect(actorFor(s, { type: 'debug', op: 'setNextDice', dice: [1, 1] })).toBeNull();
    expect(actorFor(game(), { type: 'roll' })).toBe(0);
  });

  test('the public view hides the seed, the generator and the deck order, nothing else', () => {
    const s = rollTo(game({ playerCount: 3 }), CHANCE).state;
    const v = publicView(s);
    expect(v.meta.seed).toBe(0);
    expect(v.meta.rngState).toBe(0);
    expect(v.decks.chanceDeck).toEqual([]);
    expect(v.decks.eventDeck).toEqual([]);
    expect(v.decks.chanceDiscard).toEqual(s.decks.chanceDiscard);
    expect(v.players).toEqual(s.players);
    expect(v.flow).toEqual(s.flow);
    expect(JSON.stringify(v)).not.toContain(String(s.meta.rngState));
  });
});

describe('fuzz: remove a random player at a random moment, then play on', () => {
  function choose(s: GameState, r: number): { action: Action; next: number } {
    const legal = legalActions(s).filter((a) => a.type !== 'proposeTrade') as Action[];
    const pick = mulberry32(r);
    return { action: legal[Math.floor(pick.value * legal.length)] as Action, next: pick.next };
  }

  for (const mode of ['normal', 'quick'] as const) {
    test(`${mode} mode, 60 seeded games`, () => {
      let removedFromPhases = new Set<string>();
      for (let seed = 1; seed <= 60; seed++) {
        let s = game({ playerCount: 2 + (seed % 5), mode, passDevice: seed % 2 === 0 }, seed);
        let r = seed * 7919;
        const before = Math.floor(mulberry32(seed).value * 500);
        for (let i = 0; i < before && s.flow.phase !== 'GameOver'; i++) {
          const c = choose(s, r);
          r = c.next;
          s = run(s, c.action).state;
        }
        if (s.flow.phase === 'GameOver') continue;
        const living = s.players.filter((p) => !p.bankrupt);
        const victim = living[seed % living.length]?.id as number;
        removedFromPhases.add(`${s.flow.phase}${victim === s.turn.currentPlayerIndex ? '*' : ''}`);
        const removed = reduce(s, { type: 'removePlayer', player: victim });
        expect(removed.error, `seed ${seed}`).toBeNull();
        s = removed.state;
        expect(checkInvariants(s), `seed ${seed} after removal`).toEqual([]);
        expect(s.players[victim]?.bankrupt).toBe(true);
        for (let i = 0; i < 4000 && s.flow.phase !== 'GameOver'; i++) {
          const legal = legalActions(s).filter((a) => a.type !== 'proposeTrade');
          expect(legal.length, `seed ${seed}: stuck in ${s.flow.phase}`).toBeGreaterThan(0);
          const c = choose(s, r);
          r = c.next;
          s = run(s, c.action).state;
        }
        // Nothing ever points at the removed player again.
        expect(s.properties.every((ps) => ps === null || ps.owner !== victim)).toBe(true);
        if (s.flow.phase !== 'GameOver') expect(s.turn.currentPlayerIndex).not.toBe(victim);
      }
      removedFromPhases = new Set([...removedFromPhases].sort());
      // The fuzz reaches several different phases (the * marks the removed player's own turn).
      expect(removedFromPhases.size).toBeGreaterThanOrEqual(5);
    });
  }
});

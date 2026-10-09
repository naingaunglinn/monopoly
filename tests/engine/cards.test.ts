import { describe, expect, test } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import type { CardData, CardEffect } from '../../src/data/cardTypes';
import { CHANCE_CARDS } from '../../src/data/chance';
import { EVENT_CARDS } from '../../src/data/events';
import { AIRPORT_SPACES, CITIES, COMPANY_SPACES, COUNTRY_CITIES, isProperty, SPACES } from '../../src/data/board';
import { cardsForSettings, cityRent, type GameState } from '../../src/engine';
import {
  cashOf,
  edit,
  eventsOf,
  firstOf,
  forceCard,
  game,
  levels,
  own,
  rollTo,
  run,
  endTurn,
  spaceOf,
  spacesOf,
} from './helpers';

/** A Chance space with properties 3 ahead and 2 behind (for the move cards). */
const CHANCE_SPACE = spacesOf('chance').find((c) => isProperty(c + 3) && isProperty(c - 2)) as number;
/** The last Chance space, near the end of the board. */
const LAST_CHANCE = spacesOf('chance').at(-1) as number;
const EVENT_SPACE = firstOf('event');
const CAIRO = spaceOf('Cairo');
const ALEXANDRIA = spaceOf('Alexandria');
/** Visiting the Jail: a landing where nothing happens. */
const REST = SPACES.jail;
const CITY_SPACES = CITIES.map((c) => c.space);
/** The first of these spaces after `from`, going round the board. */
const nextOf = (spaces: readonly number[], from: number) => spaces.find((sp) => sp > from) ?? (spaces[0] as number);

/** Lands the current player on a Chance or Event space with the given card on top, then OK. */
function draw(s: GameState, cardId: string, space = cardId.startsWith('chance-') ? CHANCE_SPACE : EVENT_SPACE) {
  const landed = rollTo(forceCard(s, cardId), space).state;
  expect(landed.flow.phase).toBe('CardReveal');
  expect(landed.flow.pending).toMatchObject({ kind: 'card', cardId });
  return run(landed, { type: 'confirmCard' });
}

const effects = (cards: readonly CardData[]) => cards.map((c) => c.effect);
const hasEffect = (cards: readonly CardData[], match: Partial<CardEffect> & { type: CardEffect['type'] }) =>
  cards.some((c) => Object.entries(match).every(([k, v]) => JSON.stringify((c.effect as Record<string, unknown>)[k]) === JSON.stringify(v)));

describe('deck content', () => {
  test('each deck has at least 30 well-formed cards', () => {
    for (const [deck, cards] of [
      ['chance', CHANCE_CARDS],
      ['event', EVENT_CARDS],
    ] as const) {
      expect(cards.length).toBeGreaterThanOrEqual(BALANCE.minDeckSize);
      for (const card of cards) {
        expect(card.deck).toBe(deck);
        expect(card.id.startsWith(`${deck}-`)).toBe(true);
        expect(card.title.length).toBeGreaterThan(0);
        expect(card.text.length).toBeGreaterThan(0);
        expect(['good', 'bad', 'neutral']).toContain(card.tone);
        expect(card.icon.length).toBeGreaterThan(0);
      }
    }
    const ids = [...CHANCE_CARDS, ...EVENT_CARDS].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('Chance holds the required cards', () => {
    const required: Array<Partial<CardEffect> & { type: CardEffect['type'] }> = [
      { type: 'cash', amount: 200 },
      { type: 'cash', amount: 300 },
      { type: 'cash', amount: -150 },
      { type: 'cash', amount: -250 },
      { type: 'move', steps: 3 },
      { type: 'move', steps: -2 },
      { type: 'moveTo', target: { kind: 'nearestAirport' } },
      { type: 'moveTo', target: { kind: 'nearestCompany' } },
      { type: 'moveTo', target: { kind: 'country', country: 'brazil' } },
      { type: 'moveTo', target: { kind: 'country', country: 'unitedStates' } },
      { type: 'rollAgain' },
      { type: 'freeStay' },
      { type: 'freeHouseVoucher' },
      { type: 'goToVacation' },
      { type: 'goToJail' },
      { type: 'cashPerPlayer', amount: 100 },
      { type: 'cashPerPlayer', amount: -100 },
      { type: 'getOutOfJail' },
    ];
    for (const match of required) expect(hasEffect(CHANCE_CARDS, match), JSON.stringify(match)).toBe(true);
  });

  test('Event covers every required theme', () => {
    const themes: Record<string, string> = {
      'Tourism Boom': 'event-tourism-boom',
      'Global Recession': 'event-global-recession',
      'Oil Price Boom': 'event-oil-boom',
      'Oil Price Crash': 'event-oil-crash',
      'Electricity Crisis': 'event-electricity-crisis',
      'Rice Export Boom': 'event-rice-export-boom',
      'Transportation Strike': 'event-transport-strike',
      'Shipping Boom': 'event-shipping-boom',
      'Trade Agreement': 'event-trade-agreement',
      'Currency Crisis': 'event-currency-crisis',
      'Tax Refund': 'event-tax-refund',
      'Salary Bonus': 'event-salary-bonus',
      'Medical Expense': 'event-medical-expense',
      'Natural Disaster': 'event-natural-disaster',
      'Construction Discount': 'event-construction-discount',
      'Construction Cost Increase': 'event-construction-costs-rise',
      'Airport Promotion': 'event-airport-promotion',
      'Business Expansion': 'event-business-expansion',
      'Global Market Boom': 'event-global-market-boom',
      'Economic Slowdown': 'event-economic-slowdown',
    };
    for (const id of Object.values(themes)) expect(EVENT_CARDS.some((c) => c.id === id), id).toBe(true);
  });

  test('balance limits', () => {
    for (const card of [...CHANCE_CARDS, ...EVENT_CARDS]) {
      const e = card.effect;
      if (e.type === 'cash' || e.type === 'allPlayersCash' || e.type === 'companyOwnerCash') {
        expect(Math.abs(e.amount)).toBeLessThanOrEqual(BALANCE.cardCashLimit);
      }
      if (e.type === 'cashPerPlayer') expect(Math.abs(e.amount)).toBeLessThanOrEqual(BALANCE.cardPerPlayerLimit);
      if (e.type === 'modifier') {
        expect(e.factor).toBeGreaterThanOrEqual(BALANCE.modifierFactorMin);
        expect(e.factor).toBeLessThanOrEqual(BALANCE.modifierFactorMax);
      }
    }
    // Fixed cash effects in each deck sum to roughly zero.
    for (const cards of [CHANCE_CARDS, EVENT_CARDS]) {
      const sum = effects(cards).reduce((total, e) => {
        if (e.type === 'cash' || e.type === 'allPlayersCash' || e.type === 'cashPerPlayer' || e.type === 'companyOwnerCash') {
          return total + e.amount;
        }
        return total;
      }, 0);
      expect(Math.abs(sum)).toBeLessThanOrEqual(50);
    }
    for (const type of ['goToJail', 'goToVacation', 'getOutOfJail', 'freeHouseVoucher', 'rollAgain'] as const) {
      expect(CHANCE_CARDS.filter((c) => c.effect.type === type).length).toBeLessThanOrEqual(2);
    }
    expect(EVENT_CARDS.some((c) => c.effect.type === 'goToJail')).toBe(false);
  });

  test('every card states its exact amounts in its text', () => {
    for (const card of [...CHANCE_CARDS, ...EVENT_CARDS]) {
      const e = card.effect;
      if ('amount' in e) expect(card.text, card.id).toContain(`$${Math.abs(e.amount)}`);
      if (e.type === 'move') expect(card.text, card.id).toContain(`${Math.abs(e.steps)} spaces`);
      if (e.type === 'perBuildingFee') {
        expect(card.text).toContain(`$${e.house}`);
        expect(card.text).toContain(`$${e.hotel}`);
      }
      if (e.type === 'perAssetCash') expect(card.text).toContain('$300');
      if (e.type === 'modifier') {
        const pct = Math.round(Math.abs(e.factor - 1) * 100);
        expect(card.text.includes(`${pct}%`) || card.text.includes('halved') || card.text.includes('half'), card.id).toBe(true);
      }
    }
  });
});

describe('card effects', () => {
  test('cash: gain and pay', () => {
    const gain = draw(game(), 'chance-hotel-safe').state;
    expect(cashOf(gain, 0)).toBe(4200);
    expect(gain.decks.chanceDiscard).toContain('chance-hotel-safe');
    const pay = draw(game(), 'chance-lost-luggage').state;
    expect(cashOf(pay, 0)).toBe(3750);
    expect(pay.flow.phase).toBe('AwaitEndTurn');
  });

  test('allPlayersCash: every player gains or loses', () => {
    const lose = draw(game({ playerCount: 3 }), 'event-global-recession').state;
    expect(lose.players.map((p) => p.cash)).toEqual([3900, 3900, 3900]);
    const gain = draw(game({ playerCount: 3 }), 'event-global-market-boom').state;
    expect(gain.players.map((p) => p.cash)).toEqual([4100, 4100, 4100]);
  });

  test('cashPerPlayer: collect from or pay each other player', () => {
    const collect = draw(game({ playerCount: 3 }), 'chance-tour-guide').state;
    expect(collect.players.map((p) => p.cash)).toEqual([4200, 3900, 3900]);
    const pay = draw(game({ playerCount: 3 }), 'chance-group-dinner').state;
    expect(pay.players.map((p) => p.cash)).toEqual([3800, 4100, 4100]);
  });

  test('move: forward and backward, then the new space resolves', () => {
    const forward = draw(game(), 'chance-shortcut').state;
    expect(forward.players[0]?.position).toBe(CHANCE_SPACE + 3);
    expect(forward.flow.phase).toBe('BuyDecision');
    const back = draw(game(), 'chance-wrong-exit').state;
    expect(back.players[0]?.position).toBe(CHANCE_SPACE - 2);
    expect(back.flow.phase).toBe('BuyDecision');
  });

  test('moveTo: nearest airport, nearest company, a country and a space', () => {
    expect(draw(game(), 'chance-gate-change').state.players[0]?.position).toBe(nextOf(AIRPORT_SPACES, CHANCE_SPACE));
    expect(draw(game(), 'chance-gate-change', LAST_CHANCE).state.players[0]?.position).toBe(nextOf(AIRPORT_SPACES, LAST_CHANCE));
    expect(draw(game(), 'chance-business-meeting').state.players[0]?.position).toBe(nextOf(COMPANY_SPACES, CHANCE_SPACE));
    expect(draw(game(), 'chance-business-meeting', LAST_CHANCE).state.players[0]?.position).toBe(nextOf(COMPANY_SPACES, LAST_CHANCE));
    const brazil = draw(game(), 'chance-carnival').state;
    expect(brazil.players[0]?.position).toBe(spaceOf('Brasília'));
    expect(cashOf(brazil, 0)).toBe(4500);
    const usa = draw(game(), 'chance-coast-to-coast').state;
    expect(usa.players[0]?.position).toBe(spaceOf('New York'));
    expect(cashOf(usa, 0)).toBe(4000);
    const start = draw(game(), 'chance-round-the-world').state;
    expect(start.players[0]?.position).toBe(0);
    expect(cashOf(start, 0)).toBe(4500);
  });

  test('a card that moves the player onto rent resolves the rent', () => {
    const s = draw(own(game(), nextOf(AIRPORT_SPACES, CHANCE_SPACE), 1), 'chance-gate-change').state;
    expect(s.flow.phase).toBe('RentDue');
    expect(s.flow.pending?.kind === 'rent' && s.flow.pending.rent.amount).toBe(40);
  });

  test('goToJail', () => {
    const s = draw(game(), 'chance-customs-trouble').state;
    expect(s.players[0]).toMatchObject({ position: SPACES.jail, inJail: true });
    expect(s.flow.phase).toBe('AwaitEndTurn');
    expect(cashOf(s, 0)).toBe(4000);
  });

  test('goToVacation: straight to Vacation, no World Start money, next turn skipped', () => {
    const { state } = draw(game(), 'chance-beach-calling', LAST_CHANCE);
    expect(state.players[0]).toMatchObject({ position: SPACES.vacation, skipNextTurn: true });
    expect(cashOf(state, 0)).toBe(4000);
    expect(state.flow.notices).toEqual([{ kind: 'vacation', player: 0 }]);
  });

  test('rollAgain grants one extra roll that is not a double', () => {
    const { state, events } = draw(game(), 'chance-tailwind');
    expect(eventsOf(events, 'rollAgainGranted')).toHaveLength(1);
    expect(state.flow.phase).toBe('AwaitRoll');
    expect(state.turn.doublesCount).toBe(0);
  });

  test('freeStay: +1 token, or $100 when already holding 3', () => {
    const full = draw(game(), 'chance-friendly-host').state;
    expect(full.players[0]?.freeStay).toBe(3);
    expect(cashOf(full, 0)).toBe(4100);
    const two = edit(game(), (d) => {
      (d.players[0] as { freeStay: number }).freeStay = 2;
    });
    const after = draw(two, 'chance-friendly-host').state;
    expect(after.players[0]?.freeStay).toBe(3);
    expect(cashOf(after, 0)).toBe(4000);
  });

  test('held cards leave the deck until used: Free House and Get Out of Jail', () => {
    const voucher = draw(game(), 'chance-building-permit').state;
    expect(voucher.players[0]?.houseVouchers).toEqual(['chance-building-permit']);
    expect(voucher.decks.chanceDeck).not.toContain('chance-building-permit');
    expect(voucher.decks.chanceDiscard).not.toContain('chance-building-permit');
    const jail = draw(game(), 'chance-diplomatic-pass').state;
    expect(jail.players[0]?.jailCards).toEqual(['chance-diplomatic-pass']);
    expect(jail.decks.chanceDiscard).not.toContain('chance-diplomatic-pass');
  });

  test('perBuildingFee: per house and hotel, at most $300', () => {
    const egypt = (lv: number) =>
      levels(own(game(), [CAIRO, ALEXANDRIA], 0), [
        [CAIRO, lv],
        [ALEXANDRIA, lv],
      ]);
    expect(cashOf(draw(egypt(2), 'event-natural-disaster').state, 0)).toBe(4000 - 4 * 40);
    expect(cashOf(draw(egypt(5), 'event-natural-disaster').state, 0)).toBe(4000 - 2 * 100);
    const mexicoCities = COUNTRY_CITIES.mexico;
    const mexico = levels(
      own(game(), [...mexicoCities], 0),
      mexicoCities.map((sp): [number, number] => [sp, 4]),
    );
    expect(cashOf(draw(mexico, 'event-natural-disaster').state, 0)).toBe(4000 - 300);
    expect(cashOf(draw(game(), 'event-natural-disaster').state, 0)).toBe(4000);
  });

  test('companyOwnerCash: the owner gains or pays; nothing if unowned', () => {
    const oil = spaceOf('Oil Company');
    const boom = draw(own(game(), oil, 1), 'event-oil-boom').state;
    expect(cashOf(boom, 1)).toBe(4200);
    const crash = draw(own(game(), oil, 1), 'event-oil-crash').state;
    expect(cashOf(crash, 1)).toBe(3800);
    const { state, events } = draw(game(), 'event-oil-boom');
    expect(eventsOf(events, 'cardNoEffect')).toHaveLength(1);
    expect(state.players.map((p) => p.cash)).toEqual([4000, 4000]);
  });

  test('perAssetCash: per asset owned, capped at $300 per player', () => {
    let s = own(game(), AIRPORT_SPACES.slice(0, 2), 0);
    s = own(s, AIRPORT_SPACES.slice(2, 3), 1);
    const airports = draw(s, 'event-airport-promotion').state;
    expect(cashOf(airports, 0)).toBe(4100);
    expect(cashOf(airports, 1)).toBe(4050);
    s = own(game(), COMPANY_SPACES.slice(0, 2), 0);
    const companies = draw(s, 'event-business-expansion').state;
    expect(cashOf(companies, 0)).toBe(4100);
    const tax = draw(own(game(), [CAIRO, ALEXANDRIA, spaceOf('Brasília'), spaceOf('Rio de Janeiro')], 1), 'event-property-tax-reform').state;
    expect(cashOf(tax, 1)).toBe(4000 - 100);
    // Thirteen cities would cost $325: capped at $300.
    const many = draw(own(game(), CITY_SPACES.slice(0, 13), 1), 'event-property-tax-reform').state;
    expect(cashOf(many, 1)).toBe(4000 - 300);
  });

  test('modifier: applies to rent, one per type, and expires when the drawer’s next turn begins', () => {
    let s = draw(own(game(), CAIRO, 1), 'event-tourism-boom').state;
    expect(s.flow.modifiers).toEqual([{ type: 'cityRent', factor: 1.25, cardId: 'event-tourism-boom', drawnBy: 0 }]);
    // $17 × 1.25 = $21.25, rounded to $21.
    expect(cityRent(s, CAIRO).amount).toBe(21);
    s = endTurn(s);
    expect(s.turn.currentPlayerIndex).toBe(1);
    expect(s.flow.modifiers).toHaveLength(1);
    // Player 1 draws a new city rent modifier: it replaces the old one.
    s = draw(s, 'event-economic-slowdown').state;
    expect(s.flow.modifiers).toEqual([{ type: 'cityRent', factor: 0.75, cardId: 'event-economic-slowdown', drawnBy: 1 }]);
    s = endTurn(s);
    // Player 0's turn: player 1's modifier is still active until player 1's next turn.
    expect(s.flow.modifiers).toHaveLength(1);
    s = endTurn(rollTo(s, REST).state);
    expect(s.turn.currentPlayerIndex).toBe(1);
    expect(s.flow.modifiers).toHaveLength(0);
  });

  test('buildCost modifier changes the house price for everyone until it expires', () => {
    let s = own(game(), [CAIRO, ALEXANDRIA], 0);
    s = endTurn(rollTo(s, REST).state); // player 0 visits the Jail
    s = draw(s, 'event-construction-discount').state; // player 1 draws it
    s = endTurn(s);
    s = rollTo(s, CAIRO).state; // player 0 lands on Cairo with Egypt complete
    expect(s.flow.phase).toBe('BuildOffer');
    const { events } = run(s, { type: 'build', space: CAIRO });
    expect(eventsOf(events, 'built')[0]?.cost).toBe(25);
  });
});

describe('deck handling', () => {
  test('a used card is discarded and an empty deck reshuffles its discard pile', () => {
    const all = cardsForSettings('chance', game().meta.settings).map((c) => c.id);
    const s = edit(game(), (d) => {
      d.decks.chanceDeck = [];
      d.decks.chanceDiscard = all.slice();
    });
    const landed = rollTo(s, CHANCE_SPACE);
    expect(eventsOf(landed.events, 'deckShuffled')).toEqual([{ type: 'deckShuffled', deck: 'chance' }]);
    expect(landed.state.decks.chanceDiscard).toEqual([]);
    expect(landed.state.decks.chanceDeck).toHaveLength(all.length - 1);
  });

  test('draws come from the top of the deck', () => {
    const s = game();
    const top = s.decks.chanceDeck[0];
    const landed = rollTo(s, CHANCE_SPACE).state;
    expect(landed.flow.pending).toMatchObject({ kind: 'card', cardId: top });
  });
});

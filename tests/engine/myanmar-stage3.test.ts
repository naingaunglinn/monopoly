// The Myanmar map, stage 3 (owner's spec 7.5 and 7.7 to 7.10, D103): the earthquake, tolls, the
// lottery, the community pot and remittance. Spaces are found by name; corners come from SPACES.
import { describe, expect, test } from 'vitest';
import { MYANMAR } from '../../src/data/balance';
import { SPACES } from '../../src/data/board';
import { borderSpace, legalActions, parseSave, serializeGame, type GameState } from '../../src/engine';
import { act, at, cashOf, edit, endTurn, eventsOf, forceCard, game, levels, nextDice, own, rollTo, rollWith, run, setCash, spaceOf, spacesOf } from './helpers';

const mm = (settings: Parameters<typeof game>[0] = {}, seed = 7) => game({ map: 'myanmar', playerCount: 3, ...settings }, seed);
type P = GameState['players'][number];

describe('the community pot (spec 7.9)', () => {
  test('taxes and service payments go into the pot; the Refuge takes it all', () => {
    const tax = (mm(), spacesOf('tax')[0] as number);
    let s = act(rollTo(mm(), tax).state, { type: 'payRent' });
    expect(s.economy.pot).toBe(MYANMAR.incomeTax);
    s = endTurn(s);
    const called = rollTo(setCash(s, 1, 8000), SPACES.goToJail).state;
    s = act(called, { type: 'draftChoose', how: 'pay' });
    expect(s.economy.pot).toBe(300 + 800);
    s = endTurn(s);
    const before = cashOf(s, 2);
    const landed = rollTo(s, SPACES.vacation);
    expect(eventsOf(landed.events, 'potTaken')).toEqual([{ type: 'potTaken', player: 2, amount: 1100 }]);
    expect(cashOf(landed.state, 2)).toBe(before + 1100);
    expect(landed.state.economy.pot).toBe(0);
  });

  test('the community donation card: every player puts 50 lakh in', () => {
    const news = spacesOf('event')[0] as number;
    const s = act(rollTo(forceCard(mm(), 'mm-event-donation'), news).state, { type: 'confirmCard' });
    expect(s.economy.pot).toBe(3 * 50);
  });
});

describe('tolls (spec 7.7)', () => {
  test('passing the Expressway or the Muse gate pays its owner 20 lakh; landing on it is rent instead', () => {
    const expressway = (mm(), spaceOf('Yangon–Mandalay Expressway'));
    const owned = own(mm(), expressway, 1);
    // From two spaces before, a 1 and a 3 pass the Expressway.
    const passed = rollWith(at(owned, 0, expressway - 2), 1, 3);
    expect(eventsOf(passed.events, 'tollPaid')).toEqual([{ type: 'tollPaid', from: 0, to: 1, space: expressway, amount: 20 }]);
    expect(cashOf(passed.state, 1)).toBe(cashOf(owned, 1) + 20);
    // Landing on it: rent, no toll.
    const landed = rollWith(at(owned, 0, expressway - 3), 1, 2);
    expect(eventsOf(landed.events, 'tollPaid')).toEqual([]);
    expect(landed.state.flow.pending).toMatchObject({ kind: 'rent' });
  });

  test('no toll on your own, an unowned, a mortgaged one, or an owner in service', () => {
    const expressway = (mm(), spaceOf('Yangon–Mandalay Expressway'));
    const pass = (s: GameState) => eventsOf(rollWith(at(s, 0, expressway - 2), 1, 3).events, 'tollPaid');
    expect(pass(mm())).toEqual([]);
    expect(pass(own(mm(), expressway, 0))).toEqual([]);
    expect(pass(act(own(mm(), expressway, 1), { type: 'debug', op: 'setMortgaged', space: expressway, mortgaged: true } as never))).toEqual([]);
    expect(pass(edit(own(mm(), expressway, 1), (d) => void ((d.players[1] as P).draft = { status: 'hiding', turns: 2 })))).toEqual([]);
  });

  test('a player who cannot pay a toll raises the money first, then lands', () => {
    const expressway = (mm(), spaceOf('Yangon–Mandalay Expressway'));
    const falam = spaceOf('Falam');
    const s = own(own(setCash(mm(), 0, 5), expressway, 1), falam, 0);
    const passed = rollWith(at(s, 0, expressway - 2), 1, 3).state;
    expect(passed.flow.phase).toBe('Debt');
    const mortgaged = act(passed, { type: 'mortgage', space: falam }, { type: 'payDebt' });
    expect(cashOf(mortgaged, 1)).toBe(cashOf(s, 1) + 20);
    expect(mortgaged.players[0]?.position).toBe(expressway + 2);
    expect(mortgaged.flow.phase).not.toBe('Debt');
  });
});

describe('the lottery (spec 7.8)', () => {
  const draw = (dice: [number, number], cash = 4000) => {
    const chance = spacesOf('chance')[1] as number;
    const s = rollTo(forceCard(setCash(mm(), 0, cash), 'mm-chance-lottery'), chance).state;
    expect(legalActions(s)).toContainEqual({ type: 'buyTicket' });
    return { before: cashOf(s, 0), ...run(nextDice(s, dice[0], dice[1]), { type: 'buyTicket' }) };
  };

  test('a 10-lakh ticket and two dice: 12 wins 3,000, 10 or 11 wins 500, 7 to 9 wins 100, below nothing', () => {
    for (const [dice, prize] of [
      [[6, 6], 3000],
      [[5, 6], 500],
      [[4, 6], 500],
      [[3, 4], 100],
      [[4, 5], 100],
      [[1, 5], 0],
    ] as Array<[[number, number], number]>) {
      const { before, state, events } = draw(dice);
      expect(cashOf(state, 0), `${dice}`).toBe(before - 10 + prize);
      expect(eventsOf(events, 'lotteryDrawn')[0]?.prize).toBe(prize);
    }
  });

  test('OK without a ticket costs nothing', () => {
    const chance = spacesOf('chance')[1] as number;
    const s = rollTo(forceCard(mm(), 'mm-chance-lottery'), chance).state;
    expect(cashOf(act(s, { type: 'confirmCard' }), 0)).toBe(cashOf(s, 0));
  });
});

describe('the earthquake (spec 7.5)', () => {
  test('odd: every Mandalay region building falls, unpaid; even: Anyar', () => {
    const [meiktila, pyinOoLwin, mandalay, pakokku, monywa, magway] = (mm(), ['Meiktila', 'Pyin Oo Lwin', 'Mandalay', 'Pakokku', 'Monywa', 'Magway'].map(spaceOf)) as number[];
    const built = levels(own(own(mm(), [meiktila, pyinOoLwin, mandalay] as number[], 1), [pakokku, monywa, magway] as number[], 2), [
      [meiktila as number, 2],
      [pyinOoLwin as number, 2],
      [mandalay as number, 3],
      [pakokku as number, 1],
      [monywa as number, 1],
      [magway as number, 1],
    ]);
    const news = spacesOf('event')[0] as number;
    const quake = (die: number) => run(nextDice(rollTo(forceCard(built, 'mm-event-earthquake'), news).state, die, 1), { type: 'confirmCard' });
    const odd = quake(3);
    expect(eventsOf(odd.events, 'earthquake')[0]).toMatchObject({ die: 3, region: 'mmMandalay' });
    expect([meiktila, pyinOoLwin, mandalay].map((sp) => odd.state.properties[sp as number]?.level)).toEqual([0, 0, 0]);
    expect(odd.state.properties[pakokku as number]?.level).toBe(1);
    expect(cashOf(odd.state, 1)).toBe(cashOf(built, 1));
    const even = quake(4);
    expect([pakokku, monywa, magway].map((sp) => even.state.properties[sp as number]?.level)).toEqual([0, 0, 0]);
    expect(even.state.properties[mandalay as number]?.level).toBe(3);
  });
});

describe('remittance (spec 7.10)', () => {
  test('a player who fled receives 200 lakh at each round start while at the border', () => {
    let s = act(rollTo(setCash(mm(), 0, 3000), SPACES.goToJail).state, { type: 'draftChoose', how: 'flee' });
    expect(s.players[0]?.position).toBe(borderSpace());
    const cash = cashOf(s, 0);
    s = endTurn(s);
    s = endTurn(rollTo(s, SPACES.jail).state);
    const round = run(rollTo(s, SPACES.jail).state, { type: 'endTurn' });
    expect(eventsOf(round.events, 'roundStarted')).toHaveLength(1);
    expect(eventsOf(round.events, 'remittance')).toEqual([{ type: 'remittance', player: 0, amount: 200 }]);
    expect(cashOf(round.state, 0)).toBe(cash + 200);
  });
});

describe('saves', () => {
  test('a pot, a lottery card on the table and a toll debt survive a save and a load', () => {
    const expressway = (mm(), spaceOf('Yangon–Mandalay Expressway'));
    const chance = spacesOf('chance')[1] as number;
    const states = [
      edit(mm(), (d) => void (d.economy.pot = 750)),
      rollTo(forceCard(mm(), 'mm-chance-lottery'), chance).state,
      rollWith(at(own(own(setCash(mm(), 0, 5), expressway, 1), spaceOf('Falam'), 0), 0, expressway - 2), 1, 3).state,
    ];
    for (const s of states) {
      const parsed = parseSave(serializeGame(s));
      expect(parsed.ok && parsed.state).toEqual(s);
    }
  });
});

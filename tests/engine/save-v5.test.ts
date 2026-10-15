// Version 5 (the Myanmar map's spec v2, D106): a version 4 save, and a room kept by the server from
// before, gain ranks, unrest cups and a general (none). A Myanmar game also gains the Brycen Myanmar
// company in place of the Special tax and the new cards at the bottom of its draw piles.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { MYANMAR } from '../../src/data/balance';
import {
  cardsForSettings,
  checkInvariants,
  legalActions,
  parseSave,
  reduce,
  SCHEMA_VERSION,
  serializeGame,
  upgradeGame,
  type Action,
  type GameState,
} from '../../src/engine';

// tests/fixtures/save-v4.json was written by the version 4 build: a Myanmar game in round 29 with a
// loan, inflation and merit points.
const v4Text = readFileSync(new URL('../fixtures/save-v4.json', import.meta.url), 'utf8');
const BRYCEN = 44;

describe('version 4 saves', () => {
  test('a version 4 Myanmar save loads as the current version: Brycen Myanmar unowned, new cards drawn last, nothing else changed', () => {
    const v4 = JSON.parse(v4Text);
    expect(v4.meta.schemaVersion).toBe(4);
    expect(v4.properties[BRYCEN]).toBeNull();
    const parsed = parseSave(v4Text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const s = parsed.state;
    expect(SCHEMA_VERSION).toBe(6);
    expect(s.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.properties[BRYCEN]).toEqual({ owner: null, level: 0, mortgaged: false });
    expect(s.players.map((p) => [p.rank, p.rankAt, p.unrest])).toEqual(s.players.map(() => [0, 0, MYANMAR.unrestCups]));
    expect(s.economy).toMatchObject({ general: null, powerRound: null, unrestUsed: 0, bribed: [], rankSeq: 0 });
    // The old draw pile comes first, then the cards new to this version.
    expect(s.decks.chanceDeck.slice(0, v4.decks.chanceDeck.length)).toEqual(v4.decks.chanceDeck);
    expect(s.decks.eventDeck.slice(0, v4.decks.eventDeck.length)).toEqual(v4.decks.eventDeck);
    const all = (deck: 'chance' | 'event') => cardsForSettings(deck, s.meta.settings).map((c) => c.id).sort();
    const inPlay = (deck: 'chance' | 'event') =>
      [
        ...(deck === 'chance' ? [...s.decks.chanceDeck, ...s.decks.chanceDiscard] : [...s.decks.eventDeck, ...s.decks.eventDiscard]),
        ...s.players.flatMap((p) => p.jailCards).filter((id) => id.includes(`-${deck}-`)),
      ].sort();
    expect(inPlay('chance')).toEqual(all('chance'));
    expect(inPlay('event')).toEqual(all('event'));
    // Everything else is as saved.
    const strip = (g: Record<string, any>) => ({
      ...g,
      decks: null,
      properties: g.properties.map((p: unknown, i: number) => (i === BRYCEN ? null : p)),
      players: g.players.map(({ rank: _r, rankAt: _a, unrest: _u, ...p }: Record<string, unknown>) => p),
      economy: { pot: g.economy.pot, inflation: g.economy.inflation, loans: g.economy.loans, loanSeq: g.economy.loanSeq },
      meta: { ...g.meta, schemaVersion: 4, settings: { ...g.meta.settings, general: null } },
    });
    expect(strip(s)).toEqual(strip(v4));
    expect(checkInvariants(s)).toEqual([]);
    // It plays on.
    const step = reduce(s, legalActions(s).find((a) => a.type === 'roll') as Action);
    expect(step.error).toBeNull();
    expect(upgradeGame(v4 as GameState)).toEqual(s);
  });

  test('a version 4 Myanmar game in the middle of paying the Special tax still loads and plays on', () => {
    const v4 = JSON.parse(v4Text);
    const me = v4.turn.currentPlayerIndex;
    v4.players[me].position = BRYCEN;
    v4.turn.dice = [3, 4];
    v4.turn.rollsLeft = 0;
    v4.flow.phase = 'RentDue';
    v4.flow.pending = {
      kind: 'rent',
      rent: { space: BRYCEN, payer: me, creditor: null, amount: 500, calc: { kind: 'tax', tax: 'luxury' }, freeStayAllowed: false },
    };
    const parsed = parseSave(JSON.stringify(v4));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const paid = reduce(parsed.state, { type: 'payRent' });
    expect(paid.error).toBeNull();
    expect(paid.state.players[me]?.cash).toBe(v4.players[me].cash - 500);
    expect(checkInvariants(paid.state)).toEqual([]);
  });

  test('a version 5 game saves and loads unchanged', () => {
    const parsed = parseSave(v4Text);
    if (!parsed.ok) throw new Error('fixture');
    const again = parseSave(serializeGame(parsed.state));
    expect(again.ok && again.state).toEqual(parsed.state);
  });
});

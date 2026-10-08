// @vitest-environment jsdom
// Rule guide (spec section 15): opening and closing it in every phase leaves the game state
// identical. It is opened three ways: the top-bar button, the R key and a panel's help button.
import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createGame, PHASES, type GameState, type TradeOffer } from '../../src/engine';
import { App } from '../../src/ui/App';
import { app, resetUi } from '../../src/ui/store';
import { act, endTurn, game, own, rollTo, setCash } from '../engine/helpers';

beforeAll(() => {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= NoopResizeObserver;
});

afterEach(() => {
  cleanup();
  resetUi();
});

function inJailAtTurnStart(): GameState {
  let s = rollTo(game({ auction: false }), 57).state;
  s = endTurn(s);
  return endTurn(rollTo(s, 34).state);
}

function vacationSkip(): GameState {
  let s = endTurn(rollTo(game(), 40).state);
  return endTurn(rollTo(s, 34).state);
}

const trade: TradeOffer = {
  from: 0,
  to: 1,
  give: { properties: [12], cash: 0, jailCards: 0 },
  get: { properties: [], cash: 100, jailCards: 0 },
};

function states(): Array<[string, GameState]> {
  const bankrupt = act(rollTo(setCash(own(game({ mode: 'normal' }), 12, 1), 0, 10), 12).state, { type: 'payRent' });
  return [
    ['PassDevice', createGame({ passDevice: true }, 1)],
    ['TurnStart (Jail)', inJailAtTurnStart()],
    ['TurnStart (Vacation)', vacationSkip()],
    ['AwaitRoll', game()],
    ['BuyDecision', rollTo(game(), 9).state],
    ['Auction', act(rollTo(game(), 9).state, { type: 'decline' })],
    ['RentDue', rollTo(own(game(), 12, 1), 12).state],
    ['CompanyRoll', rollTo(own(game(), 11, 1), 11).state],
    ['CardReveal', rollTo(game(), 13).state],
    ['BuildOffer', rollTo(own(game(), [12, 14], 0), 12).state],
    ['Debt', act(rollTo(setCash(own(own(game(), 12, 1), 9, 0), 0, 10), 12).state, { type: 'payRent' })],
    ['AwaitEndTurn', rollTo(game(), 34).state],
    ['GameOver (notice)', bankrupt],
    ['GameOver', act(bankrupt, { type: 'acknowledge' })],
    ['Vacation notice', rollTo(game(), 40).state],
    ['Trade offer pending', act(own(game(), 12, 0), { type: 'proposeTrade', offer: trade })],
  ];
}

function show(s: GameState) {
  rtlAct(() => app.set({ screen: 'game', game: s, events: [], refusal: null }));
  return render(<App />);
}

function guide() {
  return screen.queryByRole('dialog', { name: 'Rule guide' });
}

describe('rule guide', () => {
  test('every phase is covered by these states', () => {
    const phases = new Set(states().map(([, s]) => s.flow.phase));
    expect([...phases].sort()).toEqual([...PHASES].sort());
  });

  for (const [name, s] of states()) {
    test(`opening and closing it during ${name} leaves the game state identical`, () => {
      const before = JSON.stringify(s);
      show(s);
      // Top-bar Rules button, closed with Esc.
      fireEvent.click(screen.getByRole('button', { name: 'Rules' }));
      expect(guide()).not.toBeNull();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(guide()).toBeNull();
      // R key, closed with the Close button.
      fireEvent.keyDown(document.body, { key: 'r' });
      expect(guide()).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(guide()).toBeNull();
      // A panel help button opens the guide at its topic.
      const help = screen.queryAllByRole('button', { name: /^Help:/ });
      if (help[0]) {
        fireEvent.click(help[0]);
        expect(guide()).not.toBeNull();
        fireEvent.keyDown(window, { key: 'Escape' });
      }
      expect(app.get().game).toBe(s);
      expect(JSON.stringify(app.get().game)).toBe(before);
    });
  }

  test('a help button opens the matching topic, and search filters by any word', () => {
    show(inJailAtTurnStart());
    fireEvent.click(screen.getByRole('button', { name: /^Help:/ }));
    const dialog = within(guide() as HTMLElement);
    expect(dialog.getByRole('heading', { name: 'Jail', level: 3 })).toBeTruthy();
    fireEvent.change(dialog.getByPlaceholderText('Search the rules'), { target: { value: 'mortgage' } });
    const topics = within(dialog.getByRole('navigation')).getAllByRole('button').map((b) => b.textContent);
    expect(topics).toContain('Mortgages');
    expect(topics).not.toContain('Jail');
  });

  test('a switched-off topic says so in its first line, and tables come from the game data', () => {
    show(game({ vacation: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Rules' }));
    const dialog = within(guide() as HTMLElement);
    fireEvent.click(dialog.getByRole('button', { name: 'Vacation' }));
    expect(dialog.getByText('Vacation is switched off in this game.')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Airports' }));
    expect(dialog.getByText('$1,250')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Companies' }));
    expect(dialog.getByText('Global Finance Company')).toBeTruthy();
  });
});

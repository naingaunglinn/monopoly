// The engine contract (spec section 9): purity, immutability, the fixed phase set.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createGame, legalActions, PHASES, reduce, type Action, type GameState } from '../../src/engine';
import { mulberry32 } from '../../src/engine/rng';

const ENGINE_DIR = join(__dirname, '../../src/engine');

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

describe('engine contract', () => {
  test('the phase machine has exactly the 12 specified values', () => {
    expect([...PHASES]).toEqual([
      'PassDevice',
      'TurnStart',
      'AwaitRoll',
      'BuyDecision',
      'Auction',
      'RentDue',
      'CompanyRoll',
      'CardReveal',
      'BuildOffer',
      'Debt',
      'AwaitEndTurn',
      'GameOver',
    ]);
  });

  test('engine sources use no React, DOM, timers, Date.now or Math.random', () => {
    const files = readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10);
    const forbidden = [
      /Math\.random/,
      /Date\.now/,
      /new Date\(/,
      /performance\.now/,
      /setTimeout|setInterval|requestAnimationFrame/,
      /from ['"]react/,
      /\bdocument\./,
      /\bwindow\./,
      /localStorage/,
    ];
    for (const file of files) {
      // Comments may mention the forbidden names; code may not.
      const source = readFileSync(join(ENGINE_DIR, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const pattern of forbidden) expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  test('reduce never mutates its input and is deterministic', () => {
    let s: GameState = createGame({ playerCount: 4 }, 31);
    let r = 1;
    for (let i = 0; i < 600 && s.flow.phase !== 'GameOver'; i++) {
      const legal = legalActions(s).filter((a) => a.type !== 'proposeTrade') as Action[];
      const pick = mulberry32(r);
      r = pick.next;
      const action = legal[Math.floor(pick.value * legal.length)] as Action;
      const snapshot = JSON.stringify(s);
      const frozen = deepFreeze(JSON.parse(snapshot) as GameState);
      const a = reduce(frozen, action); // throws in strict mode if it writes to the frozen input
      const b = reduce(JSON.parse(snapshot) as GameState, action);
      expect(JSON.stringify(frozen)).toBe(snapshot);
      expect(a.state).toStrictEqual(b.state);
      s = b.state;
    }
  });

  test('every legal action is accepted and illegal ones return a reason', () => {
    let s: GameState = createGame({ playerCount: 3 }, 8);
    let r = 9;
    for (let i = 0; i < 400 && s.flow.phase !== 'GameOver'; i++) {
      const legal = legalActions(s).filter((a) => a.type !== 'proposeTrade') as Action[];
      for (const action of legal) expect(reduce(s, action).error).toBeNull();
      const illegal = reduce(s, { type: 'endTurn' });
      if (s.flow.phase !== 'AwaitEndTurn' || s.flow.notices.length || s.flow.trade) {
        expect(illegal.error?.reason.length).toBeGreaterThan(0);
        expect(illegal.state).toBe(s);
      }
      const pick = mulberry32(r);
      r = pick.next;
      s = reduce(s, legal[Math.floor(pick.value * legal.length)] as Action).state;
    }
  });
});

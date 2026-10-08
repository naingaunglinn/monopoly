// The animation player (spec section 13). The engine has already produced the final state; this
// replays the events of the last action on top of the previous state: dice tumble, token steps,
// World Start flash, landing glow, counting cash, floating amounts, coin, stamp and pips.
// Any click, tap or key press finishes it at once, and that input is swallowed so it cannot also
// press a button. Speed: Normal uses the spec table, Fast halves it, Off is instant. With
// prefers-reduced-motion, movement and bounces are off (fades stay, at most 150 ms).
import type { AnimationSpeed, Dice, GameEvent, GameState } from '../engine';
import { getDisplay, resetDisplay, setDisplay, type FloatAmount } from './display';

/** Normal durations in ms (spec section 13). */
export const DURATIONS = {
  dice: 700,
  step: 150,
  fastStep: 90,
  startFlash: 600,
  landing: 300,
  money: 700,
  buy: 500,
  rent: 800,
  house: 500,
  hotel: 700,
  card: 600,
  banner: 300,
  jail: 500,
  panel: 200,
  confetti: 2000,
} as const;

let timers: number[] = [];
let frame = 0;
let seq = 0;
let swallowUntil = 0;
let installed = false;

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function later(ms: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, ms));
}

function clearAll(): void {
  for (const t of timers) window.clearTimeout(t);
  timers = [];
  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
}

/** Finishes whatever is playing: everything jumps to the final state. */
export function finishNow(): void {
  clearAll();
  const d = getDisplay();
  if (d.busy || d.positions || d.cash || d.floats.length || d.lit.length || d.glow !== null) {
    resetDisplay({ confetti: null, pulse: d.pulse });
  }
}

/** Clears everything, including confetti (new game, continue, leaving the game). */
export function resetAnimation(): void {
  clearAll();
  resetDisplay();
}

function randomFace(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/** Counts each listed player's shown cash from `from` to `to` over `ms`. */
function countCash(from: number[], to: number[], ms: number): void {
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const ease = 1 - (1 - t) ** 3;
    const cash = from.map((f, i) => Math.round(f + ((to[i] ?? f) - f) * ease));
    setDisplay({ cash });
    if (t < 1) frame = window.requestAnimationFrame(tick);
    else frame = 0;
  };
  frame = window.requestAnimationFrame(tick);
}

/**
 * Builds and plays the timeline for one batch of events. `prev` is the state before the action.
 * Returns the total duration (0 when nothing is played).
 */
export function playBatch(prev: GameState | null, next: GameState, events: GameEvent[], speed: AnimationSpeed): number {
  finishNow();
  if (!prev || events.length === 0 || speed === 'off' || prefersReducedMotion()) {
    const confetti = events.some((e) => e.type === 'gameOver') && speed !== 'off' && !prefersReducedMotion();
    resetDisplay(confetti ? { confetti: ++seq } : {});
    if (confetti) later(DURATIONS.confetti, () => setDisplay({ confetti: null }));
    return 0;
  }
  const k = speed === 'fast' ? 0.5 : 1;
  const ms = (n: number) => Math.round(n * k);
  const positions = prev.players.map((p) => p.position);
  const moveMs = prev.players.map(() => 0);
  const cash = prev.players.map((p) => p.cash);
  const finalCash = next.players.map((p) => p.cash);
  let t = 0;
  let lastDice: Dice | null = prev.turn.dice;
  let animated = false;

  const at = (when: number, fn: () => void) => later(when, fn);

  for (const e of events) {
    switch (e.type) {
      case 'turnStarted': {
        const id = ++seq;
        at(t, () => setDisplay({ pulse: { player: e.player, id } }));
        break;
      }
      case 'diceRolled': {
        animated = true;
        const final = e.dice;
        const dur = ms(DURATIONS.dice);
        at(t, () => setDisplay({ rolling: true, dice: [randomFace(), randomFace()] }));
        for (let f = 90; f < dur - 60; f += 90) at(t + f, () => setDisplay({ dice: [randomFace(), randomFace()] }));
        at(t + dur, () => setDisplay({ rolling: false, dice: final }));
        lastDice = final;
        t += dur;
        break;
      }
      case 'moved': {
        animated = true;
        const step = ms(e.path.length >= 10 ? DURATIONS.fastStep : DURATIONS.step);
        e.path.forEach((space, i) => {
          at(t + i * step, () => {
            positions[e.player] = space;
            moveMs[e.player] = step;
            const lit = [space, e.path[i - 1]].filter((x): x is number => x !== undefined);
            setDisplay({ positions: positions.slice(), moveMs: moveMs.slice(), lit });
            if (space === 0 && e.direction === 1) {
              setDisplay({ flash: 0 });
              at(ms(DURATIONS.startFlash), () => setDisplay({ flash: null }));
            }
          });
        });
        t += e.path.length * step;
        at(t, () => setDisplay({ lit: [] }));
        break;
      }
      case 'teleported': {
        animated = true;
        const dur = ms(DURATIONS.jail);
        at(t, () => {
          positions[e.player] = e.to;
          moveMs[e.player] = dur;
          setDisplay({ positions: positions.slice(), moveMs: moveMs.slice(), glow: e.to });
        });
        t += dur;
        at(t, () => setDisplay({ glow: null }));
        break;
      }
      case 'landed': {
        const dur = ms(DURATIONS.landing);
        at(t, () => setDisplay({ glow: e.space }));
        at(t + dur, () => setDisplay({ glow: null }));
        t += dur;
        break;
      }
      case 'money': {
        animated = true;
        // Money changes that happen together play together, with one float per change.
        const id = ++seq;
        const float: FloatAmount = { id, player: e.player, amount: e.delta };
        at(t, () => setDisplay({ floats: [...getDisplay().floats, float] }));
        at(t + ms(DURATIONS.money), () => setDisplay({ floats: getDisplay().floats.filter((f) => f.id !== id) }));
        break;
      }
      case 'rentPaid': {
        animated = true;
        const id = ++seq;
        at(t, () => setDisplay({ coin: { from: e.from, to: e.to, id } }));
        at(t + ms(DURATIONS.rent), () => setDisplay({ coin: null }));
        break;
      }
      case 'bought':
      case 'auctionWon': {
        animated = true;
        const id = ++seq;
        at(t, () => setDisplay({ stamp: { space: e.space, id } }));
        at(t + ms(DURATIONS.buy), () => setDisplay({ stamp: null }));
        break;
      }
      case 'built': {
        animated = true;
        const id = ++seq;
        const hotel = e.level === 5;
        at(t, () => setDisplay({ pip: { space: e.space, hotel, id } }));
        at(t + ms(hotel ? DURATIONS.hotel : DURATIONS.house), () => setDisplay({ pip: null }));
        break;
      }
      case 'gameOver': {
        const id = ++seq;
        at(t, () => setDisplay({ confetti: id }));
        later(t + DURATIONS.confetti, () => setDisplay({ confetti: null }));
        break;
      }
      default:
        break;
    }
  }

  // Cash counts to its new value once the movement is over (passing World Start, rent, cards...).
  const changed = finalCash.some((c, i) => c !== cash[i]);
  if (changed) {
    const moneyStart = t;
    at(moneyStart, () => countCash(cash, finalCash, ms(DURATIONS.money)));
    t = moneyStart + ms(DURATIONS.money);
  }
  const hasRent = events.some((e) => e.type === 'rentPaid');
  if (hasRent) t = Math.max(t, ms(DURATIONS.rent));
  if (events.some((e) => e.type === 'built')) t = Math.max(t, ms(DURATIONS.house));
  if (events.some((e) => e.type === 'bought' || e.type === 'auctionWon')) t = Math.max(t, ms(DURATIONS.buy));

  if (!animated || t === 0) {
    clearAll();
    resetDisplay({ pulse: getDisplay().pulse });
    for (const e of events) {
      if (e.type === 'turnStarted') setDisplay({ pulse: { player: e.player, id: ++seq } });
      if (e.type === 'gameOver') {
        setDisplay({ confetti: ++seq });
        later(DURATIONS.confetti, () => setDisplay({ confetti: null }));
      }
    }
    return 0;
  }

  setDisplay({
    busy: true,
    positions: positions.slice(),
    moveMs: moveMs.slice(),
    cash: cash.slice(),
    dice: lastDice === prev.turn.dice ? prev.turn.dice : null,
  });
  later(t + 20, () => {
    clearAll();
    resetDisplay({ pulse: getDisplay().pulse, confetti: getDisplay().confetti });
  });
  return t;
}

/** Any click, tap or key press during an animation finishes it and is swallowed. */
export function installSkipHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const skip = (e: Event) => {
    if (!getDisplay().busy) return;
    finishNow();
    swallowUntil = performance.now() + 400;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('pointerdown', skip, true);
  window.addEventListener('keydown', skip, true);
  window.addEventListener(
    'click',
    (e) => {
      if (performance.now() < swallowUntil) {
        swallowUntil = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      // Clicking anywhere ends the confetti burst early.
      if (getDisplay().confetti !== null) setDisplay({ confetti: null });
    },
    true,
  );
}

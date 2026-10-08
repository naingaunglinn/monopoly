// The animation player (spec section 13, paced per D51). The engine has already produced the final
// state; this replays the events of the last action on top of the previous state: dice tumble, the
// token hopping space by space with the path lit in the player's colour, the World Start flash
// with +$500 floating up as the token passes, landing glow, counting cash, floating amounts, coin,
// stamp and pips. Any click, tap or key press finishes it at once, and that input is swallowed so it
// cannot also press a button. Speed: Normal uses DURATIONS, Fast halves them, Off is instant. With
// prefers-reduced-motion, movement and bounces are off (fades stay, at most 150 ms) unless the
// player turned on Show movement anyway (D52).
import type { AnimationSpeed, Dice, GameEvent, GameState } from '../engine';
import { getDisplay, resetDisplay, setDisplay, type FloatAmount } from './display';
import { getPrefs } from './prefs';

/**
 * Normal durations in ms. Slower than the spec table at the owner's request (D51) so a move can be
 * followed space by space. Fast halves every value. CSS keyframes in theme.css use the same values.
 */
export const DURATIONS = {
  dice: 1100,
  /** Per space. Long moves (cards) use shorter steps so a move stays within moveBudget. */
  step: 260,
  minStep: 70,
  moveBudget: 4200,
  startFlash: 900,
  landing: 450,
  money: 900,
  buy: 900,
  rent: 1100,
  house: 700,
  hotel: 900,
  card: 800,
  banner: 450,
  jail: 800,
  panel: 250,
  pulse: 800,
  confetti: 2000,
} as const;

/** Normal time per space for a move of `spaces` spaces. */
export function stepMs(spaces: number): number {
  const even = Math.round(DURATIONS.moveBudget / Math.max(1, spaces));
  return Math.max(DURATIONS.minStep, Math.min(DURATIONS.step, even));
}

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The device asks for reduced motion. */
export function osReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** Reduced motion applies: the device asks for it and the player has not chosen Show movement anyway. */
export function prefersReducedMotion(): boolean {
  return osReducedMotion() && !getPrefs().motionAnyway;
}

let timers: number[] = [];
let frame = 0;
let seq = 0;
let swallowUntil = 0;
let swallowClick = false;
let installed = false;

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
  /** When the token passes World Start in this batch (the +$500 floats up then). */
  let startAt: number | null = null;
  /** The latest end of any effect that does not move the timeline on (floats, coin, stamp, pips). */
  let end = 0;
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
        // The faces change fast at first, then slower and slower until the dice settle.
        let f = 0;
        let gap = ms(55);
        while (f + gap < dur - ms(110)) {
          f += gap;
          at(t + f, () => setDisplay({ dice: [randomFace(), randomFace()] }));
          gap = Math.round(gap * 1.16);
        }
        at(t + dur, () => setDisplay({ rolling: false, dice: final }));
        lastDice = final;
        t += dur;
        break;
      }
      case 'moved': {
        animated = true;
        const step = ms(stepMs(e.path.length));
        const mover = e.player;
        const passesStart = e.direction === 1;
        e.path.forEach((space, i) => {
          const when = t + i * step;
          if (passesStart && space === 0) startAt = when;
          at(when, () => {
            positions[mover] = space;
            moveMs[mover] = step;
            const lit = [space, e.path[i - 1]].filter((x): x is number => x !== undefined);
            const hop = { player: mover, id: ++seq, ms: step, last: i === e.path.length - 1 };
            setDisplay({ positions: positions.slice(), moveMs: moveMs.slice(), lit, mover, hop });
            if (passesStart && space === 0) {
              setDisplay({ flash: 0 });
              at(ms(DURATIONS.startFlash), () => setDisplay({ flash: null }));
            }
          });
        });
        t += e.path.length * step;
        at(t, () => setDisplay({ lit: [], hop: null }));
        break;
      }
      case 'teleported': {
        animated = true;
        const dur = ms(DURATIONS.jail);
        at(t, () => {
          positions[e.player] = e.to;
          moveMs[e.player] = dur;
          setDisplay({ positions: positions.slice(), moveMs: moveMs.slice(), glow: e.to, mover: e.player });
        });
        t += dur;
        at(t, () => setDisplay({ glow: null }));
        break;
      }
      case 'landed': {
        const dur = ms(DURATIONS.landing);
        at(t, () => setDisplay({ glow: e.space, mover: e.player }));
        at(t + dur, () => setDisplay({ glow: null }));
        t += dur;
        break;
      }
      case 'money': {
        animated = true;
        // Money changes that happen together play together, with one float per change.
        const when = e.reason === 'start' && startAt !== null ? startAt : t;
        const id = ++seq;
        const float: FloatAmount = { id, player: e.player, amount: e.delta };
        at(when, () => setDisplay({ floats: [...getDisplay().floats, float] }));
        at(when + ms(DURATIONS.money), () => setDisplay({ floats: getDisplay().floats.filter((f) => f.id !== id) }));
        end = Math.max(end, when + ms(DURATIONS.money));
        break;
      }
      case 'rentPaid': {
        animated = true;
        const id = ++seq;
        at(t, () => setDisplay({ coin: { from: e.from, to: e.to, id } }));
        at(t + ms(DURATIONS.rent), () => setDisplay({ coin: null }));
        end = Math.max(end, t + ms(DURATIONS.rent));
        break;
      }
      case 'bought':
      case 'auctionWon': {
        animated = true;
        const id = ++seq;
        at(t, () => setDisplay({ stamp: { space: e.space, id } }));
        at(t + ms(DURATIONS.buy), () => setDisplay({ stamp: null }));
        end = Math.max(end, t + ms(DURATIONS.buy));
        break;
      }
      case 'built': {
        animated = true;
        const id = ++seq;
        const hotel = e.level === 5;
        const dur = ms(hotel ? DURATIONS.hotel : DURATIONS.house);
        at(t, () => setDisplay({ pip: { space: e.space, hotel, id } }));
        at(t + dur, () => setDisplay({ pip: null }));
        end = Math.max(end, t + dur);
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
  t = Math.max(t, end);

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
    logUntil: prev.meta.logSeq,
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
    if (!getDisplay().busy) {
      if (e.type === 'pointerdown') swallowClick = false;
      return;
    }
    // Panning or pinching the phone board while a token moves follows it instead of skipping.
    if (e.type === 'pointerdown' && (e.target as Element | null)?.closest?.('[data-gesture-zone]')) return;
    finishNow();
    // The click that follows this press is swallowed however long the press lasts; after a key,
    // the click a focused button makes from it (Space on key up) within 400 ms.
    if (e.type === 'pointerdown') swallowClick = true;
    else swallowUntil = performance.now() + 400;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('pointerdown', skip, true);
  window.addEventListener('keydown', skip, true);
  window.addEventListener(
    'click',
    (e) => {
      const fromKey = e.detail === 0 && performance.now() < swallowUntil;
      if (swallowClick || fromKey) {
        swallowClick = false;
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

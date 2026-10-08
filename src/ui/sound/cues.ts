// The sound effects (spec section 18), each synthesized from the building blocks in synth.ts. The
// set follows the game's travel theme: an airport announcement chime for your turn and Chance
// boarding passes, a passport stamp when a property is bought, a teleprinter for news Events, a
// cell door for Jail, wooden steps for the token, coins for money, a gavel for auctions.
import type { StampId } from '../../online/protocol';
import { bell, clack, clank, hz, noise, thump, tone, vary, wood, type Mix } from './synth';

export const CUE_NAMES = [
  'dice',
  'diceQuick',
  'doubles',
  'hop',
  'land',
  'passStart',
  'gain',
  'loss',
  'rent',
  'buy',
  'auctionStart',
  'bid',
  'fold',
  'sold',
  'unsold',
  'chance',
  'event',
  'jail',
  'jailFail',
  'unlock',
  'vacation',
  'freeStay',
  'rollAgain',
  'build',
  'hotel',
  'sell',
  'mortgage',
  'unmortgage',
  'tradeOffer',
  'tradeYes',
  'tradeNo',
  'debt',
  'bankrupt',
  'win',
  'turn',
  'yourTurn',
  'refuse',
  'tick',
  'message',
  'stamp',
  'voiceOn',
  'voiceOff',
] as const;

export type CueName = (typeof CUE_NAMES)[number];

/** Quick reactions (spec section 18): each stamp has its own little sound after the thud. */
export type StampSound = StampId;

export interface CueParams {
  /** Dice: how long the dice tumble, ms. */
  ms?: number;
  /** Dice: when the faces change (s from the start), so every click matches what is shown. */
  offsets?: number[];
  /** Token steps: which step of how many. */
  step?: number;
  steps?: number;
  /** Rent: how long the coin flies, ms. */
  flight?: number;
  /** Stamps: which reaction. */
  stamp?: StampSound;
}

type Cue = (m: Mix, t: number, p: CueParams) => void;

/**
 * Loudness trims, measured with renderCue (the loudest 50 ms of each cue), so the set sits
 * together: big moments (winning, Jail, a sale, your turn) near -23 dBFS, actions near -27, small
 * feedback (steps, bids, chat) near -31. The tests keep every cue between -36 and -18 dBFS.
 */
export const CUE_TRIM: Partial<Record<CueName, number>> = {
  bankrupt: 0.56,
  sold: 0.61,
  jail: 0.75,
  win: 2,
  event: 2.1,
  hop: 2.2,
  bid: 2,
  fold: 2.2,
  unsold: 1.4,
  jailFail: 1.6,
  sell: 2,
  mortgage: 1.5,
  tick: 2.3,
  message: 3.4,
  voiceOn: 2.3,
  voiceOff: 3,
  rollAgain: 1.5,
  debt: 1.6,
  turn: 1.2,
  refuse: 1.35,
  doubles: 1.4,
};

/** Approximate length of each cue in seconds (when its nodes can be released). */
export function cueSeconds(name: CueName, p: CueParams = {}): number {
  if (name === 'dice') return (p.ms ?? 1100) / 1000 + 0.4;
  if (name === 'rent') return (p.flight ?? 1100) / 1000 + 0.6;
  if (name === 'win' || name === 'bankrupt' || name === 'vacation' || name === 'yourTurn' || name === 'chance') return 2.6;
  return 1.4;
}

/** A small fanfare voice: a sawtooth softened by a low-pass filter, like a muted brass note. */
function brass(m: Mix, t: number, note: number, peak: number, decay: number): void {
  tone(m, t, { freq: hz(note), type: 'sawtooth', lowpass: 2200, peak, attack: 0.02, decay, wet: 0.25 });
  // A second voice a hair sharp thickens the note.
  tone(m, t, { freq: hz(note) * 1.003, type: 'triangle', peak: peak * 0.6, attack: 0.015, decay, wet: 0.25 });
}

export const CUES: Record<CueName, Cue> = {
  // Dice tumbling: one click per face change (louder at first), then both dice settle on the table.
  dice(m, t, p) {
    const length = (p.ms ?? 1100) / 1000;
    const offsets = p.offsets ?? defaultOffsets(length);
    offsets.forEach((o, i) => clack(m, t + o, vary(0.12, 0.2) * (1 - (0.45 * i) / Math.max(1, offsets.length))));
    clack(m, t + length - 0.03, 0.26);
    clack(m, t + length, 0.3);
    thump(m, t + length, { freq: 170, peak: 0.28, decay: 0.08 });
  },
  // Instant play: a short rattle and the settle.
  diceQuick(m, t) {
    for (let i = 0; i < 5; i++) clack(m, t + i * 0.055 + vary(0, 0.012), vary(0.1, 0.17));
    clack(m, t + 0.32, 0.26);
    thump(m, t + 0.32, { freq: 170, peak: 0.26, decay: 0.08 });
  },
  doubles(m, t) {
    bell(m, t, hz(96), { peak: 0.07, decay: 0.35, wet: 0.2 });
    bell(m, t + 0.08, hz(100), { peak: 0.07, decay: 0.4, wet: 0.2 });
  },
  // One wooden step per space, walking up a pentatonic pattern so a long move sounds like travel.
  hop(m, t, p) {
    const pattern = [0, 2, 4, 7, 9, 7, 4, 2];
    const step = p.step ?? 0;
    const busy = (p.steps ?? 7) > 14;
    wood(m, t, hz(72 + (pattern[step % pattern.length] ?? 0)), { peak: busy ? 0.1 : 0.15, decay: busy ? 0.05 : 0.07 });
  },
  land(m, t) {
    wood(m, t, hz(67), { peak: 0.2, decay: 0.12, wet: 0.1 });
    thump(m, t, { freq: 115, peak: 0.3, decay: 0.15 });
    noise(m, t + 0.01, { filter: 'lowpass', freq: 900, peak: 0.05, decay: 0.08 });
  },
  // Passing World Start: a cash register bell and coins.
  passStart(m, t) {
    thump(m, t, { freq: 140, peak: 0.18, decay: 0.06 });
    bell(m, t, hz(96), { peak: 0.08, decay: 0.45 });
    bell(m, t + 0.07, hz(100), { peak: 0.08, decay: 0.45 });
    bell(m, t + 0.14, hz(103), { peak: 0.08, decay: 0.5 });
    bell(m, t + 0.18, hz(91), { peak: 0.1, decay: 0.9, wet: 0.3 });
    noise(m, t, { filter: 'highpass', freq: 5500, peak: 0.04, decay: 0.35 });
  },
  gain(m, t) {
    bell(m, t, hz(93), { peak: 0.08, decay: 0.35 });
    bell(m, t + 0.06, hz(98), { peak: 0.07, decay: 0.4, wet: 0.15 });
  },
  loss(m, t) {
    bell(m, t, hz(91), { peak: 0.06, decay: 0.3 });
    bell(m, t + 0.07, hz(86), { peak: 0.055, decay: 0.35 });
    thump(m, t + 0.07, { freq: 140, peak: 0.12, decay: 0.07 });
  },
  // Rent: the coin whooshes from payer to owner and lands.
  rent(m, t, p) {
    const flight = (p.flight ?? 1100) / 1000;
    noise(m, t, { filter: 'bandpass', freq: 500, to: 2600, q: 1.2, peak: 0.08, attack: flight * 0.25, decay: flight * 0.35 });
    const land = t + flight * 0.62;
    bell(m, land, hz(98), { peak: 0.1, decay: 0.45, wet: 0.15 });
    bell(m, land + 0.035, hz(103), { peak: 0.05, decay: 0.3 });
    thump(m, land, { freq: 160, peak: 0.1, decay: 0.05 });
  },
  // Bought: a passport stamp thud, then a bright register bell.
  buy(m, t) {
    thump(m, t, { freq: 95, peak: 0.5, decay: 0.16 });
    noise(m, t, { filter: 'lowpass', freq: 1800, q: 0.7, peak: 0.22, decay: 0.06 });
    noise(m, t + 0.02, { filter: 'highpass', freq: 3000, peak: 0.04, decay: 0.12 });
    bell(m, t + 0.12, hz(88), { peak: 0.1, decay: 0.7, wet: 0.3 });
    bell(m, t + 0.18, hz(95), { peak: 0.06, decay: 0.6, wet: 0.3 });
  },
  // Auctions: a gavel opens, each bid is a tap, folding is a muffled tap, and "sold" knocks twice.
  auctionStart(m, t) {
    wood(m, t, hz(57), { peak: 0.32, decay: 0.12 });
    thump(m, t, { freq: 100, peak: 0.3, decay: 0.12 });
    bell(m, t + 0.12, hz(81), { peak: 0.05, decay: 0.5, wet: 0.3 });
  },
  bid(m, t) {
    wood(m, t, hz(64), { peak: 0.18, decay: 0.08 });
  },
  fold(m, t) {
    tone(m, t, { freq: hz(55), type: 'triangle', peak: 0.1, decay: 0.12, lowpass: 900 });
  },
  sold(m, t) {
    wood(m, t, hz(57), { peak: 0.26, decay: 0.1 });
    thump(m, t, { freq: 100, peak: 0.24, decay: 0.1 });
    wood(m, t + 0.22, hz(57), { peak: 0.34, decay: 0.12 });
    thump(m, t + 0.22, { freq: 95, peak: 0.36, decay: 0.14 });
    bell(m, t + 0.3, hz(84), { peak: 0.08, decay: 0.8, wet: 0.3 });
  },
  unsold(m, t) {
    wood(m, t, hz(52), { peak: 0.2, decay: 0.1 });
    tone(m, t + 0.08, { freq: hz(64), to: hz(57), type: 'triangle', peak: 0.06, decay: 0.2 });
  },
  // Chance (a boarding pass): paper slides out, then the two-tone boarding call.
  chance(m, t) {
    noise(m, t, { filter: 'bandpass', freq: 3200, to: 1500, q: 0.8, peak: 0.08, attack: 0.03, decay: 0.22 });
    bell(m, t + 0.18, hz(76), { peak: 0.11, decay: 1.2, wet: 0.35 });
    bell(m, t + 0.5, hz(72), { peak: 0.11, decay: 1.4, wet: 0.35 });
  },
  // Event (the news ticker): a teleprinter burst and a two-note news sting.
  event(m, t) {
    for (let i = 0; i < 7; i++) {
      tone(m, t + i * 0.045, { freq: vary(1300, 1500), type: 'square', lowpass: 3000, peak: 0.045, attack: 0.001, decay: 0.012 });
    }
    tone(m, t + 0.36, { freq: hz(81), type: 'triangle', peak: 0.09, decay: 0.12, wet: 0.2 });
    tone(m, t + 0.5, { freq: hz(86), type: 'triangle', peak: 0.09, decay: 0.25, wet: 0.2 });
  },
  // Jail: the cell door slams with a metal clank, then the lock clicks.
  jail(m, t) {
    noise(m, t, { filter: 'lowpass', freq: 500, peak: 0.4, decay: 0.35 });
    thump(m, t, { freq: 75, peak: 0.45, decay: 0.4 });
    clank(m, t, 233, { peak: 0.1, decay: 0.7, wet: 0.3 });
    noise(m, t + 0.3, { filter: 'bandpass', freq: 3500, q: 3, peak: 0.12, decay: 0.012 });
    noise(m, t + 0.36, { filter: 'bandpass', freq: 2800, q: 3, peak: 0.1, decay: 0.012 });
  },
  jailFail(m, t) {
    tone(m, t, { freq: hz(55), to: hz(52), type: 'triangle', peak: 0.13, decay: 0.22 });
  },
  unlock(m, t) {
    noise(m, t, { filter: 'bandpass', freq: 3200, q: 3, peak: 0.12, decay: 0.012 });
    noise(m, t + 0.08, { filter: 'bandpass', freq: 2600, q: 3, peak: 0.12, decay: 0.015 });
    noise(m, t + 0.12, { filter: 'bandpass', freq: 600, to: 2400, q: 1, peak: 0.06, attack: 0.05, decay: 0.2 });
    bell(m, t + 0.2, hz(79), { peak: 0.07, decay: 0.6, wet: 0.3 });
  },
  // Vacation: a warm chord over a wave.
  vacation(m, t) {
    for (const note of [76, 80, 83]) tone(m, t, { freq: hz(note), peak: 0.055, attack: 0.12, decay: 1.1, wet: 0.45 });
    noise(m, t, { filter: 'lowpass', freq: 700, peak: 0.06, attack: 0.3, decay: 0.9 });
  },
  freeStay(m, t) {
    noise(m, t, { filter: 'lowpass', freq: 1200, peak: 0.06, attack: 0.05, decay: 0.25 });
    for (const note of [74, 78, 81]) tone(m, t + 0.05, { freq: hz(note), peak: 0.04, attack: 0.04, decay: 0.6, wet: 0.35 });
  },
  rollAgain(m, t) {
    tone(m, t, { freq: hz(72), to: hz(84), glide: 0.18, peak: 0.07, decay: 0.22 });
    bell(m, t + 0.16, hz(91), { peak: 0.05, decay: 0.4, wet: 0.2 });
  },
  // Building: hammer taps; a hotel adds a bright chord.
  build(m, t) {
    for (const at of [0, 0.14]) {
      wood(m, t + at, hz(67), { peak: 0.2, decay: 0.06 });
      noise(m, t + at, { filter: 'bandpass', freq: 2200, q: 2, peak: 0.13, decay: 0.025 });
      thump(m, t + at, { freq: 150, peak: 0.14, decay: 0.05 });
    }
  },
  hotel(m, t) {
    for (const at of [0, 0.14, 0.28]) {
      wood(m, t + at, hz(67), { peak: 0.2, decay: 0.06 });
      noise(m, t + at, { filter: 'bandpass', freq: 2200, q: 2, peak: 0.13, decay: 0.025 });
      thump(m, t + at, { freq: 150, peak: 0.14, decay: 0.05 });
    }
    for (const note of [84, 88, 91]) bell(m, t + 0.42, hz(note), { peak: 0.05, decay: 0.9, wet: 0.3 });
  },
  sell(m, t) {
    wood(m, t, hz(67), { peak: 0.16, decay: 0.06 });
    tone(m, t + 0.06, { freq: hz(81), to: hz(69), type: 'triangle', peak: 0.06, decay: 0.18 });
  },
  mortgage(m, t) {
    noise(m, t, { filter: 'highpass', freq: 2500, peak: 0.07, decay: 0.07 });
    noise(m, t + 0.09, { filter: 'highpass', freq: 2200, peak: 0.06, decay: 0.08 });
    tone(m, t + 0.05, { freq: hz(57), type: 'triangle', peak: 0.06, decay: 0.25 });
  },
  unmortgage(m, t) {
    noise(m, t, { filter: 'highpass', freq: 2500, peak: 0.06, decay: 0.07 });
    bell(m, t + 0.08, hz(93), { peak: 0.07, decay: 0.35 });
  },
  // Trades: an envelope swish with a ping, a "deal" arpeggio, and two low notes for no.
  tradeOffer(m, t) {
    noise(m, t, { filter: 'bandpass', freq: 800, to: 3200, q: 1, peak: 0.08, attack: 0.02, decay: 0.2 });
    bell(m, t + 0.15, hz(91), { peak: 0.07, decay: 0.5, wet: 0.25 });
  },
  tradeYes(m, t) {
    bell(m, t, hz(79), { peak: 0.09, decay: 0.6, wet: 0.25 });
    bell(m, t + 0.08, hz(83), { peak: 0.08, decay: 0.6, wet: 0.25 });
    bell(m, t + 0.16, hz(86), { peak: 0.08, decay: 0.8, wet: 0.25 });
  },
  tradeNo(m, t) {
    tone(m, t, { freq: hz(64), type: 'triangle', peak: 0.11, decay: 0.16 });
    tone(m, t + 0.14, { freq: hz(60), type: 'triangle', peak: 0.11, decay: 0.24 });
  },
  debt(m, t) {
    for (const at of [0, 0.16]) tone(m, t + at, { freq: hz(58), type: 'triangle', peak: 0.12, decay: 0.12 });
  },
  // Bankruptcy: a long fall, a thud and coins scattering.
  bankrupt(m, t) {
    tone(m, t, { freq: 440, to: 70, glide: 0.9, type: 'sawtooth', lowpass: 1200, peak: 0.08, attack: 0.02, decay: 0.95 });
    thump(m, t + 0.85, { freq: 60, peak: 0.42, decay: 0.4 });
    for (let i = 0; i < 6; i++) bell(m, t + 0.9 + i * 0.07, vary(1200, 2600) * (1 - i * 0.06), { peak: 0.035, decay: 0.3 });
  },
  // The winner: a brass arpeggio, a held chord and a sparkle that matches the confetti.
  win(m, t) {
    [72, 76, 79].forEach((note, i) => brass(m, t + i * 0.12, note, 0.08, 0.25));
    for (const note of [84, 88, 91]) brass(m, t + 0.38, note, 0.06, 1.0);
    for (let i = 0; i < 10; i++) bell(m, t + vary(0.4, 1.6), vary(2500, 5000), { peak: 0.025, decay: 0.3, wet: 0.3 });
  },
  // Turn changes on one shared device: a soft two-note marimba.
  turn(m, t) {
    wood(m, t, hz(69), { peak: 0.09, decay: 0.12, wet: 0.2 });
    wood(m, t + 0.11, hz(74), { peak: 0.09, decay: 0.16, wet: 0.2 });
  },
  // Your turn, online: the rising three-tone airport announcement chime.
  yourTurn(m, t) {
    bell(m, t, hz(72), { peak: 0.1, decay: 1.2, wet: 0.4 });
    bell(m, t + 0.26, hz(76), { peak: 0.1, decay: 1.2, wet: 0.4 });
    bell(m, t + 0.52, hz(79), { peak: 0.11, decay: 1.5, wet: 0.4 });
  },
  refuse(m, t) {
    tone(m, t, { freq: hz(50), type: 'triangle', peak: 0.08, decay: 0.07 });
    tone(m, t + 0.09, { freq: hz(47), type: 'triangle', peak: 0.08, decay: 0.09 });
  },
  // The volume preview.
  tick(m, t) {
    wood(m, t, hz(76), { peak: 0.16, decay: 0.08 });
    bell(m, t + 0.05, hz(88), { peak: 0.05, decay: 0.3 });
  },
  // A chat message arrives: a soft pop.
  message(m, t) {
    tone(m, t, { freq: hz(84), to: hz(78), glide: 0.07, peak: 0.09, attack: 0.003, decay: 0.1 });
    noise(m, t, { filter: 'bandpass', freq: 3000, q: 2, peak: 0.03, decay: 0.01 });
  },
  // A stamp reaction: the rubber stamp thud, then its own little sound.
  stamp(m, t, p) {
    thump(m, t, { freq: 110, peak: 0.36, decay: 0.14 });
    noise(m, t, { filter: 'lowpass', freq: 1500, peak: 0.16, decay: 0.05 });
    const at = t + 0.07;
    switch (p.stamp) {
      case 'nice':
        bell(m, at, hz(88), { peak: 0.08, decay: 0.6, wet: 0.25 });
        bell(m, at + 0.06, hz(93), { peak: 0.06, decay: 0.5, wet: 0.25 });
        break;
      case 'ouch':
        tone(m, at, { freq: hz(59), to: hz(54), type: 'triangle', peak: 0.12, decay: 0.25 });
        break;
      case 'haha':
        [79, 83, 86].forEach((note, i) => tone(m, at + i * 0.07, { freq: hz(note), to: hz(note + 2), glide: 0.05, peak: 0.07, decay: 0.07 }));
        break;
      case 'wow':
        tone(m, at, { freq: 600, to: 1800, glide: 0.35, peak: 0.05, attack: 0.02, decay: 0.35, wet: 0.3 });
        for (let i = 0; i < 4; i++) bell(m, at + 0.1 + i * 0.07, vary(2000, 3200), { peak: 0.03, decay: 0.3, wet: 0.3 });
        break;
      case 'hurry':
        [0, 0.15, 0.3, 0.45].forEach((d, i) => wood(m, at + d, i % 2 === 0 ? 1200 : 900, { peak: 0.12, decay: 0.04 }));
        break;
      case 'gg':
        [72, 79, 84].forEach((note, i) => tone(m, at + i * 0.1, { freq: hz(note), type: 'triangle', peak: 0.08, decay: 0.2, wet: 0.25 }));
        break;
      default:
        break;
    }
  },
  // Someone joins or leaves voice chat: a radio click and a rising or falling blip.
  voiceOn(m, t) {
    noise(m, t, { filter: 'bandpass', freq: 2000, q: 2, peak: 0.06, decay: 0.02 });
    tone(m, t + 0.02, { freq: hz(76), to: hz(83), glide: 0.1, peak: 0.07, decay: 0.14 });
  },
  voiceOff(m, t) {
    tone(m, t, { freq: hz(83), to: hz(76), glide: 0.1, peak: 0.06, decay: 0.14 });
    noise(m, t + 0.12, { filter: 'bandpass', freq: 2000, q: 2, peak: 0.05, decay: 0.02 });
  },
};

/** The face-change times the dice animation uses (animation.ts) when none are given. */
export function defaultOffsets(length: number): number[] {
  const out: number[] = [];
  let f = 0;
  let gap = 0.055;
  while (f + gap < length - 0.11) {
    f += gap;
    out.push(f);
    gap *= 1.16;
  }
  return out;
}

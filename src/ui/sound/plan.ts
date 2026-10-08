// Which sound each game event makes (spec section 18). The animation player (animation.ts) plays
// these at the moment the board shows the event; with animation Off, reduced motion or a batch with
// nothing to animate, `summarize` picks the few sounds that tell what happened, in order.
import type { GameEvent } from '../../engine';
import type { CueName, CueParams } from './cues';

export interface CueCall {
  cue: CueName;
  params?: CueParams;
}

export interface SoundContext {
  /** Online, turn changes are not announced (the device whose turn it is hears its own chime). */
  online: boolean;
}

/** The sound of one event, or null for a silent one. */
export function cueFor(e: GameEvent, o: SoundContext): CueCall | null {
  switch (e.type) {
    case 'turnStarted':
      return o.online ? null : { cue: 'turn' };
    case 'diceRolled':
      return { cue: 'dice' };
    case 'moved':
      return { cue: 'land' };
    case 'teleported':
      return e.reason === 'jail' ? { cue: 'jail' } : null;
    case 'money':
      return moneyCue(e);
    case 'rentPaid':
      return { cue: 'rent' };
    case 'bought':
      return { cue: 'buy' };
    case 'auctionStarted':
      return { cue: 'auctionStart' };
    case 'bid':
      return { cue: 'bid' };
    case 'folded':
      return e.auto ? null : { cue: 'fold' };
    case 'auctionWon':
      return { cue: 'sold' };
    case 'auctionUnsold':
      return { cue: 'unsold' };
    case 'cardDrawn':
      return { cue: e.deck === 'chance' ? 'chance' : 'event' };
    case 'jailRollFailed':
      return { cue: 'jailFail' };
    case 'leftJail':
      return { cue: 'unlock' };
    case 'vacationStarted':
      return { cue: 'vacation' };
    case 'freeStayUsed':
      return { cue: 'freeStay' };
    case 'rollAgainGranted':
      return { cue: 'rollAgain' };
    case 'built':
      return { cue: e.level === 5 ? 'hotel' : 'build' };
    case 'buildingSold':
      return { cue: 'sell' };
    case 'mortgaged':
      return { cue: 'mortgage' };
    case 'unmortgaged':
      return { cue: 'unmortgage' };
    case 'tradeProposed':
      return { cue: 'tradeOffer' };
    case 'tradeAccepted':
      return { cue: 'tradeYes' };
    case 'tradeRejected':
    case 'tradeCancelled':
      return { cue: 'tradeNo' };
    case 'debtStarted':
      return { cue: 'debt' };
    case 'bankrupt':
    case 'playerRemoved':
      return { cue: 'bankrupt' };
    case 'gameOver':
      return { cue: 'win' };
    default:
      return null;
  }
}

/** Money changes with no sound of their own; buying, rent, building, trades and the rest have one. */
function moneyCue(e: Extract<GameEvent, { type: 'money' }>): CueCall | null {
  switch (e.reason) {
    case 'start':
      return { cue: 'passStart' };
    case 'tax':
    case 'jailFine':
    case 'card':
    case 'freeStayCash':
      return { cue: e.delta >= 0 ? 'gain' : 'loss' };
    default:
      return null;
  }
}

/** At most this many sounds when a batch plays at once. */
export const SUMMARY_LIMIT = 4;

/** The sounds of a batch played at once: each sound once, in order; the start and the last outcomes. */
export function summarize(events: GameEvent[], o: SoundContext): CueCall[] {
  const out: CueCall[] = [];
  const seen = new Set<CueName>();
  for (const e of events) {
    const c = cueFor(e, o);
    if (!c) continue;
    const call: CueCall = c.cue === 'dice' ? { cue: 'diceQuick' } : c;
    if (seen.has(call.cue)) continue;
    seen.add(call.cue);
    out.push(call);
  }
  return out.length <= SUMMARY_LIMIT ? out : [out[0] as CueCall, ...out.slice(-(SUMMARY_LIMIT - 1))];
}

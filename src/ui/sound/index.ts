// Sound effects (spec section 18): the public surface for the rest of the interface.
import type { GameEvent } from '../../engine';
import { playCue } from './engine';
import { summarize, type SoundContext } from './plan';

export { installAudioUnlock, playCue, stopSounds, volumeGain } from './engine';
export { cueFor, summarize, type CueCall, type SoundContext } from './plan';
export type { CueName, CueParams, StampSound } from './cues';

/** Gap between the sounds of a batch played at once (seconds). */
const SUMMARY_GAP = 0.16;

/** Plays a batch at once (animation Off, reduced motion, nothing to animate): its key sounds in order. */
export function playEvents(events: GameEvent[], o: SoundContext): void {
  summarize(events, o).forEach((c, i) => playCue(c.cue, c.params, i * SUMMARY_GAP));
}

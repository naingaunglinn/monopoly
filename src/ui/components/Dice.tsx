// Two large dice: ivory cubes with Ink pips, their total and a Move N spaces line.
import type { Dice as DicePair } from '../../engine';
import { T } from '../strings';

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

export function Die({ value, size = 56, rolling = false }: { value: number; size?: number; rolling?: boolean }) {
  return (
    <svg
      className={`die ${rolling ? 'is-rolling' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={T.play.die(value)}
    >
      <rect x="3" y="3" width="94" height="94" rx="18" className="die-face" />
      {(PIPS[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" className="die-pip" />
      ))}
    </svg>
  );
}

export function DicePanel({ dice, line, rolling = false }: { dice: DicePair | null; line: string | null; rolling?: boolean }) {
  const shown: DicePair = dice ?? [1, 1];
  return (
    <div className={`dice-panel ${dice ? '' : 'is-idle'}`}>
      <div className="dice-pair">
        <Die value={shown[0]} rolling={rolling} />
        <Die value={shown[1]} rolling={rolling} />
      </div>
      {dice && (
        <div className="dice-total" aria-live="polite">
          <span className="dice-sum">{dice[0] + dice[1]}</span>
          {line && <span className="dice-line">{line}</span>}
        </div>
      )}
    </div>
  );
}

// Colour choice (D53). The player's token opens a small palette that previews the token in every
// colour. On the setup screen picking a colour another player has swaps the two; in an online lobby
// (exclusive) another player's colour cannot be taken. The palette floats above the form.
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { PLAYER_COLORS, type TokenKind } from '../../data/players';
import { colorName, T } from '../strings';
import { TokenChip } from './glyphs';

const COLUMNS = 4;

interface ColorPickerProps {
  /** 0-based seat, for ids. */
  seat: number;
  /** The player's name as shown (typed or default). */
  name: string;
  token: TokenKind;
  color: string;
  /** Names of the other players by the colour they have now. */
  holders: Readonly<Record<string, string>>;
  onPick: (color: string) => void;
  /** Online lobby: colours other players have cannot be picked (no swapping across devices). */
  exclusive?: boolean;
}

export function ColorPicker({ seat, name, token, color, holders, onPick, exclusive = false }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const label = colorName(color);

  const close = (refocus: boolean) => {
    setOpen(false);
    setAt(null);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  // Below the token, or above it when there is no room; always inside the window.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const pop = popRef.current;
    if (!trigger || !pop) return;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const below = trigger.bottom + 8;
    const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, trigger.top - 8 - h);
    const left = Math.min(Math.max(8, trigger.left - 6), window.innerWidth - w - 8);
    setAt({ left, top });
  }, [open]);

  // Once placed (and visible), the current colour has focus; arrow keys move between colours.
  useEffect(() => {
    if (open && at) popRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [open, at]);

  // A press outside, scrolling or resizing closes it.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const dismiss = (e: Event) => {
      if (!popRef.current?.contains(e.target as Node)) close(false);
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      close(true);
      return;
    }
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const buttons = [...(popRef.current?.querySelectorAll<HTMLButtonElement>('.swatch') ?? [])];
    const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(Math.max(0, from) + delta + buttons.length) % buttons.length];
    next?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={`color-${seat}`}
        className="color-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={T.setup.colorButton(name, label)}
        title={T.setup.colorTitle(name)}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <TokenChip token={token} color={color} size={30} />
        <span className="color-caret" aria-hidden="true">
          <ChevronDown />
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="color-pop"
            role="dialog"
            aria-label={T.setup.colorTitle(name)}
            data-seat={seat}
            style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: 'hidden' }}
            onKeyDown={onKey}
          >
            <p className="color-pop-title">{T.setup.colorTitle(name)}</p>
            <div className="swatches" role="radiogroup" aria-label={T.setup.colorTitle(name)}>
              {PLAYER_COLORS.map((c) => {
                const holder = c === color ? null : (holders[c] ?? null);
                const on = c === color;
                const blocked = exclusive && holder !== null;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={blocked || undefined}
                    className={`swatch ${on ? 'is-on' : ''} ${holder ? 'is-held' : ''} ${blocked ? 'is-blocked' : ''}`}
                    data-color={c}
                    tabIndex={on ? 0 : -1}
                    aria-label={blocked ? T.online.colorTaken(holder) : T.setup.colorOption(colorName(c), holder)}
                    title={blocked ? T.online.colorTaken(holder) : undefined}
                    onClick={() => {
                      if (blocked) return;
                      if (!on) onPick(c);
                      close(true);
                    }}
                  >
                    <span className="swatch-chip">
                      <TokenChip token={token} color={c} size={30} />
                      {on && (
                        <span className="swatch-check" aria-hidden="true">
                          <Check />
                        </span>
                      )}
                    </span>
                    <span className="swatch-name">{colorName(c)}</span>
                    <span className="swatch-holder">{holder ?? ''}</span>
                  </button>
                );
              })}
            </div>
            {!exclusive && <p className="color-pop-hint">{T.setup.colorSwap}</p>}
          </div>,
          document.querySelector('.app') ?? document.body,
        )}
    </>
  );
}

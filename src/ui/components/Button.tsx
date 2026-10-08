// Buttons. A refused button stays focusable (aria-disabled), states why in a tooltip and inline
// where it matters, and shakes once with the reason when pressed anyway (spec 13, Feedback).
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Action } from '../../engine';
import { usePending } from '../session/online';
import { dispatch, refuse, useApp } from '../store';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'chip';

export interface ButtonProps {
  id?: string;
  label: ReactNode;
  action?: Action;
  onClick?: () => void;
  reason?: string | null;
  variant?: ButtonVariant;
  icon?: ReactNode;
  className?: string;
  /** Show the refusal reason under the button. */
  showReason?: boolean;
  title?: string;
  keyHint?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export function useShake(id: string | undefined): boolean {
  const { refusal } = useApp();
  const [shaking, setShaking] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (!id || !refusal || refusal.target !== id || refusal.seq === last.current) return;
    last.current = refusal.seq;
    setShaking(true);
    const t = window.setTimeout(() => setShaking(false), 420);
    return () => window.clearTimeout(t);
  }, [id, refusal]);
  return shaking;
}

export function Button({
  id,
  label,
  action,
  onClick,
  reason = null,
  variant = 'secondary',
  icon,
  className,
  showReason = false,
  title,
  keyHint,
  autoFocus,
  ariaLabel,
}: ButtonProps) {
  const shaking = useShake(id);
  // Online: the server has not answered this button's action within 300 ms.
  const waiting = usePending(id);
  const disabled = reason !== null && reason !== undefined;
  const press = () => {
    if (disabled) {
      refuse(reason as string, id ?? null);
      return;
    }
    if (onClick) onClick();
    else if (action) dispatch(action, id ?? null);
  };
  return (
    <span className={`btn-wrap ${showReason && disabled ? 'has-reason' : ''}`}>
      <button
        id={id}
        type="button"
        className={`btn btn-${variant} ${shaking ? 'shake' : ''} ${className ?? ''}`}
        aria-disabled={disabled || undefined}
        title={disabled ? (reason as string) : title}
        onClick={press}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-keyshortcuts={keyHint}
        aria-busy={waiting || undefined}
      >
        {waiting ? <Loader2 className="spinner" size={18} aria-hidden="true" /> : icon}
        <span className="btn-label">{label}</span>
        {keyHint && <kbd className="key-hint" aria-hidden="true">{keyHint}</kbd>}
      </button>
      {showReason && disabled && <span className="btn-reason">{reason}</span>}
    </span>
  );
}

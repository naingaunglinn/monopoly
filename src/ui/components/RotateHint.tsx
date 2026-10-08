import { Smartphone } from 'lucide-react';
import { T } from '../strings';

/** Shown by CSS on portrait screens and under 1024px wide; the game stays usable below it. */
export function RotateHint() {
  return (
    <div className="rotate-hint" role="note">
      <Smartphone aria-hidden="true" size={18} />
      <span>
        <strong>{T.start.rotate}</strong> {T.start.rotateDetail}
      </span>
    </div>
  );
}

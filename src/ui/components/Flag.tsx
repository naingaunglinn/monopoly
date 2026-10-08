// Bundled SVG flags from the flag-icons package (never flag emoji). The build inlines them.
import br from 'flag-icons/flags/4x3/br.svg';
import ca from 'flag-icons/flags/4x3/ca.svg';
import cn from 'flag-icons/flags/4x3/cn.svg';
import de from 'flag-icons/flags/4x3/de.svg';
import eg from 'flag-icons/flags/4x3/eg.svg';
import es from 'flag-icons/flags/4x3/es.svg';
import fr from 'flag-icons/flags/4x3/fr.svg';
import gb from 'flag-icons/flags/4x3/gb.svg';
import il from 'flag-icons/flags/4x3/il.svg';
import it from 'flag-icons/flags/4x3/it.svg';
import jp from 'flag-icons/flags/4x3/jp.svg';
import kr from 'flag-icons/flags/4x3/kr.svg';
import mm from 'flag-icons/flags/4x3/mm.svg';
import mx from 'flag-icons/flags/4x3/mx.svg';
import nl from 'flag-icons/flags/4x3/nl.svg';
import us from 'flag-icons/flags/4x3/us.svg';
import type { FlagCode } from '../../data/countries';

const FLAGS: Record<FlagCode, string> = { br, ca, cn, de, eg, es, fr, gb, il, it, jp, kr, mm, mx, nl, us };

/** Without `width`, CSS sizes the flag (4:3). */
export function Flag({ code, width, className }: { code: FlagCode; width?: number; className?: string }) {
  return (
    <img
      className={`flag ${className ?? ''}`}
      src={FLAGS[code]}
      width={width}
      height={width ? Math.round((width * 3) / 4) : undefined}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="sync"
    />
  );
}

export function flagUrls(): string[] {
  return Object.values(FLAGS);
}

// Automated layout audit run on every screenshot (spec section 15): text under 10px, page scroll,
// clipped text, missing owner markers and overlapping HUD parts. A person still looks at every image.
import type { Page } from '@playwright/test';

export async function auditLayout(page: Page, opts: { allowVerticalScroll?: boolean; phone?: boolean } = {}): Promise<string[]> {
  return page.evaluate(([allowVerticalScroll, phone]) => {
    const problems: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim();
      const el = walker.currentNode.parentElement;
      if (!text || !el || el.closest('.sr-only') || !visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 10) problems.push(`text below 10px (${size}px): "${text.slice(0, 40)}"`);
      // Phones: board text is scaled with the board. While following a token it must still show at
      // 10px or more; the whole-board overview (double-tap) is the one exception.
      const canvas = el.closest<HTMLElement>('.board-canvas');
      if (phone && canvas && canvas.closest<HTMLElement>('.board-viewport')?.dataset.mode === 'follow') {
        const shown = size * Number(canvas.dataset.scale ?? 1);
        if (shown < 9.95) problems.push(`board text shows at ${shown.toFixed(1)}px: "${text.slice(0, 40)}"`);
      }
    }
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) problems.push(`page scrolls sideways (${doc.scrollWidth}px > ${window.innerWidth}px)`);
    if (!allowVerticalScroll && doc.scrollHeight > window.innerHeight + 1) {
      problems.push(`page scrolls down (${doc.scrollHeight}px > ${window.innerHeight}px)`);
    }
    // Phones: the primary button is always fully on screen.
    if (phone) {
      const primary = document.querySelector('#primary');
      if (primary && visible(primary)) {
        const r = primary.getBoundingClientRect();
        if (r.left < 0 || r.top < 0 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5) {
          problems.push('the primary button is not fully on screen');
        }
      }
    }
    // Popovers (the menu) stay on screen: when there is not room for all of them, they scroll inside.
    for (const pop of document.querySelectorAll('.menu')) {
      if (!visible(pop)) continue;
      const r = pop.getBoundingClientRect();
      if (r.bottom > window.innerHeight + 0.5 || r.right > window.innerWidth + 0.5 || r.left < -0.5) {
        problems.push(`the menu runs off screen (bottom ${Math.round(r.bottom)}px of ${window.innerHeight}px)`);
      }
    }
    // Containers that must show everything without inner scrolling (on phones they may scroll).
    for (const sel of phone ? [] : ['.players-col', '.setup-card']) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && visible(el) && el.scrollHeight > el.clientHeight + 2) {
        problems.push(`${sel} needs scrolling (${el.scrollHeight}px > ${el.clientHeight}px)`);
      }
    }
    const clipSelectors = [
      '.tile-name',
      '.tile-value',
      '.btn-label',
      '.panel-title',
      '.pc-name',
      '.pc-cash',
      '.deed-name',
      '.sheet-title',
      '.tb-player-name',
      '.winner-title',
      '.pass-name',
      '.color-pop-title',
      '.swatch-name',
    ];
    for (const el of document.querySelectorAll<HTMLElement>(clipSelectors.join(','))) {
      if (!visible(el)) continue;
      // Any horizontal overflow shows as an ellipsis or a cut letter, so the width check is strict.
      if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 2) {
        problems.push(`clipped text in .${el.className.split(' ')[0]}: "${el.textContent?.trim().slice(0, 40)}"`);
      }
    }
    // Popovers stay inside the window.
    for (const el of document.querySelectorAll('.color-pop')) {
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) {
        problems.push('the colour palette leaves the window');
      }
    }
    const state = (window as unknown as { __GM__?: { getState: () => any } }).__GM__?.getState();
    if (state && document.querySelector('.game-screen')) {
      state.properties.forEach((ps: { owner: number | null } | null, i: number) => {
        if (!ps || ps.owner === null) return;
        const tile = document.querySelector(`.board .tile[data-space="${i}"]`);
        if (tile && !tile.querySelector('.owner-marker')) problems.push(`owned space ${i} has no owner marker`);
      });
      const covered = document.querySelector('.panel-layer, .sheet-backdrop, .pass-device, .modal-backdrop');
      if (!covered && !phone) {
        // An expanded log or chat (compact screens) floats over the stage on purpose (D88).
        const parts = ['.deed', '.dice-panel', '.log:not(.is-expanded)', '.primary-slot', '.secondary-actions', '.players-col']
          .map((sel) => ({ sel, el: document.querySelector(sel) }))
          .filter((p): p is { sel: string; el: Element } => !!p.el && visible(p.el));
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = (parts[i] as { el: Element }).el.getBoundingClientRect();
            const b = (parts[j] as { el: Element }).el.getBoundingClientRect();
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 2 && h > 2) problems.push(`${parts[i]?.sel} overlaps ${parts[j]?.sel}`);
          }
        }
      }
    }
    return problems;
  }, [opts.allowVerticalScroll ?? false, opts.phone ?? false] as const);
}

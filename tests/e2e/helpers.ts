// Drives the real UI with clicks only. The game state is read (never written) through the
// read-only window.__GM__ hook to decide which button a player would press.
import { expect, type Page } from '@playwright/test';

export interface ErrorLog {
  errors: string[];
}

export function trackErrors(page: Page): ErrorLog {
  const log: ErrorLog = { errors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') log.errors.push(msg.text());
  });
  page.on('pageerror', (err) => log.errors.push(String(err)));
  return log;
}

export interface StartOptions {
  query?: string;
  players?: number;
  speed?: 'Normal' | 'Fast' | 'Off';
  passDevice?: boolean;
}

/** Start screen → New game → setup → Start game. */
export async function startGame(page: Page, opts: StartOptions = {}): Promise<void> {
  const query = opts.query ?? '?seed=42&rounds=5';
  await page.goto(`/${query}`);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#start-new').click();
  await expect(page.locator('.setup-card')).toBeVisible();
  if (opts.players && opts.players !== 2) {
    await page.getByRole('radiogroup', { name: 'Players' }).getByRole('radio', { name: String(opts.players), exact: true }).check();
  }
  if (opts.speed) {
    await page.getByRole('radiogroup', { name: 'Animation speed' }).getByRole('radio', { name: opts.speed, exact: true }).check();
  }
  if (opts.passDevice === false) await page.locator('label[for="opt-pass"]').click();
  await page.locator('#setup-start').click();
  await expect(page.locator('.game-screen')).toBeVisible();
}

export async function gameState(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__GM__.getState());
}

async function visible(page: Page, selector: string): Promise<boolean> {
  return (await page.locator(selector).count()) > 0 && (await page.locator(selector).first().isVisible());
}

async function enabled(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return false;
  return (await el.getAttribute('aria-disabled')) !== 'true';
}

/** One player decision, made by clicking the button a person would use. Returns false when done. */
export async function playStep(page: Page): Promise<boolean> {
  if (await visible(page, '[data-panel="winner"]')) return false;
  // Let any playing animation finish (a click skips it).
  if (await visible(page, '.game-screen.is-animating')) {
    await page.locator('.board').click({ position: { x: 5, y: 5 }, force: true });
    return true;
  }
  if (await visible(page, '[data-sheet="confirm"]')) {
    await page.locator('#confirm-yes').click();
    return true;
  }
  if (await visible(page, '[data-sheet="pass"]')) {
    await page.locator('#pass-ready').click();
    return true;
  }
  const s = await gameState(page);
  if (s.flow.phase === 'Auction' && s.flow.notices.length === 0) {
    await page.locator('#bid-fold').click();
    return true;
  }
  if (s.flow.phase === 'BuyDecision' && s.flow.notices.length === 0 && !(await enabled(page, '#primary'))) {
    await page.locator('#buy-pass').click();
    return true;
  }
  if (s.flow.phase === 'Debt' && s.flow.notices.length === 0 && !(await enabled(page, '#primary'))) {
    await page.locator('#debt-manage').click();
    const raise = page.locator('[id^="sell-"]:not([aria-disabled="true"]), [id^="mortgage-"]:not([aria-disabled="true"])');
    if ((await raise.count()) > 0) {
      await raise.first().click();
      await page.keyboard.press('Escape');
    } else {
      await page.keyboard.press('Escape');
      await page.locator('#debt-bankrupt').click();
    }
    return true;
  }
  await page.locator('#primary').click();
  return true;
}

export async function playToWinner(page: Page, maxSteps = 4000): Promise<number> {
  for (let i = 0; i < maxSteps; i++) {
    if (!(await playStep(page))) return i;
  }
  throw new Error('the game did not finish');
}

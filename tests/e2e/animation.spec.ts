// Animation and robustness runs (spec section 15): a key press skips an animation without acting,
// the Normal pace (D51), full games at Normal and Fast speed, with reduced motion and its Show
// movement anyway switch (D52), with the network disabled after load, and at 1024 × 768. Any
// console error fails a run.
import { expect, test, type Page } from '@playwright/test';
import { gameState, playToWinner, startGame, trackErrors } from './helpers';

/** The CSS animation on the hopping token (read in one go: the hop element is new every space). */
async function hopAnimation(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('.token-hop.is-hopping, .token-hop.is-landing');
    return el ? getComputedStyle(el).animationName : null;
  });
}

test('a key press during an animation finishes it at once and does nothing else', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', speed: 'Normal' });
  await page.locator('#pass-ready').click();
  await page.locator('#primary').click(); // Roll dice
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(1);
  const rolled = await gameState(page);
  await page.keyboard.press('Space');
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(0);
  // The key only finished the animation: the game did not move on.
  expect(await gameState(page)).toEqual(rolled);
  // A click also finishes one, without pressing the button underneath.
  await page.locator('#primary').click(); // the next step (buy, pay, OK or end turn)
  const next = await gameState(page);
  if (await page.locator('.game-screen.is-animating').count()) {
    await page.locator('#primary').click();
    expect(await gameState(page)).toEqual(next);
  }
  expect(log.errors).toEqual([]);
});

test('Normal speed: a roll plays long enough to follow, hop by hop, and the button offers Skip', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', speed: 'Normal' });
  await page.locator('#pass-ready').click();
  await page.locator('#primary').click(); // Roll dice
  await expect(page.locator('#primary')).toHaveText('Skip');
  // The token hops from space to space.
  await expect.poll(() => hopAnimation(page)).toMatch(/^hop/);
  // A second after the roll it is still playing (dice 1.1 s, then the move and the landing).
  await page.waitForTimeout(1000);
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(1);
  // It ends by itself; then the button shows the next step.
  await page.locator('.game-screen.is-animating').waitFor({ state: 'detached', timeout: 10_000 });
  await expect(page.locator('#primary')).not.toHaveText('Skip');
  expect(log.errors).toEqual([]);
});

test('reduced motion: Show movement anyway brings the movement back and is remembered', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const log = trackErrors(page);
  await page.goto('/?seed=11&rounds=5');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#start-new').click();
  await expect(page.locator('#opt-motion')).not.toBeChecked();
  await page.locator('label[for="opt-motion"]').click();
  await expect(page.locator('#opt-motion')).toBeChecked();
  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'full');
  await page.locator('#setup-start').click();
  await page.locator('#pass-ready').click();
  await page.locator('#primary').click(); // Roll dice
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(1);
  // The CSS keeps the animation too (not cut by the reduced-motion rules).
  await expect.poll(() => hopAnimation(page)).toMatch(/^hop/);
  await page.keyboard.press('Space');
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(0);
  // The menu has the same switch; the choice is kept on this device.
  await page.locator('#tb-menu').click();
  await expect(page.locator('#set-motion')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('#start-new').click();
  await expect(page.locator('#opt-motion')).toBeChecked();
  expect(log.errors).toEqual([]);
});

test('a full game at Normal speed, letting every animation play', async ({ page }) => {
  test.setTimeout(600_000);
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=3', speed: 'Normal' });
  await playToWinner(page, { waitForAnimations: true });
  expect((await gameState(page)).flow.phase).toBe('GameOver');
  expect(log.errors).toEqual([]);
});

test('a full game at Fast speed', async ({ page }) => {
  test.setTimeout(600_000);
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=7&rounds=5', speed: 'Fast' });
  await playToWinner(page, { waitForAnimations: true });
  expect((await gameState(page)).flow.phase).toBe('GameOver');
  expect(log.errors).toEqual([]);
});

test('a full game with reduced motion (animations off, panels still appear)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=11&rounds=5', speed: 'Normal' });
  await page.locator('#pass-ready').click();
  await page.locator('#primary').click();
  // Nothing animates, so the board is never busy.
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(0);
  await playToWinner(page);
  expect((await gameState(page)).flow.phase).toBe('GameOver');
  expect(log.errors).toEqual([]);
});

test('a full game with the network disabled after load', async ({ page, context }) => {
  const log = trackErrors(page);
  // One-device play never calls the online API (no stored room: not even the rejoin check).
  const apiCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) apiCalls.push(r.url());
  });
  await page.goto('/?seed=5&rounds=5');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  // From here on there is no network at all; the game must not need it.
  await context.setOffline(true);
  await page.locator('#start-new').click();
  await page.getByRole('radiogroup', { name: 'Animation speed' }).getByRole('radio', { name: 'Off', exact: true }).check();
  await page.locator('#setup-start').click();
  await expect(page.locator('.game-screen')).toBeVisible();
  expect(await page.evaluate(() => document.fonts.check('16px Barlow') && document.fonts.check('16px "Barlow Condensed"'))).toBe(true);
  await playToWinner(page);
  await page.locator('#winner-results').click();
  await expect(page.locator('.results-table')).toBeVisible();
  // Flags are inlined: every flag image on the board has loaded.
  expect(
    await page.evaluate(() => [...document.querySelectorAll('img.flag')].every((img) => (img as HTMLImageElement).naturalWidth > 0)),
  ).toBe(true);
  expect(apiCalls).toEqual([]);
  expect(log.errors).toEqual([]);
});

test.describe('1024 x 768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });
  test('a full game is playable by clicking (no control covered)', async ({ page }) => {
    const log = trackErrors(page);
    await startGame(page, { query: '?seed=9&rounds=5', players: 3, speed: 'Off' });
    await playToWinner(page);
    await page.locator('#winner-results').click();
    await expect(page.locator('.results-table tbody tr')).toHaveCount(3);
    expect(log.errors).toEqual([]);
  });
});

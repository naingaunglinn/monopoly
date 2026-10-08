// Save and resume (spec sections 9 and 15): reload and Continue in the middle of a decision gives
// the identical state and the same panel; a corrupt or older save shows a clear message.
import { expect, test, type Page } from '@playwright/test';
import { gameState, startGame, trackErrors } from './helpers';

const SAVE_KEY = 'global-monopoly/save/v1';

/** Plays until someone lands on an unowned property, then passes it into an auction and bids. */
async function reachLiveAuction(page: Page): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const s = await gameState(page);
    if (s.flow.phase === 'BuyDecision' && s.flow.notices.length === 0) {
      await page.locator('#buy-pass').click();
      await page.locator('#bid-0').click(); // the first bidder raises by $10
      return;
    }
    if (await page.locator('[data-sheet="pass"]').count()) await page.locator('#pass-ready').click();
    else if (s.flow.phase === 'Auction') await page.locator('#bid-fold').click();
    else await page.locator('#primary').click();
  }
  throw new Error('never reached a property');
}

test('reload and Continue in the middle of an auction restore the identical state', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', players: 3, speed: 'Off' });
  await reachLiveAuction(page);
  const before = await gameState(page);
  expect(before.flow.phase).toBe('Auction');
  expect(before.flow.pending.auction.highBid).toBeGreaterThan(0);

  // Autosave after every action: reload without saving by hand.
  await page.reload();
  await expect(page.locator('#start-continue')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('#start-continue').click();
  expect(await gameState(page)).toEqual(before);
  await expect(page.locator('[data-panel="auction"]')).toBeVisible();
  await expect(page.locator('[data-panel="auction"]')).toContainText(`$${before.flow.pending.auction.highBid}`);

  // The in-game Save confirms with a toast, and the saved text is exactly the game state.
  await page.locator('#tb-menu').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Game saved');
  const saved = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  expect(JSON.parse(saved as string)).toEqual(before);

  // Play continues from exactly there.
  await page.locator('#bid-fold').click();
  expect((await gameState(page)).flow.pending?.auction?.active.length ?? 0).toBeLessThan(before.flow.pending.auction.active.length);
  expect(log.errors).toEqual([]);
});

test('a corrupt or older save shows a clear message and offers a new game', async ({ page }) => {
  const log = trackErrors(page);
  for (const [text, message] of [
    ['{"broken', 'damaged'],
    [JSON.stringify({ meta: { schemaVersion: 0 } }), 'older version'],
  ] as const) {
    await page.goto('/');
    await page.evaluate(([key, value]) => window.localStorage.setItem(key as string, value as string), [SAVE_KEY, text]);
    await page.reload();
    await page.locator('#start-continue').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(message);
    await dialog.getByRole('button', { name: 'Start a new game' }).click();
    await expect(page.locator('.setup-card')).toBeVisible();
  }
  expect(log.errors).toEqual([]);
});

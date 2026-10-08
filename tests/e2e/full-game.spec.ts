// A seeded Quick game (round limit 5, animation Off) played through the real UI, from the start
// screen to the results screen. Any console error fails the run.
import { expect, test } from '@playwright/test';
import { gameState, playToWinner, startGame, trackErrors } from './helpers';

test('a full Quick game can be played by clicking, from setup to the results', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', speed: 'Off' });
  const steps = await playToWinner(page);
  expect(steps).toBeGreaterThan(10);

  const s = await gameState(page);
  expect(s.flow.phase).toBe('GameOver');
  expect(s.meta.winner.length).toBeGreaterThan(0);
  await expect(page.locator('[data-panel="winner"]')).toBeVisible();
  await expect(page.locator('#winner-title')).toContainText(/wins|Shared win/);

  await page.locator('#winner-results').click();
  await expect(page.locator('[data-sheet="results"]')).toBeVisible();
  await expect(page.locator('.results-table tbody tr')).toHaveCount(2);
  expect(log.errors).toEqual([]);
});

test('a 4-player Quick game reaches the winner with the pass-device screen on', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=7&rounds=8', players: 4, speed: 'Off' });
  const steps = await playToWinner(page);
  const s = await gameState(page);
  expect(s.flow.phase).toBe('GameOver');
  expect(['roundLimit', 'bankruptcy']).toContain(s.meta.endReason);
  expect(steps).toBeGreaterThan(40);
  await page.locator('#winner-results').click();
  await expect(page.locator('.results-table tbody tr')).toHaveCount(4);
  expect(log.errors).toEqual([]);
});

// The interactive flows a person uses beyond the primary button: trading (accept and reject),
// building, Free Stay, paying out of Jail, mortgaging and selling, the debug panel and the keyboard.
import { expect, test } from '@playwright/test';
import { base, level, loadState, own, panelStates } from './fixtures';
import { gameState, startGame, trackErrors } from './helpers';

const EGYPT = [12, 14];

test('trade: T opens it, the offer is handed over, accepted with confirmation and applied', async ({ page }) => {
  const log = trackErrors(page);
  await loadState(page, own(own(base({ playerCount: 2 }), [12], 0), [14], 1));
  await page.keyboard.press('t');
  const sheet = page.locator('[data-sheet="trade"]');
  await expect(sheet).toBeVisible();
  await sheet.locator('input[data-space="12"]').check(); // You give: Cairo
  await page.locator('#get-cash').fill('150'); // You get: $150
  await page.locator('#trade-send').click();
  await expect(page.locator('[data-sheet="trade-handover"]')).toContainText('Hand the device to Leo');
  await page.locator('#handover-ready').click();
  await expect(page.locator('[data-sheet="trade-offer"]')).toContainText('Cairo');
  await page.locator('#trade-accept').click();
  await expect(page.locator('[data-sheet="confirm"]')).toContainText('Accept this trade?');
  await page.locator('#confirm-yes').click();
  const s = await gameState(page);
  expect(s.properties[12].owner).toBe(1);
  expect(s.players.map((p: { cash: number }) => p.cash)).toEqual([4150, 3850]);
  expect(s.flow.trade).toBeNull();
  await expect(page.locator('[data-sheet="trade-offer"]')).toHaveCount(0);
  expect(log.errors).toEqual([]);
});

test('trade: a rejected offer changes nothing', async ({ page }) => {
  const log = trackErrors(page);
  const start = own(own(base({ playerCount: 2 }), [12], 0), [14], 1);
  await loadState(page, start);
  await page.locator('#act-trade').click();
  await page.locator('[data-sheet="trade"] input[data-space="12"]').check();
  await page.locator('[data-sheet="trade"] input[data-space="14"]').check();
  await page.locator('#trade-send').click();
  await page.locator('#handover-ready').click();
  await page.locator('#trade-reject').click();
  const s = await gameState(page);
  expect(s.players).toEqual(start.players);
  expect(s.properties).toEqual(start.properties);
  expect(s.flow.trade).toBeNull();
  expect(log.errors).toEqual([]);
});

test('build: Build house spends the house cost; Done continues the turn', async ({ page }) => {
  const log = trackErrors(page);
  await loadState(page, panelStates().build as never);
  const before = await gameState(page);
  await page.locator('#build-btn').click();
  let s = await gameState(page);
  expect(s.properties[12].level).toBe(1);
  expect(s.players[0].cash).toBe(before.players[0].cash - 50);
  await expect(page.locator('.tile[data-space="12"] .pip-house')).toHaveCount(1);
  await page.locator('#primary').click(); // Done
  s = await gameState(page);
  expect(s.flow.phase).toBe('AwaitEndTurn');
  expect(log.errors).toEqual([]);
});

test('rent: Use Free Stay skips the rent and spends a token', async ({ page }) => {
  const log = trackErrors(page);
  await loadState(page, panelStates().rent as never);
  await page.locator('#use-free-stay').click();
  const s = await gameState(page);
  expect(s.players[0]).toMatchObject({ cash: 4000, freeStay: 2 });
  expect(s.flow.phase).toBe('AwaitEndTurn');
  expect(log.errors).toEqual([]);
});

test('Jail: Pay $300 leaves Jail and the player rolls', async ({ page }) => {
  const log = trackErrors(page);
  await loadState(page, panelStates().jail as never);
  await page.locator('#jail-pay').click();
  const s = await gameState(page);
  expect(s.players[0]).toMatchObject({ cash: 3700, inJail: false });
  expect(s.flow.phase).toBe('AwaitRoll');
  await expect(page.locator('#primary')).toContainText('Roll dice');
  expect(log.errors).toEqual([]);
});

test('property list: mortgage, unmortgage and sell from My properties', async ({ page }) => {
  const log = trackErrors(page);
  await loadState(page, level(own(own(base({ playerCount: 2 }), [9], 0), EGYPT, 0), [[12, 1], [14, 1]]));
  await page.locator('#act-props').click();
  const sheet = page.locator('[data-sheet="properties"]');
  await expect(sheet).toBeVisible();
  await page.locator('#mortgage-9').click();
  let s = await gameState(page);
  expect(s.properties[9].mortgaged).toBe(true);
  expect(s.players[0].cash).toBe(4055);
  await page.locator('#unmortgage-9').click();
  s = await gameState(page);
  expect(s.properties[9].mortgaged).toBe(false);
  expect(s.players[0].cash).toBe(4055 - 61);
  // Egypt has houses: mortgaging Cairo is refused with a reason; selling works.
  // A refused button stays pressable (aria-disabled); pressing it shows the reason.
  await expect(page.locator('#mortgage-12')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('#mortgage-12').click({ force: true });
  await expect(page.locator('.refusal')).toContainText('Sell the buildings in Egypt first.');
  await page.locator('#sell-12').click();
  s = await gameState(page);
  expect(s.properties[12].level).toBe(0);
  expect(s.players[0].cash).toBe(4055 - 61 + 25);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(log.errors).toEqual([]);
});

test('debug panel (?debug=1): set the next dice, then roll them', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=3&debug=1', speed: 'Off', passDevice: false });
  await page.locator('.debug-toggle').click();
  await page.getByLabel('First die').fill('3');
  await page.getByLabel('Second die').fill('4');
  await page.locator('.debug-row').first().getByRole('button', { name: 'Set' }).click();
  await page.locator('#primary').click(); // Roll dice
  const s = await gameState(page);
  expect(s.turn.dice).toEqual([3, 4]);
  expect(s.players[0].position).toBe(7);
  expect(log.errors).toEqual([]);
});

test('debug panel is hidden without ?debug=1', async ({ page }) => {
  await startGame(page, { query: '?seed=3', speed: 'Off', passDevice: false });
  await expect(page.locator('.debug-panel')).toHaveCount(0);
});

test('keyboard: Space presses the yellow button, B buys, P passes, T trades, R opens the guide, Esc closes', async ({
  page,
}) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', speed: 'Off' });
  await page.keyboard.press('Space'); // I'm ready (focused on the pass-device screen)
  expect((await gameState(page)).flow.phase).toBe('AwaitRoll');
  await page.locator('body').click({ position: { x: 640, y: 20 } }); // focus nothing in particular
  await page.keyboard.press('Space'); // Roll dice
  expect((await gameState(page)).turn.dice).not.toBeNull();
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog', { name: 'Rule guide' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Rule guide' })).toHaveCount(0);

  await loadState(page, panelStates().buy as never);
  await page.keyboard.press('p');
  expect((await gameState(page)).flow.phase).toBe('Auction');
  await loadState(page, panelStates().buy as never);
  await page.keyboard.press('b');
  const bought = await gameState(page);
  expect(bought.properties[9].owner).toBe(0);
  await page.keyboard.press('t');
  await expect(page.locator('[data-sheet="trade"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-sheet="trade"]')).toHaveCount(0);

  // Menu > New game asks for confirmation; Cancel keeps the game.
  await page.locator('#tb-menu').click();
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('[data-sheet="confirm"]')).toContainText('Start a new game?');
  await page.locator('#confirm-cancel').click();
  expect((await gameState(page)).properties[9].owner).toBe(0);
  expect(log.errors).toEqual([]);
});

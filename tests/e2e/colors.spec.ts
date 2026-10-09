// Player colours (D53) and owned tiles in the owner's colour (D54): picking a colour at setup,
// swapping with another player, the keyboard, and tiles that take the owner's tint when bought.
import { expect, test, type Page } from '@playwright/test';
import { PLAYER_COLORS } from '../../src/data/players';
import { createGame } from '../../src/engine';
import { MORTGAGED_TINT, OWNED_TINT, tint } from '../../src/ui/contrast';
import { act, CHANCE, loadState, own, rollTo, sp } from './fixtures';
import { gameState, trackErrors } from './helpers';

const [RED, BLUE, GREEN, , PURPLE, , PINK, BROWN] = PLAYER_COLORS as string[];

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** The owner tint behind a tile's text, or null when the tile has none. */
async function tileTint(page: Page, space: number): Promise<string | null> {
  return page.locator(`.board .tile[data-space="${space}"]`).evaluate((el) => {
    const before = getComputedStyle(el, '::before');
    return before.content === 'none' ? null : before.backgroundColor;
  });
}

test('setup: pick a colour from the token, swap with another player, keyboard too; the game uses them', async ({ page }) => {
  const log = trackErrors(page);
  await page.goto('/?seed=42&rounds=5');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#start-new').click();

  // Player 1 opens the palette from their token and picks Purple.
  await page.locator('#color-0').click();
  const pop = page.locator('.color-pop');
  await expect(pop).toBeVisible();
  await expect(pop.getByRole('radio', { name: 'Red', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(pop.getByRole('radio', { name: 'Blue, now Player 2’s' })).toBeVisible();
  await expect(pop.locator('.swatch')).toHaveCount(PLAYER_COLORS.length);
  await pop.getByRole('radio', { name: 'Purple', exact: true }).click();
  await expect(pop).toHaveCount(0);
  await expect(page.locator('#color-0')).toHaveAttribute('aria-label', 'Player 1: Purple. Choose a colour');

  // Player 2 takes Purple: the two players swap colours.
  await page.locator('#color-1').click();
  await page.locator('.color-pop').getByRole('radio', { name: 'Purple, now Player 1’s' }).click();
  await expect(page.locator('#color-0')).toHaveAttribute('aria-label', 'Player 1: Blue. Choose a colour');
  await expect(page.locator('#color-1')).toHaveAttribute('aria-label', 'Player 2: Purple. Choose a colour');

  // Keyboard: Enter opens it on the current colour, arrows move, Enter picks, Escape closes.
  await page.locator('#color-0').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.color-pop [aria-checked="true"]')).toBeFocused();
  await page.keyboard.press('ArrowRight'); // Blue -> Green
  await page.keyboard.press('Enter');
  await expect(page.locator('#color-0')).toHaveAttribute('aria-label', 'Player 1: Green. Choose a colour');
  await expect(page.locator('#color-0')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.color-pop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.color-pop')).toHaveCount(0);
  await expect(page.locator('#color-0')).toBeFocused();

  // A press outside closes it without a change.
  await page.locator('#color-1').click();
  await page.locator('.setup-title').click();
  await expect(page.locator('.color-pop')).toHaveCount(0);

  await page.locator('#setup-start').click();
  await expect(page.locator('.game-screen')).toBeVisible();
  const s = await gameState(page);
  expect(s.players.map((p: { color: string }) => p.color)).toEqual([GREEN, PURPLE]);
  expect(s.meta.settings.playerColors).toHaveLength(6);
  expect(new Set(s.meta.settings.playerColors).size).toBe(6);
  // The token on the board wears the chosen colour.
  await expect(page.locator('.token[data-player="0"] .token-chip')).toHaveCSS('color', rgb(GREEN as string));
  expect(log.errors).toEqual([]);
});

test('setup: six players can still pick, and the palette stays inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const log = trackErrors(page);
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#start-new').click();
  await page.getByRole('radiogroup', { name: 'Players' }).getByRole('radio', { name: '6', exact: true }).check();
  await page.locator('#color-5').click();
  const box = await page.locator('.color-pop').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  // Pink and Brown are free with six players; Red is Player 1's.
  await expect(page.locator('.color-pop').getByRole('radio', { name: 'Red, now Player 1’s' })).toBeVisible();
  await page.locator('.color-pop').getByRole('radio', { name: 'Brown', exact: true }).click();
  await expect(page.locator('#color-5')).toHaveAttribute('aria-label', 'Player 6: Brown. Choose a colour');
  // The setup still fits one screen.
  const card = page.locator('.setup-card');
  expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 2)).toBe(true);
  expect(log.errors).toEqual([]);
});

test('owned tiles take the owner colour, mortgaged ones paler; white tiles are for sale; buying tints a tile', async ({ page }) => {
  const log = trackErrors(page);
  let s = createGame(
    { playerCount: 2, passDevice: false, animationSpeed: 'off', playerNames: ['Mia', 'Leo'], playerColors: [PINK as string, BROWN as string] },
    7,
  );
  const [cairo, alexandria, egyptAirport, forSale] = [sp('Cairo'), sp('Alexandria'), sp('Egypt Airport'), sp('Guadalajara')];
  s = own(s, [cairo, alexandria, egyptAirport], 1); // Leo
  s = act(s, { type: 'debug', op: 'setMortgaged', space: egyptAirport, mortgaged: true });
  s = rollTo(s, forSale); // Mia lands on Guadalajara, which is for sale
  await loadState(page, s);

  expect(await tileTint(page, cairo)).toBe(rgb(tint(BROWN as string, OWNED_TINT)));
  expect(await tileTint(page, alexandria)).toBe(rgb(tint(BROWN as string, OWNED_TINT)));
  expect(await tileTint(page, egyptAirport)).toBe(rgb(tint(BROWN as string, MORTGAGED_TINT)));
  // Unowned properties and special spaces stay white.
  expect(await tileTint(page, forSale)).toBeNull();
  expect(await tileTint(page, CHANCE)).toBeNull();
  await expect(page.locator(`.board .tile[data-space="${forSale}"]`)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator(`.board .tile[data-space="${forSale}"]`)).toHaveAttribute('aria-label', /For sale/);
  // The owner marker stays: ownership is never colour alone.
  await expect(page.locator(`.board .tile[data-space="${cairo}"] .owner-marker`)).toHaveCount(1);

  await page.locator('#primary').click(); // Buy
  expect((await gameState(page)).properties[forSale].owner).toBe(0);
  expect(await tileTint(page, forSale)).toBe(rgb(tint(PINK as string, OWNED_TINT)));
  await expect(page.locator(`.board .tile[data-space="${forSale}"]`)).toHaveAttribute('aria-label', /Owned by Mia/);
  expect(log.errors).toEqual([]);
});

test('without a choice, players have the seat colours, on tiles too', async ({ page }) => {
  const log = trackErrors(page);
  await loadState(page, own(createGame({ playerCount: 2, passDevice: false, animationSpeed: 'off' }, 3), [6], 0));
  expect(await tileTint(page, 6)).toBe(rgb(tint(RED as string, OWNED_TINT)));
  expect((await gameState(page)).players[1].color).toBe(BLUE);
  expect(log.errors).toEqual([]);
});

// Phones (spec section 17): a full local game by taps in portrait, the board's gestures (one-finger
// pan, two-finger pinch with real touch events, double-tap for the whole board and back), tapping a
// tile for its Focus Card, and the primary button always on screen at 360x800, 390x844 and 844x390.
import { expect, test, type Page } from '@playwright/test';
import { gameState, playToWinner, startGame, trackErrors } from './helpers';

const SIZES = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 844, height: 390 },
];

const camera = (page: Page) =>
  page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.board-viewport');
    const canvas = document.querySelector<HTMLElement>('.board-canvas');
    return { mode: viewport?.dataset.mode ?? '', scale: Number(canvas?.dataset.scale ?? 0), transform: canvas?.style.transform ?? '' };
  });

/** Real touch input through the DevTools protocol (Playwright's touchscreen only taps). */
async function touch(page: Page, points: Array<Array<{ x: number; y: number }>>): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: (first ?? []).map((p, id) => ({ ...p, id })) });
  for (const step of rest) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: step.map((p, id) => ({ ...p, id })) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('phone 390 x 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('a full Quick game by taps, with the pass-device screen on', async ({ page }) => {
    test.setTimeout(600_000);
    const log = trackErrors(page);
    await startGame(page, { query: '?seed=21&rounds=3', players: 3, speed: 'Off' });
    await expect(page.locator('.game-screen.is-phone')).toBeVisible();
    await playToWinner(page);
    expect((await gameState(page)).flow.phase).toBe('GameOver');
    await page.locator('#winner-results').click();
    await expect(page.locator('.results-table tbody tr')).toHaveCount(3);
    expect(log.errors).toEqual([]);
  });

  test('gestures: pan, pinch, double-tap for the whole board and back; a tap shows the tile', async ({ page }) => {
    const log = trackErrors(page);
    await startGame(page, { query: '?seed=4&rounds=5', speed: 'Off', passDevice: false });
    const start = await camera(page);
    expect(start.mode).toBe('follow');
    expect(start.scale).toBeGreaterThanOrEqual(0.92);
    const box = (await page.locator('.board-viewport').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // One finger pans: the camera leaves follow mode and moves.
    await touch(page, [[{ x: cx, y: cy }], [{ x: cx - 60, y: cy - 20 }], [{ x: cx - 140, y: cy - 40 }]]);
    const panned = await camera(page);
    expect(panned.mode).toBe('free');
    expect(panned.transform).not.toBe(start.transform);

    // Two fingers pinch: zoom in.
    await touch(page, [
      [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }],
      [{ x: cx - 60, y: cy }, { x: cx + 60, y: cy }],
      [{ x: cx - 100, y: cy }, { x: cx + 100, y: cy }],
    ]);
    const pinched = await camera(page);
    expect(pinched.scale).toBeGreaterThan(panned.scale * 1.3);

    // Double-tap: the whole board; again: back to following the token.
    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy);
    await expect.poll(async () => (await camera(page)).mode).toBe('fit');
    expect((await camera(page)).scale).toBeLessThan(0.5);
    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy);
    await expect.poll(async () => (await camera(page)).mode).toBe('follow');

    // A tap on a tile shows its Focus Card in the sheet (World Start is near the token).
    await page.locator('#tab-log').click();
    const tile = page.locator('.board .tile[data-space="2"]');
    const t = (await tile.boundingBox())!;
    await page.touchscreen.tap(t.x + t.width / 2, t.y + t.height / 2);
    await expect(page.locator('#tab-card')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.phone-card')).toContainText('Chance');

    // After panning away, a roll brings the camera back to the moving token.
    await touch(page, [[{ x: cx, y: cy }], [{ x: cx + 120, y: cy + 60 }]]);
    expect((await camera(page)).mode).toBe('free');
    await page.locator('#primary').click(); // Roll dice
    await expect.poll(async () => (await camera(page)).mode).toBe('follow');
    expect(log.errors).toEqual([]);
  });
});

for (const size of SIZES) {
  test.describe(`phone ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test('the primary button stays on screen and nothing scrolls sideways, in every tab', async ({ page }) => {
      const log = trackErrors(page);
      await startGame(page, { query: '?seed=8&rounds=5', speed: 'Off', passDevice: false });
      const check = async () => {
        const r = (await page.locator('#primary').boundingBox())!;
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(size.width + 0.5);
        expect(r.y + r.height).toBeLessThanOrEqual(size.height + 0.5);
        expect(r.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      };
      await check();
      for (const tab of ['players', 'log', 'mine', 'card']) {
        await page.locator(`#tab-${tab}`).click();
        await check();
      }
      await page.locator('#primary').click(); // a roll: a decision may open in the sheet
      await check();
      expect(log.errors).toEqual([]);
    });
  });
}

// Screenshot review (spec section 15): start, setup, a mid-game board, every decision panel, the
// rule guide, pass-device, winner and results at 1280 × 720, 1024 × 768 and 1920 × 1080.
// Images go to reports/screenshots/<size>/ for a person to open and look at.
import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from './audit';
import { loadState, panelStates } from './fixtures';
import { trackErrors } from './helpers';

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
];

let problems: string[] = [];

async function shot(page: Page, size: { width: number; height: number }, name: string) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `reports/screenshots/${size.width}x${size.height}/${name}.png` });
  for (const p of await auditLayout(page)) problems.push(`${size.width}x${size.height} ${name}: ${p}`);
}

for (const size of SIZES) {
  test.describe(`${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });

    test('screens and panels', async ({ page }) => {
      problems = [];
      const log = trackErrors(page);
      await page.goto('/?seed=42');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await shot(page, size, '01-start');
      await page.locator('#start-new').click();
      await shot(page, size, '02-setup');
      // The colour palette (D53), with two players and with six (the last row opens it upwards).
      await page.locator('#color-0').click();
      await shot(page, size, '02-setup-colors');
      await page.keyboard.press('Escape');
      await page.getByRole('radiogroup', { name: 'Players' }).getByRole('radio', { name: '6', exact: true }).check();
      await page.locator('#color-5').click();
      await shot(page, size, '02-setup-six-colors');
      await page.keyboard.press('Escape');

      const states = panelStates();
      for (const [name, state] of Object.entries(states)) {
        await loadState(page, state, '?seed=42');
        if (name === 'trade') {
          await shot(page, size, `panel-${name}-handover`);
          await page.locator('#handover-ready').click();
        }
        const plain = ['mid-game', 'crowded-board', 'six-tokens', 'six-tokens-top', 'pass-device', 'winner'].includes(name);
        await shot(page, size, plain ? name : `panel-${name}`);
        if (name === 'winner') {
          await page.locator('#winner-results').click();
          await shot(page, size, 'results');
        }
        if (name === 'mid-game') {
          await page.locator('#tb-rules').click();
          await shot(page, size, 'rule-guide');
          await page.keyboard.press('Escape');
          await page.locator('.player-card').first().click();
          await shot(page, size, 'property-list');
          await page.keyboard.press('Escape');
          await page.locator('#act-trade').click();
          await shot(page, size, 'trade-builder');
          await page.keyboard.press('Escape');
          await page.locator('.tile[data-space="38"]').hover();
          await shot(page, size, 'focus-card-hover');
        }
      }
      expect(log.errors).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}

// Screenshot review (spec section 15): start, setup, a mid-game board, every decision panel, the
// rule guide, pass-device, winner and results at 1280 × 720, 1024 × 768 and 1920 × 1080.
// Images go to reports/screenshots/<size>/ for a person to open and look at.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { auditLayout } from './audit';
import { loadState, panelStates } from './fixtures';
import { trackErrors } from './helpers';

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
];

let problems: string[] = [];

async function shot(page: Page, size: { width: number; height: number }, name: string, phone = false) {
  await page.waitForTimeout(phone ? 450 : 120);
  await page.screenshot({ path: `reports/screenshots/${size.width}x${size.height}/${name}.png` });
  for (const p of await auditLayout(page, { phone })) problems.push(`${size.width}x${size.height} ${name}: ${p}`);
}

const PHONES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

const ONLINE = 'http://localhost:4175';

async function onlineDevice(browser: Browser, phone: { width: number; height: number } | null) {
  const context = await browser.newContext({
    ...(phone ? { viewport: phone, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } }),
    permissions: ['microphone'],
  });
  await context.addInitScript(() => window.localStorage.setItem('global-monopoly/prefs/v1', JSON.stringify({ onlineSpeed: 'off' })));
  const page = await context.newPage();
  return { context, page, log: trackErrors(page) };
}

async function doubleTapBoard(page: Page) {
  const box = (await page.locator('.board-viewport').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
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

test.describe('online 1280 x 720', () => {
  test('create, join, lobby (host and guest), your turn and waiting', async ({ browser }) => {
    problems = [];
    const size = { width: 1280, height: 720 };
    const host = await onlineDevice(browser, null);
    const guest = await onlineDevice(browser, null);
    await host.page.goto(`${ONLINE}/`);
    await host.page.locator('#start-create').click();
    await host.page.locator('#online-name').fill('Mia');
    await shot(host.page, size, 'online-01-create');
    await host.page.locator('#online-submit').click();
    await expect(host.page.locator('.lobby-code')).toBeVisible();
    const code = (await host.page.locator('.lobby-code').innerText()).trim();
    await guest.page.goto(`${ONLINE}/`);
    await guest.page.locator('#start-join').click();
    await guest.page.locator('#online-code').fill(code);
    await guest.page.locator('#online-name').fill('Leo');
    await shot(guest.page, size, 'online-02-join');
    await guest.page.locator('#online-submit').click();
    await expect(host.page.locator('.lobby-seat')).toHaveCount(2);
    await shot(host.page, size, 'online-03-lobby-host');
    await shot(guest.page, size, 'online-04-lobby-guest');
    await host.page.locator('#lobby-start').click();
    await expect(host.page.locator('.turn-banner')).toBeVisible();
    await shot(host.page, size, 'online-05-your-turn');
    await expect(guest.page.locator('#primary')).toContainText('Waiting for Mia');
    await shot(guest.page, size, 'online-06-waiting');

    // Chat (spec section 18): the Chat tab beside the log, a message preview, stamps on the cards.
    await host.page.locator('#feed-chat').click();
    await host.page.locator('#chat-input').fill('Good luck everyone!');
    await host.page.keyboard.press('Enter');
    await expect(guest.page.locator('#chat-preview')).toBeVisible();
    await shot(guest.page, size, 'online-07-chat-preview');
    await guest.page.locator('#chat-preview').click();
    await expect(guest.page.locator('.chat-line')).toHaveCount(1);
    await guest.page.locator('#chat-input').fill('Thanks Mia, you too. Watch out for my hotels.');
    await guest.page.keyboard.press('Enter');
    await guest.page.locator('#chat-stamps').click();
    await shot(guest.page, size, 'online-08-chat-stamps');
    await guest.page.locator('#stamp-gg').click();
    await expect(host.page.locator('.stamp-mark')).toBeVisible();
    await shot(host.page, size, 'online-09-stamp');
    await expect(host.page.locator('.stamp-mark')).toHaveCount(0, { timeout: 5000 });
    // With the chat open, a decision panel takes the play area and the chat stays beside it.
    for (let i = 0; i < 8; i++) {
      if (await host.page.locator('.stage.has-panel').count()) break;
      await host.page.locator('#primary').click();
      await host.page.waitForTimeout(250);
    }
    await shot(host.page, size, 'online-10-panel-and-chat');
    // Voice chat: both join; the top bar has the microphone switch, the cards show who is in voice.
    await host.page.locator('#voice-join').click();
    await guest.page.locator('#voice-join').click();
    await expect(host.page.locator('.player-card .voice-badge')).toHaveCount(2);
    await guest.page.locator('#voice-mute').click();
    await expect(host.page.locator('.player-card .voice-badge.is-muted')).toHaveCount(1);
    await shot(host.page, size, 'online-11-voice');
    await host.page.setViewportSize({ width: 1024, height: 768 });
    // Compact screens: with the Chat tab selected, a panel still takes the whole stage...
    await shot(host.page, { width: 1024, height: 768 }, 'online-12-voice');
    // ...and without one, the chat opens over the log row, here with the stamp tray.
    for (let i = 0; i < 8 && (await host.page.locator('.stage.has-panel').count()); i++) {
      await host.page.locator('#primary').click();
      await host.page.waitForTimeout(250);
    }
    await expect(host.page.locator('.feed.is-expanded')).toBeVisible();
    await host.page.locator('#chat-stamps').click();
    await shot(host.page, { width: 1024, height: 768 }, 'online-13-chat-compact');
    expect([...host.log.errors, ...guest.log.errors]).toEqual([]);
    expect(problems).toEqual([]);
    await host.context.close();
    await guest.context.close();
  });
});

for (const size of PHONES) {
  test.describe(`phone ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test('phone screens and panels', async ({ page }) => {
      problems = [];
      const log = trackErrors(page);
      await page.goto('/?seed=42');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await shot(page, size, 'phone-01-start', true);
      await page.locator('#start-new').click();
      await shot(page, size, 'phone-02-setup', true);
      await page.locator('#back, .setup-footer .btn').first().click();
      await page.locator('#start-create').click();
      await shot(page, size, 'phone-03-online-create', true);
      await page.locator('.online-card .setup-footer .btn').first().click();
      await page.locator('#start-join').click();
      await shot(page, size, 'phone-04-online-join', true);

      const states = panelStates();
      for (const [name, state] of Object.entries(states)) {
        await loadState(page, state, '?seed=42');
        await expect(page.locator('.game-screen.is-phone')).toBeVisible();
        if (name === 'trade') {
          await shot(page, size, `phone-panel-${name}-handover`, true);
          await page.locator('#handover-ready').click();
        }
        await shot(page, size, `phone-${name}`, true);
        if (name === 'winner') {
          await page.locator('#winner-results').click();
          await shot(page, size, 'phone-results', true);
        }
        if (name === 'mid-game') {
          await doubleTapBoard(page);
          await expect(page.locator('.board-viewport')).toHaveAttribute('data-mode', 'fit');
          await shot(page, size, 'phone-mid-game-whole-board', true);
          await doubleTapBoard(page);
          for (const tab of ['players', 'log', 'mine']) {
            await page.locator(`#tab-${tab}`).click();
            await shot(page, size, `phone-mid-game-tab-${tab}`, true);
          }
          await page.locator('#mine-trade').click();
          await shot(page, size, 'phone-trade-builder', true);
          await page.keyboard.press('Escape');
          await page.locator('#tab-players').click();
          await page.locator('.player-card').nth(1).click();
          await shot(page, size, 'phone-property-list', true);
          await page.keyboard.press('Escape');
          await page.locator('#tb-rules').click();
          await shot(page, size, 'phone-rule-guide', true);
          await page.keyboard.press('Escape');
          await page.locator('#tb-menu').click();
          await shot(page, size, 'phone-menu', true);
          await page.keyboard.press('Escape');
        }
      }
      expect(log.errors).toEqual([]);
      expect(problems).toEqual([]);
    });

    test('phone online: lobby, waiting and your turn', async ({ browser }) => {
      problems = [];
      const host = await onlineDevice(browser, size);
      const guest = await onlineDevice(browser, null);
      await host.page.goto(`${ONLINE}/`);
      await host.page.locator('#start-create').click();
      await host.page.locator('#online-name').fill('Mia');
      await host.page.locator('#online-submit').click();
      await expect(host.page.locator('.lobby-code')).toBeVisible();
      const code = (await host.page.locator('.lobby-code').innerText()).trim();
      await guest.page.goto(`${ONLINE}/?room=${code}`);
      await guest.page.locator('#online-name').fill('Leo');
      await guest.page.locator('#online-submit').click();
      await expect(host.page.locator('.lobby-seat')).toHaveCount(2);
      await shot(host.page, size, 'phone-online-lobby-host', true);
      await guest.page.locator('#lobby-leave').isVisible();
      await host.page.locator('#lobby-start').click();
      await expect(host.page.locator('.game-screen.is-phone')).toBeVisible();
      await expect(host.page.locator('.turn-banner')).toBeVisible();
      await shot(host.page, size, 'phone-online-your-turn', true);
      // Mia rolls and finishes her turn; then she waits for Leo.
      for (let i = 0; i < 12; i++) {
        const s = await host.page.evaluate(() => (window as any).__GM__.getState());
        if (s.turn.currentPlayerIndex !== 0) break;
        if (s.flow.phase === 'Auction') await host.page.locator('#bid-fold').click();
        else await host.page.locator('#primary').click();
        await host.page.waitForTimeout(300);
      }
      await expect(host.page.locator('#primary')).toContainText('Waiting for Leo');
      await shot(host.page, size, 'phone-online-waiting', true);

      // Chat on a phone: a message from Leo shows as a preview, then in the Chat tab; a stamp lands.
      await guest.page.locator('#feed-chat').click();
      await guest.page.locator('#chat-input').fill('Your move after mine, Mia!');
      await guest.page.keyboard.press('Enter');
      await expect(host.page.locator('#chat-preview')).toBeVisible();
      await shot(host.page, size, 'phone-online-chat-preview', true);
      await host.page.locator('#tab-chat').click();
      await expect(host.page.locator('.chat-line')).toHaveCount(1);
      await host.page.locator('#chat-input').fill('Ready when you are');
      await host.page.keyboard.press('Enter');
      await expect(host.page.locator('.chat-line')).toHaveCount(2);
      await shot(host.page, size, 'phone-online-chat', true);
      await host.page.locator('#chat-stamps').click();
      await shot(host.page, size, 'phone-online-chat-stamps', true);
      await guest.page.locator('#chat-stamps').click();
      await guest.page.locator('#stamp-haha').click();
      await expect(host.page.locator('.stamp-mark')).toBeVisible();
      await shot(host.page, size, 'phone-online-stamp', true);
      // Voice chat on a phone: the status bar's button joins, then switches the microphone.
      await guest.page.locator('#voice-join').click();
      await expect(host.page.locator('#voice-join .voice-count')).toHaveText('1');
      await host.page.locator('#voice-join').click();
      await expect(host.page.locator('#voice-mute')).toBeVisible();
      await host.page.locator('#tab-players').click();
      await expect(host.page.locator('.player-card .voice-badge')).toHaveCount(2);
      await shot(host.page, size, 'phone-online-voice', true);
      expect([...host.log.errors, ...guest.log.errors]).toEqual([]);
      expect(problems).toEqual([]);
      await host.context.close();
      await guest.context.close();
    });
  });
}

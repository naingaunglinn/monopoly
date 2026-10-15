// The Myanmar map (D101): choosing it on the setup screen, its board in lakh with its own corners,
// the names switching to Burmese, and screenshots with the layout audit of its board, panels and
// cards in English and in Burmese at the desktop sizes and on phones.
// Images go to reports/screenshots/<size>/myanmar/.
import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from './audit';
import { loadState, myanmarStates } from './fixtures';
import { trackErrors } from './helpers';

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
];

const PHONES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

const LANGUAGES = ['en', 'my'] as const;

let problems: string[] = [];

async function shot(page: Page, size: { width: number; height: number }, name: string, phone = false) {
  await page.waitForTimeout(phone ? 450 : 120);
  await page.screenshot({ path: `reports/screenshots/${size.width}x${size.height}/myanmar/${name}.png` });
  for (const p of await auditLayout(page, { phone })) problems.push(`${size.width}x${size.height} ${name}: ${p}`);
}

test('choose the Myanmar map: a 48-space board in lakh, its corners, and names in Burmese', async ({ page }) => {
  const log = trackErrors(page);
  await page.goto('/?seed=42');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#start-new').click();
  const map = page.getByRole('radiogroup', { name: 'Map' });
  await expect(map.getByRole('radio', { name: 'World', exact: true })).toBeChecked();
  await expect(page.locator('#opt-freestay')).toHaveCount(1);
  await map.getByRole('radio', { name: 'Myanmar', exact: true }).check();
  // Starting money in lakh; no Free Stay or Vacation on this map.
  await expect(page.getByRole('radiogroup', { name: 'Starting money' })).toContainText('4,000 lakh');
  await expect(page.locator('#opt-freestay')).toHaveCount(0);
  await expect(page.locator('#opt-vacation')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Names and cards' })).toBeVisible();
  await page.locator('label[for="opt-pass"]').click();
  await page.locator('#setup-start').click();
  await expect(page.locator('.game-screen')).toBeVisible();

  await expect(page.locator('.board .tile')).toHaveCount(48);
  await expect(page.locator('.board')).toHaveAttribute('data-map', 'myanmar');
  await expect(page.locator('.tile[data-space="0"]')).toContainText('Start');
  await expect(page.locator('.tile[data-space="12"]')).toContainText('Military camp');
  await expect(page.locator('.tile[data-space="24"]')).toContainText('Chiang Mai');
  await expect(page.locator('.tile[data-space="36"]')).toContainText('Call-up letter');
  await expect(page.locator('.tile[data-space="44"]')).toContainText('Brycen Myanmar');
  await expect(page.locator('.tile[data-space="1"]')).toContainText('Falam');
  await expect(page.locator('.tile[data-space="1"]')).toContainText('60 lakh');
  // No dollar sign anywhere on the board or the players.
  expect(await page.locator('.game-screen').innerText()).not.toContain('$');
  const state = await page.evaluate(() => (window as unknown as { __GM__: { getState: () => { meta: { settings: { map: string } } } } }).__GM__.getState());
  expect(state.meta.settings.map).toBe('myanmar');

  // Names in Burmese from the menu (a choice of this device).
  await page.locator('#tb-menu').click();
  await page.getByRole('radiogroup', { name: 'Names and cards' }).locator('label', { hasText: 'မြန်မာ' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tile[data-space="1"]')).toContainText('ဖလမ်း');
  await expect(page.locator('.tile[data-space="1"]')).toContainText('၆၀ သိန်း');
  await expect(page.locator('.app')).toHaveAttribute('data-names', 'my');
  // It stays after a reload (Continue), and a new game's setup starts on the World map again.
  await page.reload();
  await page.locator('#start-continue').click();
  await expect(page.locator('.tile[data-space="1"]')).toContainText('ဖလမ်း');
  await page.reload();
  await page.locator('#start-new').click();
  await expect(page.getByRole('radiogroup', { name: 'Map' }).getByRole('radio', { name: 'World', exact: true })).toBeChecked();
  await expect(page.getByRole('radiogroup', { name: 'Starting money' })).toContainText('$4,000');
  expect(log.errors).toEqual([]);
});

test('stage 2 by clicking: the call-up choice, the pagoda donation (B key), merit on rent', async ({ page }) => {
  const log = trackErrors(page);
  const states = myanmarStates();
  const state = () => page.evaluate(() => (window as unknown as { __GM__: { getState: () => any } }).__GM__.getState());
  await loadState(page, states['mm-draft-choice'] as never, '?seed=42');
  await expect(page.locator('[data-panel="draft"]')).toBeVisible();
  await expect(page.locator('#draft-pay')).toContainText('800 lakh');
  await page.locator('#draft-hide').click();
  await expect.poll(async () => (await state()).players[0].draft).toEqual({ status: 'hiding', turns: 2 });
  await expect(page.locator('.player-card').first()).toContainText('Hiding, 2 turns');

  await loadState(page, states['mm-pagoda'] as never, '?seed=42');
  await expect(page.locator('[data-panel="donation"]')).toBeVisible();
  await page.keyboard.press('b');
  await expect.poll(async () => (await state()).players[0].merit).toBe(1);

  await loadState(page, states['mm-rent-merit'] as never, '?seed=42');
  await page.locator('#use-merit').click();
  await expect.poll(async () => (await state()).players[0].merit).toBe(1);
  expect(log.errors).toEqual([]);
});

test('a loan by clicking: ask, accept, see it listed with its collateral marked, pay it back', async ({ page }) => {
  const log = trackErrors(page);
  const states = myanmarStates();
  const state = () => page.evaluate(() => (window as unknown as { __GM__: { getState: () => any } }).__GM__.getState());
  const owned = states['mm-loan-request'] as never as { flow: { loan: unknown } };
  // The same board without the request on the table.
  const start = JSON.parse(JSON.stringify(owned));
  start.flow.loan = null;
  await loadState(page, start, '?seed=42');
  await page.locator('#act-loan').click();
  await page.locator('#loan-amount').fill('400');
  await page.locator('#loan-rate').fill('10');
  await page.locator('#loan-term').fill('4');
  await page.locator('.loan-pick-row', { hasText: 'Falam' }).click();
  await page.locator('#loan-send').click();
  await expect(page.locator('[data-panel="loan"]')).toBeVisible();
  await page.locator('#loan-accept').click();
  await expect.poll(async () => (await state()).economy.loans.length).toBe(1);
  await expect(page.locator('.tile', { hasText: 'Falam' }).locator('.pledge-marker')).toBeVisible();
  await page.locator('.player-card').first().click();
  await expect(page.locator('.loans-list')).toContainText('Mia owes Leo');
  await page.locator('[id^="loan-repay-"]').click();
  await expect.poll(async () => (await state()).economy.loans.length).toBe(0);
  expect(log.errors).toEqual([]);
});

test('the general by clicking: use the power, pick the target, the window, and the 20-second hold', async ({ page }) => {
  test.setTimeout(120_000);
  const log = trackErrors(page);
  const states = myanmarStates();
  const state = () => page.evaluate(() => (window as unknown as { __GM__: { getState: () => any } }).__GM__.getState());
  await loadState(page, states['mm-general'] as never, '?seed=42');
  await expect(page.locator('.general-line')).toContainText('General: Mia, rank 4');
  await page.locator('#act-power').click();
  await expect(page.locator('[data-panel="power-target"], [data-panel="unrest"]').first()).toBeVisible();
  const s1 = await state();
  if (s1.flow.pending?.kind === 'powerTarget') {
    await page.locator('button[id^="power-target-"]').first().click();
  }
  await expect(page.locator('[data-panel="unrest"]')).toBeVisible();
  // One player shows unrest; the rest are held back by the clock.
  await page.locator('#unrest-show-1').click();
  await expect.poll(async () => (await state()).economy.unrestUsed).toBe(1);
  await expect.poll(async () => (await state()).flow.pending?.kind ?? null, { timeout: 30_000 }).not.toBe('unrest');
  expect(log.errors).toEqual([]);
});

test('online: the host picks Myanmar in the lobby; each device keeps its own language', async ({ browser }) => {
  const ONLINE = 'http://localhost:4175';
  const open = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => window.localStorage.setItem('global-monopoly/prefs/v1', JSON.stringify({ onlineSpeed: 'off' })));
    const page = await context.newPage();
    return { context, page, log: trackErrors(page) };
  };
  const host = await open();
  const guest = await open();
  await host.page.goto(`${ONLINE}/?rounds=5`);
  await host.page.locator('#start-create').click();
  await host.page.locator('#online-name').fill('Mia');
  await host.page.locator('#online-submit').click();
  await expect(host.page.locator('.lobby-code')).toBeVisible();
  const code = (await host.page.locator('.lobby-code').innerText()).trim();
  // The server applies the host's choice, then the lobby shows it.
  const hostMap = host.page.getByRole('radiogroup', { name: 'Map' });
  await hostMap.locator('label', { hasText: 'Myanmar' }).click();
  await expect(hostMap.getByRole('radio', { name: 'Myanmar', exact: true })).toBeChecked();
  await expect(host.page.getByRole('radiogroup', { name: 'Starting money' })).toContainText('4,000 lakh');
  await expect(host.page.locator('#opt-freestay')).toHaveCount(0);

  await guest.page.goto(`${ONLINE}/?room=${code}`);
  await guest.page.locator('#online-name').fill('Aung');
  await guest.page.locator('#online-submit').click();
  await expect(guest.page.locator('.lobby-code')).toBeVisible();
  const guestMap = guest.page.getByRole('radiogroup', { name: 'Map' });
  await expect(guestMap.getByRole('radio', { name: 'Myanmar', exact: true })).toBeChecked();
  await expect(guestMap.getByRole('radio', { name: 'Myanmar', exact: true })).toBeDisabled();
  // The guest reads the board in Burmese; the host keeps English.
  await guest.page.getByRole('radiogroup', { name: 'Names and cards' }).locator('label', { hasText: 'မြန်မာ' }).click();

  await host.page.locator('#lobby-start').click();
  for (const d of [host, guest]) {
    await expect(d.page.locator('.board .tile')).toHaveCount(48);
    await expect(d.page.locator('.board')).toHaveAttribute('data-map', 'myanmar');
  }
  await expect(host.page.locator('.tile[data-space="1"]')).toContainText('Falam');
  await expect(host.page.locator('.tile[data-space="1"]')).toContainText('60 lakh');
  await expect(guest.page.locator('.tile[data-space="1"]')).toContainText('ဖလမ်း');
  expect(await host.page.locator('.board').innerText()).not.toContain('$');
  expect(host.log.errors).toEqual([]);
  expect(guest.log.errors).toEqual([]);
  await host.context.close();
  await guest.context.close();
});

for (const lang of LANGUAGES) {
  test(`online room play, six players, ${lang}: the top bar, the pot, the Loan button; your turn and waiting`, async ({ browser }) => {
    test.setTimeout(240_000);
    problems = [];
    const ONLINE = 'http://localhost:4175';
    const names = ['Mia', 'Leo', 'Aung', 'Sofia', 'Kenji', 'Nadia'];
    const devices = [];
    for (let i = 0; i < names.length; i++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone'] });
      await context.addInitScript((language) => window.localStorage.setItem('global-monopoly/prefs/v1', JSON.stringify({ onlineSpeed: 'off', language })), lang);
      const page = await context.newPage();
      devices.push({ context, page, log: trackErrors(page) });
    }
    const [host, ...rest] = devices as [(typeof devices)[number], ...(typeof devices)[number][]];
    await host.page.goto(`${ONLINE}/`);
    await host.page.locator('#start-create').click();
    await host.page.locator('#online-name').fill(names[0] as string);
    await host.page.locator('#online-submit').click();
    await expect(host.page.locator('.lobby-code')).toBeVisible();
    const code = (await host.page.locator('.lobby-code').innerText()).trim();
    const map = host.page.getByRole('radiogroup', { name: 'Map' });
    await map.locator('label', { hasText: 'Myanmar' }).click();
    await expect(map.getByRole('radio', { name: 'Myanmar', exact: true })).toBeChecked();
    for (let i = 0; i < rest.length; i++) {
      const d = rest[i] as (typeof rest)[number];
      await d.page.goto(`${ONLINE}/?room=${code}`);
      await d.page.locator('#online-name').fill(names[i + 1] as string);
      await d.page.locator('#online-submit').click();
      await expect(d.page.locator('.lobby-code')).toBeVisible();
    }
    await expect(host.page.locator('.lobby-seat')).toHaveCount(6);
    await shot(host.page, { width: 1280, height: 720 }, `online-lobby-${lang}`);
    await host.page.locator('#lobby-start').click();
    await expect(host.page.locator('.tb-others .tb-slot')).toHaveCount(5);
    await host.page.locator('#voice-join').click();
    for (const size of SIZES) {
      await host.page.setViewportSize(size);
      await expect(host.page.locator('.pot-line')).toBeVisible();
      await shot(host.page, size, `online-six-${lang}`);
    }
    // Whoever is not deciding sees "waiting"; a Loan button is there for them too.
    const guest = rest[2] as (typeof rest)[number];
    await expect(guest.page.locator('#act-loan')).toBeVisible();
    await shot(guest.page, { width: 1280, height: 720 }, `online-waiting-${lang}`);
    await guest.page.locator('#act-loan').click();
    await shot(guest.page, { width: 1280, height: 720 }, `online-loan-sheet-${lang}`);
    expect(devices.flatMap((d) => d.log.errors)).toEqual([]);
    expect(problems).toEqual([]);
    for (const d of devices) await d.context.close();
  });
}

for (const size of SIZES) {
  test.describe(`Myanmar ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });

    test('board, panels and cards in English and Burmese', async ({ page }) => {
      problems = [];
      const log = trackErrors(page);
      await page.goto('/?seed=42');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.locator('#start-new').click();
      await page.getByRole('radiogroup', { name: 'Map' }).getByRole('radio', { name: 'Myanmar', exact: true }).check();
      await shot(page, size, 'setup');
      const states = myanmarStates();
      for (const lang of LANGUAGES) {
        for (const [name, state] of Object.entries(states)) {
          await loadState(page, state, '?seed=42', { language: lang });
          await shot(page, size, `${name}-${lang}`);
          if (name === 'mm-loan-active') {
            await page.locator('.player-card').first().click();
            await shot(page, size, `loans-list-${lang}`);
            await page.keyboard.press('Escape');
            await page.locator('#act-loan').click();
            await shot(page, size, `loan-builder-${lang}`);
            await page.keyboard.press('Escape');
          }
          if (name === 'mm-mid-game') {
            await page.locator('#tb-rules').click();
            await shot(page, size, `rule-guide-${lang}`);
            await page.keyboard.press('Escape');
            await page.locator('.player-card').first().click();
            await shot(page, size, `property-list-${lang}`);
            await page.keyboard.press('Escape');
            await page.locator('.tile.type-city').nth(20).hover();
            await shot(page, size, `focus-card-city-${lang}`);
            await page.locator('.tile.type-company').first().hover();
            await shot(page, size, `focus-card-company-${lang}`);
            await page.locator('.tile.type-temple').first().hover();
            await shot(page, size, `focus-card-pagoda-${lang}`);
          }
        }
      }
      expect(log.errors).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}

for (const size of PHONES) {
  test.describe(`Myanmar phone ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test('phone board, panels and cards in English and Burmese', async ({ page }) => {
      problems = [];
      const log = trackErrors(page);
      const states = myanmarStates();
      for (const lang of LANGUAGES) {
        for (const [name, state] of Object.entries(states)) {
          await loadState(page, state, '?seed=42', { language: lang });
          await expect(page.locator('.game-screen.is-phone')).toBeVisible();
          await shot(page, size, `phone-${name}-${lang}`, true);
          if (name === 'mm-loan-active') {
            await page.locator('#tab-mine').click();
            await shot(page, size, `phone-mine-loans-${lang}`, true);
            await page.locator('#mine-loan').click();
            await shot(page, size, `phone-loan-sheet-${lang}`, true);
            await page.keyboard.press('Escape');
          }
        }
      }
      expect(log.errors).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}

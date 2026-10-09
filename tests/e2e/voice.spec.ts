// Voice chat (spec section 18) between two browser contexts on Chromium's fake microphone: both
// join, each connection comes up and audio keeps arriving on both sides, talking lights up, muting
// shows on the other device, leaving closes the connection, and voice carries on into the game.
// The local server hands out no ICE servers, so nothing leaves this machine.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

const ONLINE = 'http://localhost:4175';

interface Device {
  page: Page;
  errors: string[];
}

async function device(browser: Browser, phone = false): Promise<Device> {
  const context = await browser.newContext({
    ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } }),
    permissions: ['microphone'],
  });
  await context.addInitScript(() => window.localStorage.setItem('global-monopoly/prefs/v1', JSON.stringify({ onlineSpeed: 'off' })));
  const page = await context.newPage();
  return { page, errors: trackErrors(page).errors };
}

type Stats = Record<string, { state: string; bytesReceived: number }>;
const stats = (d: Device): Promise<Stats> => d.page.evaluate(() => (window as any).__GM__.voiceStats());

/** Audio received from the one other device, now and a little later: it must grow. */
async function audioFlows(d: Device): Promise<void> {
  const first = Object.values(await stats(d))[0]?.bytesReceived ?? 0;
  await expect.poll(async () => Object.values(await stats(d))[0]?.bytesReceived ?? 0, { timeout: 10_000 }).toBeGreaterThan(first + 1000);
}

test('two devices talk: connected, audio both ways, talking lights up, mute shows, leaving closes; it carries on into the game', async ({ browser }) => {
  const a = await device(browser);
  const b = await device(browser, true);
  await a.page.goto(`${ONLINE}/`);
  await a.page.locator('#start-create').click();
  await a.page.locator('#online-name').fill('Mia');
  await a.page.locator('#online-submit').click();
  const code = (await a.page.locator('.lobby-code').innerText()).trim();
  await b.page.goto(`${ONLINE}/?room=${code}`);
  await b.page.locator('#online-name').fill('Leo');
  await b.page.locator('#online-submit').click();
  await expect(a.page.locator('.lobby-seat')).toHaveCount(2);

  // Mia joins; Leo's (phone) join button shows one person in voice.
  await a.page.locator('#voice-join').click();
  await expect(a.page.locator('#voice-mute')).toBeVisible();
  await expect(b.page.locator('#voice-join .voice-count')).toHaveText('1');
  await b.page.locator('#voice-join').click();
  await expect(b.page.locator('#voice-mute')).toBeVisible();

  // Both connections come up and audio flows both ways.
  for (const d of [a, b]) {
    await expect.poll(async () => Object.values(await stats(d)).map((s) => s.state), { timeout: 20_000 }).toEqual(['connected']);
  }
  await audioFlows(a);
  await audioFlows(b);
  // Both are listed on the lobby rows; the fake microphone's beeps light up talking.
  await expect(a.page.locator('.lobby-seat .voice-badge')).toHaveCount(2);
  await expect.poll(() => a.page.evaluate(() => (window as any).__GM__.voice().speaking.length), { timeout: 10_000 }).toBeGreaterThan(0);

  // Leo mutes: Mia sees it on his row.
  await b.page.locator('#voice-mute').click();
  await expect(a.page.locator('.lobby-seat[data-seat="1"] .voice-badge.is-muted')).toBeVisible();
  await b.page.locator('#voice-mute').click();
  await expect(a.page.locator('.lobby-seat[data-seat="1"] .voice-badge.is-muted')).toHaveCount(0);

  // The game starts: the call carries on, with the switch in the top bar and badges on the players'
  // chips there (room play on a large screen, D97).
  await a.page.locator('#lobby-start').click();
  await expect(a.page.locator('.game-screen')).toBeVisible();
  await expect(b.page.locator('.game-screen.is-phone')).toBeVisible();
  await expect(a.page.locator('.topbar #voice-mute')).toBeVisible();
  await expect(b.page.locator('.phone-status #voice-mute')).toBeVisible();
  await expect(a.page.locator('.tb-players .voice-badge')).toHaveCount(2);
  await audioFlows(a);

  // Mia leaves: Leo's connection closes and Mia's badge goes.
  await a.page.locator('#voice-leave').click();
  await expect(a.page.locator('#voice-join')).toBeVisible();
  await expect.poll(async () => Object.keys(await stats(b)).length).toBe(0);
  await expect(b.page.locator('#voice-join')).toHaveCount(0);
  expect(await b.page.evaluate(() => (window as any).__GM__.voice().peers.length)).toBe(1);
  expect([...a.errors, ...b.errors]).toEqual([]);
});

// Online play end to end (spec section 17) against the local server (API on MemoryStore + the
// built game on port 4175): separate browser contexts are separate devices. A full Quick game to
// the results with one device closed and reopened mid-game, the same with the stream blocked
// (polling fallback), the lobby, and the host's controls for a disconnected player.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { decisionMaker, type GameState } from '../../src/engine';
import { playStep } from './helpers';

const ONLINE = 'http://localhost:4175';

interface Device {
  name: string;
  context: BrowserContext;
  page: Page;
  errors: string[];
}

interface OnlineInfo {
  code: string;
  mine: number[];
  controls: number[];
  version: number;
  status: string;
  link: string;
  host: number;
  pending: boolean;
}

async function openDevice(
  browser: Browser,
  name: string,
  opts: { viewport?: { width: number; height: number }; storageState?: Awaited<ReturnType<BrowserContext['storageState']>>; blockStream?: boolean } = {},
): Promise<Device> {
  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 720 }, storageState: opts.storageState });
  // Animation Off on every device (a per-device preference online).
  await context.addInitScript(() => {
    try {
      const prefs = JSON.parse(window.localStorage.getItem('global-monopoly/prefs/v1') ?? '{}');
      prefs.onlineSpeed = 'off';
      window.localStorage.setItem('global-monopoly/prefs/v1', JSON.stringify(prefs));
    } catch {
      // ignore
    }
  });
  if (opts.blockStream) await context.route('**/api/stream**', (route) => route.abort());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // With the stream blocked on purpose, only its own failed requests are expected.
    if (opts.blockStream && msg.location().url.includes('/api/stream')) return;
    errors.push(`${name}: ${msg.text()} (${msg.location().url})`);
  });
  page.on('pageerror', (err) => errors.push(`${name}: ${String(err)}`));
  return { name, context, page, errors };
}

const info = (d: Device): Promise<OnlineInfo | null> => d.page.evaluate(() => (window as any).__GM__.getOnline?.() ?? null);
const stateOf = (d: Device): Promise<GameState> => d.page.evaluate(() => (window as any).__GM__.getState());

async function createRoom(d: Device, query = '?rounds=5'): Promise<string> {
  await d.page.goto(`${ONLINE}/${query}`);
  await d.page.locator('#start-create').click();
  await d.page.locator('#online-name').fill(d.name);
  await d.page.locator('#online-submit').click();
  await expect(d.page.locator('.lobby-code')).toBeVisible();
  return (await d.page.locator('.lobby-code').innerText()).trim();
}

async function joinRoom(d: Device, code: string): Promise<void> {
  await d.page.goto(`${ONLINE}/?room=${code}`);
  await d.page.locator('#online-name').fill(d.name);
  await d.page.locator('#online-submit').click();
  await expect(d.page.locator('.lobby-code')).toBeVisible();
}

/** The device holding the seat that must decide, once it shows the latest version. */
async function actingDevice(devices: Device[]): Promise<{ device: Device; state: GameState } | null> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const infos = await Promise.all(devices.map(info));
    const latest = Math.max(...infos.map((i) => i?.version ?? 0));
    const freshest = devices[infos.findIndex((i) => i?.version === latest)] as Device;
    const s = await stateOf(freshest);
    if (s.flow.phase === 'GameOver') return null;
    const decider = decisionMaker(s);
    const index = infos.findIndex((i) => i !== null && decider !== null && i.controls.includes(decider));
    const acting = devices[index];
    if (acting && infos[index]?.version === latest && !infos[index]?.pending) return { device: acting, state: s };
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('no device can act');
}

/** One decision: the right device clicks what a person would, then its answer arrives. */
async function onlineStep(devices: Device[]): Promise<boolean> {
  const acting = await actingDevice(devices);
  if (!acting) return false;
  const before = (await info(acting.device))?.version ?? 0;
  await playStep(acting.device.page);
  // Wait for the server's answer (a new version), unless the step only opened something.
  await expect
    .poll(async () => {
      const i = await info(acting.device);
      return !i?.pending && (i?.version ?? 0) >= before;
    })
    .toBe(true);
  return true;
}

async function playToEnd(devices: Device[], maxSteps = 3000): Promise<number> {
  for (let i = 0; i < maxSteps; i++) if (!(await onlineStep(devices))) return i;
  throw new Error('the game did not finish');
}

async function everyoneSees(devices: Device[], check: (s: GameState, i: OnlineInfo) => boolean): Promise<void> {
  for (const d of devices) {
    await expect.poll(async () => {
      const i = await info(d);
      return i !== null && check(await stateOf(d), i);
    }, { timeout: 15_000 }).toBe(true);
  }
}

test.describe('online', () => {
  test.setTimeout(600_000);

  test('three devices play a Quick game to the results; one closes mid-game and resumes its seat', async ({ browser }) => {
    const a = await openDevice(browser, 'Mia');
    const b = await openDevice(browser, 'Leo', { viewport: { width: 1024, height: 768 } });
    let c = await openDevice(browser, 'Aung');
    const code = await createRoom(a);
    await joinRoom(b, code);
    await joinRoom(c, code);
    await expect(a.page.locator('.lobby-seat')).toHaveCount(3);
    await a.page.locator('#lobby-start').click();
    for (const d of [a, b, c]) await expect(d.page.locator('.game-screen')).toBeVisible();
    expect((await info(c))?.mine).toEqual([2]);

    // Play a while, then close Aung's browser when it is someone else's decision.
    for (let i = 0; i < 25; i++) await onlineStep([a, b, c]);
    let acting = await actingDevice([a, b, c]);
    while (acting?.device === c) {
      await onlineStep([a, b, c]);
      acting = await actingDevice([a, b, c]);
    }
    const stored = await c.context.storageState();
    const cErrors = c.errors;
    await c.context.close();
    // The others play on until Aung must decide: the game waits for Aung.
    for (let i = 0; i < 400; i++) {
      const s = await stateOf(a);
      if (s.flow.phase === 'GameOver' || decisionMaker(s) === 2) break;
      await onlineStep([a, b]);
    }
    // Aung reopens the link: back in the same seat, with the same game.
    c = await openDevice(browser, 'Aung', { storageState: stored });
    c.errors.push(...cErrors);
    await c.page.goto(`${ONLINE}/?room=${code}`);
    await expect(c.page.locator('.game-screen')).toBeVisible();
    expect((await info(c))?.mine).toEqual([2]);
    const latest = (await info(a))?.version;
    await everyoneSees([c], (_, i) => i.version >= (latest ?? 0));

    await playToEnd([a, b, c]);
    await everyoneSees([a, b, c], (s) => s.flow.phase === 'GameOver');
    const versions = await Promise.all([a, b, c].map(async (d) => (await info(d))?.version));
    expect(new Set(versions).size).toBe(1);
    for (const d of [a, b, c]) {
      await expect(d.page.locator('[data-panel="winner"]')).toBeVisible();
      await d.page.locator('#winner-results').click();
      await expect(d.page.locator('.results-table tbody tr')).toHaveCount(3);
    }
    expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
  });

  test('with the live stream blocked, polling carries the whole game', async ({ browser }) => {
    const devices = [
      await openDevice(browser, 'Mia', { blockStream: true }),
      await openDevice(browser, 'Leo', { blockStream: true }),
      await openDevice(browser, 'Aung', { blockStream: true }),
    ];
    const [a, b, c] = devices as [Device, Device, Device];
    const code = await createRoom(a, '?rounds=3');
    await joinRoom(b, code);
    await joinRoom(c, code);
    await expect(a.page.locator('.lobby-seat')).toHaveCount(3);
    await a.page.locator('#lobby-start').click();
    for (const d of devices) await expect(d.page.locator('.game-screen')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await info(b))?.link).toBe('polling');
    await playToEnd(devices);
    await everyoneSees(devices, (s) => s.flow.phase === 'GameOver');
    expect(devices.flatMap((d) => d.errors)).toEqual([]);
  });

  test('the other device watches the move live; the next player gets a Your turn banner and tab title', async ({ browser }) => {
    const a = await openDevice(browser, 'Mia');
    const b = await openDevice(browser, 'Leo');
    // Leo watches at Normal speed (each device chooses its own).
    await b.context.addInitScript(() => {
      const prefs = JSON.parse(window.localStorage.getItem('global-monopoly/prefs/v1') ?? '{}');
      prefs.onlineSpeed = 'normal';
      window.localStorage.setItem('global-monopoly/prefs/v1', JSON.stringify(prefs));
    });
    const code = await createRoom(a, '');
    await joinRoom(b, code);
    await a.page.locator('#lobby-start').click();
    await expect(b.page.locator('.game-screen')).toBeVisible();
    await expect(b.page.locator('#primary')).toContainText('Waiting for Mia');
    await expect(a.page).toHaveTitle(/Your turn/);
    await a.page.locator('#primary').click(); // Roll dice
    // Leo's screen plays Mia's dice and move.
    await expect(b.page.locator('.game-screen.is-animating')).toHaveCount(1, { timeout: 5000 });
    await expect(b.page.locator('.game-screen.is-animating')).toHaveCount(0, { timeout: 15_000 });
    // Mia finishes her turn; Leo gets the banner, the tab title and the yellow button.
    for (let i = 0; i < 20; i++) {
      const s = await stateOf(a);
      if (decisionMaker(s) === 1) break;
      await onlineStep([a, b]);
    }
    await expect(b.page.locator('.turn-banner')).toContainText('Leo');
    await expect(b.page).toHaveTitle(/Your turn/);
    await expect(a.page).not.toHaveTitle(/Your turn/);
    await expect(a.page.locator('#primary')).toContainText('Waiting for Leo');
    expect([...a.errors, ...b.errors]).toEqual([]);
  });

  test('lobby: colours are exclusive, one device takes two seats, only the host sets options and starts', async ({ browser }) => {
    const a = await openDevice(browser, 'Mia');
    const b = await openDevice(browser, 'Leo');
    const code = await createRoom(a, '');
    await joinRoom(b, code);
    // Leo cannot take Mia's colour (red): it is shown as taken.
    await b.page.locator('#color-1').click();
    const red = b.page.locator('.color-pop .swatch[data-color="#E5484D"]');
    await expect(red).toHaveAttribute('aria-disabled', 'true');
    await b.page.locator('.color-pop .swatch[data-color="#D6409F"]').click();
    await expect(a.page.locator('.lobby-seat[data-seat="1"] .token-chip').first()).toHaveCSS('color', 'rgb(214, 64, 159)');
    // Only the host changes options.
    await expect(b.page.locator('#opt-auction')).toBeDisabled();
    await a.page.locator('label[for="opt-auction"]').click();
    await expect(b.page.locator('#opt-auction')).not.toBeChecked();
    await expect(b.page.locator('.lobby-waiting')).toContainText('Waiting for Mia to start the game');
    // A second person on Leo's laptop takes a seat.
    await b.page.locator('#lobby-add-seat').click();
    await expect(b.page.locator('.lobby-seat.is-mine')).toHaveCount(2);
    await expect(a.page.locator('.lobby-seat')).toHaveCount(3);
    await a.page.locator('#lobby-start').click();
    await expect(b.page.locator('.game-screen')).toBeVisible();
    const s = await stateOf(b);
    expect(s.players.map((p) => p.color)).toContain('#D6409F');
    expect(s.meta.settings.auction).toBe(false);
    expect((await info(b))?.mine).toEqual([1, 2]);
    expect([...a.errors, ...b.errors]).toEqual([]);
  });

  test('host controls: play for a disconnected player; another device takes the seat back; the host removes a player', async ({ browser }) => {
    test.setTimeout(420_000);
    const a = await openDevice(browser, 'Mia');
    const b = await openDevice(browser, 'Leo');
    const c = await openDevice(browser, 'Aung');
    const code = await createRoom(a, '');
    await joinRoom(b, code);
    await joinRoom(c, code);
    await expect(a.page.locator('.lobby-seat')).toHaveCount(3);
    // Normal mode, so removing a player does not end the game.
    await a.page.locator('.segment', { hasText: 'Normal' }).click();
    await expect(b.page.locator('.segment.is-on', { hasText: 'Normal' })).toBeVisible();
    await a.page.locator('#lobby-start').click();
    await expect(c.page.locator('.game-screen')).toBeVisible();
    await c.context.close();
    // 45 seconds without a heartbeat: Aung shows as disconnected and the host gets controls.
    await expect(a.page.locator('.player-card[data-player="2"] .badge-offline')).toBeVisible({ timeout: 80_000 });
    await a.page.locator('#play-for-2').click();
    await expect(a.page.locator('.player-card[data-player="2"]')).toContainText('You play for them');
    // Play until it is Aung's decision: the host's device acts for Aung.
    for (let i = 0; i < 60; i++) {
      const s = await stateOf(a);
      if (decisionMaker(s) === 2) break;
      await onlineStep([a, b]);
    }
    expect(decisionMaker(await stateOf(a))).toBe(2);
    await expect(a.page.locator('#primary')).not.toContainText('Waiting for');
    await onlineStep([a, b]);

    // Aung comes back on another device: the join screen offers the disconnected seat.
    const d = await openDevice(browser, 'Aung');
    await d.page.goto(`${ONLINE}/?room=${code}`);
    await d.page.locator('#reclaim-2').click();
    await expect(d.page.locator('.game-screen')).toBeVisible();
    expect((await info(d))?.mine).toEqual([2]);
    await expect(a.page.locator('.player-card[data-player="2"]')).not.toContainText('You play for them', { timeout: 30_000 });

    // Aung leaves for good: the host removes the seat, bankrupt to the bank.
    await d.context.close();
    await expect(a.page.locator('.player-card[data-player="2"] .badge-offline')).toBeVisible({ timeout: 80_000 });
    await a.page.locator('#remove-2').click();
    await expect(a.page.locator('[data-sheet="confirm"]')).toContainText('Remove Aung?');
    await a.page.locator('#confirm-yes').click();
    await everyoneSees([a, b], (s) => s.players[2]?.bankrupt === true && s.flow.phase !== 'GameOver');
    expect([...a.errors, ...b.errors, ...d.errors]).toEqual([]);
  });
});

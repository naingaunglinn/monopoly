// Sound effects (spec section 18) in a real browser: every cue renders audible and below clipping,
// a roll plays the dice, one step per space and the landing in time with the board, skipping stops
// it, animation Off plays a short version at once, and the settings turn sound off and set the
// volume. Any console error fails a run.
import { expect, test, type Page } from '@playwright/test';
import { gameState, startGame, trackErrors } from './helpers';

interface Played {
  cue: string;
  at: number;
}

const sounds = (page: Page): Promise<Played[]> => page.evaluate(() => (window as any).__GM__.sounds());
const audioState = (page: Page): Promise<string> => page.evaluate(() => (window as any).__GM__.audioState());

const STAMPS = ['nice', 'ouch', 'haha', 'wow', 'hurry', 'gg'];

test('every sound is audible and never clips', async ({ page }) => {
  await page.goto('/');
  const stats: { name: string; peak: number; loud: number }[] = await page.evaluate(async (stamps) => {
    const gm = (window as any).__GM__;
    const out: { name: string; peak: number; loud: number }[] = [];
    for (const name of gm.cueNames() as string[]) {
      const variants = name === 'stamp' ? stamps.map((stamp) => ({ stamp })) : [{}];
      for (const params of variants) {
        const r = await gm.renderCue(name, params);
        out.push({ name: 'stamp' in params ? `${name}:${(params as { stamp: string }).stamp}` : name, peak: r.peak, loud: r.loud });
      }
    }
    return out;
  }, STAMPS);
  expect(stats.length).toBeGreaterThan(40);
  // Loudness of the loudest 50 ms: every cue between -36 and -18 dBFS at the default volume, so none
  // is lost under the others or startles (the trims in cues.ts set them in three tiers).
  for (const s of stats) {
    expect.soft(s.peak, `${s.name} stays below clipping`).toBeLessThan(0.98);
    expect.soft(s.loud, `${s.name} is heard`).toBeGreaterThan(10 ** (-36 / 20));
    expect.soft(s.loud, `${s.name} does not startle`).toBeLessThan(10 ** (-18 / 20));
  }
});

test('a roll plays the dice, one step per space and the landing, in time with the board', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', speed: 'Normal' });
  await page.locator('#pass-ready').click();
  await expect.poll(() => audioState(page)).toBe('running');
  const before = (await sounds(page)).length;
  await page.locator('#primary').click(); // Roll dice
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(0, { timeout: 15_000 });
  const s = await gameState(page);
  const moved = [...s.meta.log].reverse().find((l: any) => l.event.type === 'moved')?.event;
  const cues = (await sounds(page)).slice(before);
  const names = cues.map((c) => c.cue);
  expect(names[0]).toBe('dice');
  expect(names.filter((n) => n === 'hop')).toHaveLength(moved.path.length - 1);
  expect(names.indexOf('land')).toBeGreaterThan(names.lastIndexOf('hop'));
  // The first step sounds once the dice have settled (1.1 s at Normal), then one step every 260 ms.
  const dice = cues.find((c) => c.cue === 'dice') as Played;
  const hops = cues.filter((c) => c.cue === 'hop');
  expect((hops[0] as Played).at - dice.at).toBeGreaterThanOrEqual(1000);
  if (hops.length >= 2) expect((hops[1] as Played).at - (hops[0] as Played).at).toBeGreaterThanOrEqual(200);
  expect(log.errors).toEqual([]);
});

test('skipping a move stops its sounds; with animation Off a batch plays a short version at once', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', speed: 'Normal' });
  await page.locator('#pass-ready').click();
  await expect.poll(() => audioState(page)).toBe('running');
  await page.locator('#primary').click(); // Roll dice
  await page.waitForTimeout(300);
  await page.keyboard.press('Space'); // skip
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(0);
  const afterSkip = (await sounds(page)).length;
  await page.waitForTimeout(1500);
  expect((await sounds(page)).length).toBe(afterSkip);

  // Animation Off: the next actions play their key sounds at once, a few at most.
  await page.locator('#tb-menu').click();
  await page.getByRole('radiogroup', { name: 'Animation speed' }).getByRole('radio', { name: 'Off', exact: true }).check();
  await page.keyboard.press('Escape');
  for (let i = 0; i < 12; i++) {
    const s = await gameState(page);
    if (s.flow.phase === 'AwaitRoll' && s.flow.notices.length === 0) break;
    if (await page.locator('[data-sheet="pass"]').count()) await page.locator('#pass-ready').click();
    else if (s.flow.phase === 'BuyDecision') await page.locator('#buy-pass').click();
    else if (s.flow.phase === 'Auction') await page.locator('#bid-fold').click();
    else await page.locator('#primary').click();
  }
  const before = (await sounds(page)).length;
  await page.locator('#primary').click(); // Roll dice, at once
  await expect.poll(async () => (await sounds(page)).length).toBeGreaterThan(before);
  await page.waitForTimeout(800);
  const names = (await sounds(page)).slice(before).map((c) => c.cue);
  expect(names[0]).toBe('diceQuick');
  expect(names).not.toContain('hop');
  expect(names.length).toBeLessThanOrEqual(4);
  expect(log.errors).toEqual([]);
});

test('the menu turns sound off and sets the volume; the top bar switch turns it back on', async ({ page }) => {
  const log = trackErrors(page);
  await startGame(page, { query: '?seed=42&rounds=5', speed: 'Fast', passDevice: false });
  await page.locator('#tb-menu').click();
  await expect(page.locator('#set-sound')).toBeChecked();
  // The volume slider moves in steps of 5 and is remembered on this device.
  await page.locator('#set-volume').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#set-volume')).toHaveValue('60');
  await page.locator('label[for="set-sound"]').click();
  await expect(page.locator('#set-sound')).not.toBeChecked();
  await expect(page.locator('#set-volume')).toBeDisabled();
  const prefs = await page.evaluate(() => JSON.parse(window.localStorage.getItem('global-monopoly/prefs/v1') ?? '{}'));
  expect(prefs).toMatchObject({ soundOn: false, soundVolume: 0.6 });
  await page.keyboard.press('Escape');
  // Sound off: a roll is silent.
  const before = (await sounds(page)).length;
  await page.locator('#primary').click();
  await expect(page.locator('.game-screen.is-animating')).toHaveCount(0, { timeout: 15_000 });
  expect((await sounds(page)).length).toBe(before);
  // The top bar switch turns it back on, with a tick to hear the level.
  await expect(page.locator('#tb-sound')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#tb-sound').click();
  await expect(page.locator('#tb-sound')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await sounds(page)).slice(before).map((c) => c.cue)).toContain('tick');
  expect(log.errors).toEqual([]);
});

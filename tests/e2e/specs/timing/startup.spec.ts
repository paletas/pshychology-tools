import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { fillDates } from '../helpers/app';
import { reportsDir } from '../helpers/paths';
import { NEW_URL } from '../helpers/read-new';
import { OLD_URL } from '../helpers/read-old';

const RUNS = 5;
const TEST_DATE = '2026-10-03';
const BIRTH_DATE = '2018-01-15';

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function ageFilled(page: Page): Promise<boolean> {
  return (await page.locator('#subjectAgeYear').inputValue()) !== '';
}

/** Navigation start until the age fields fill after the fixed dates are entered. */
async function measure(page: Page, app: 'old' | 'new'): Promise<number> {
  const t0 = Date.now();
  await page.goto(app === 'old' ? OLD_URL : NEW_URL, { waitUntil: 'commit' });
  if (app === 'new') {
    await expect(page.getByTestId('app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await fillDates(page, TEST_DATE, BIRTH_DATE);
  } else {
    // Blazor binds only once it is started: enter the dates again until the age fields fill
    await page.locator('#testDate').waitFor({ state: 'attached', timeout: 60_000 });
    await page.waitForFunction(() => !!(window as any).Blazor, undefined, { timeout: 60_000 });
    await fillDates(page, TEST_DATE, BIRTH_DATE);
  }
  const deadline = Date.now() + 60_000;
  let lastEntry = Date.now();
  while (!(await ageFilled(page))) {
    if (Date.now() > deadline) throw new Error(`${app}: age fields never filled`);
    if (app === 'old' && Date.now() - lastEntry > 1_500) {
      await fillDates(page, TEST_DATE, BIRTH_DATE);
      lastEntry = Date.now();
    }
    await page.waitForTimeout(25);
  }
  return Date.now() - t0;
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await blockAds(ctx);
  return ctx;
}

async function sample(browser: Browser, app: 'old' | 'new') {
  const cold: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await newContext(browser);
    cold.push(await measure(await ctx.newPage(), app));
    await ctx.close();
  }
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await measure(page, app); // first load fills caches, not counted
  const warm: number[] = [];
  for (let i = 0; i < RUNS; i++) warm.push(await measure(page, app));
  await ctx.close();
  return { coldMedianMs: median(cold), warmMedianMs: median(warm), samples: { cold, warm } };
}

test('startup timing: old vs new, cold and warm', async ({ browser }) => {
  test.setTimeout(600_000);
  const result = { old: await sample(browser, 'old'), new: await sample(browser, 'new') };
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, 'startup-timing.json'), JSON.stringify(result, null, 2) + '\n');
  const row = (name: string, r: typeof result.old) =>
    `| ${name} | ${r.coldMedianMs} | ${r.warmMedianMs} | ${r.samples.cold.join(', ')} | ${r.samples.warm.join(', ')} |`;
  const md = [
    '# Startup timing',
    '',
    'Navigation start until the age fields fill after the fixed dates are entered (new app: after `data-ready`). Cold = fresh context, warm = same context, reload. 5 runs each, medians in ms. There is no threshold.',
    '',
    '| App | Cold median | Warm median | Cold samples | Warm samples |',
    '|---|---|---|---|---|',
    row('old', result.old),
    row('new', result.new),
    '',
    'Caveat: old = local non-AOT Release publish; live uses AOT.',
    '',
  ];
  writeFileSync(join(reportsDir, 'startup-timing.md'), md.join('\n'));
});

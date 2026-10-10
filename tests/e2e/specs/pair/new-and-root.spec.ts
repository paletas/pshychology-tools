import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitControlled, waitReady } from '../helpers/app';

// POST-retire (2.1.0): a /new visit leaves nothing installed under /new/; the root worker and its caches are kept.
test('@post a /new visit bounces to the root and leaves the root SW and caches alone', async ({ browser, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto(`${origin}/wisc3`);
  await waitControlled(page);
  await waitReady(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${origin}/service-worker.js`);
  // the retire worker may interrupt this navigation
  await page.goto(`${origin}/new/wisc3`).catch(() => undefined);
  await expect.poll(() => page.url(), { timeout: 30_000 }).toBe(`${origin}/wisc3`);
  await waitReady(page);
  await expect
    .poll(async () => (await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope))).sort(), { timeout: 30_000 })
    .toEqual([`${origin}/`]);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${origin}/service-worker.js`);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toContain(`wisc3-meta-${origin}/`);
  expect(keys).toContain(`wisc3-precache-v2-${origin}/`);
  expect(keys.filter((k) => k.endsWith('/new/'))).toEqual([]);
  await context.close();
});

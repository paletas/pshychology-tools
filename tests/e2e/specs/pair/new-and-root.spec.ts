import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitControlled, waitReady } from '../helpers/app';

// POST-switch: the root install and the /new install coexist on one origin with separate service workers and caches.
test('@post /new install and root SW coexist with separate caches', async ({ browser, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto(`${origin}/new/wisc3`);
  await waitControlled(page);
  await waitReady(page);
  await page.goto(`${origin}/wisc3`);
  await waitControlled(page);
  await waitReady(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${origin}/service-worker.js`);
  const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
  expect(scopes).toContain(`${origin}/`);
  expect(scopes).toContain(`${origin}/new/`);
  await page.goto(`${origin}/new/wisc3`);
  await waitControlled(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${origin}/new/service-worker.js`);
  await waitReady(page);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toContain(`wisc3-meta-${origin}/`);
  expect(keys).toContain(`wisc3-meta-${origin}/new/`);
  expect(keys).toContain(`wisc3-precache-v2-${origin}/`);
  expect(keys).toContain(`wisc3-precache-v2-${origin}/new/`);
  await context.close();
});

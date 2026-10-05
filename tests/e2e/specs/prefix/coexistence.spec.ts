import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitControlled, waitReady } from '../helpers/app';
import { resetTmp } from '../helpers/tmp';

const ORIGIN = 'http://localhost:5203';

// The previous app's stub lives at the origin root, the new app under /new/ (stripped by the proxy): two scopes, two caches families.
test('stub at / and new app at /new/ coexist', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  await page.goto('wisc3');
  expect(page.url()).toBe(`${ORIGIN}/new/wisc3`);
  await waitControlled(page);
  await waitReady(page);

  const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
  expect(scopes).toContain(`${ORIGIN}/`);
  expect(scopes).toContain(`${ORIGIN}/new/`);
  expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toMatch(/\/new\/service-worker\.js$/);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).toContain('blazor-resources-/test');
  expect(keys).toContain(`wisc3-meta-${ORIGIN}/new/`);
  expect(keys).not.toContain(`wisc3-meta-${ORIGIN}/`);

  await page.goto('/');
  await waitControlled(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(`${ORIGIN}/service-worker.js`);
  await context.close();
});

test('same-origin requests stay under /new/ and App ID follows the base', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === ORIGIN && !u.pathname.startsWith('/new/')) outside.push(u.pathname);
  });
  await page.goto('wisc3');
  await waitReady(page);
  expect(outside).toEqual([]);

  const cdp = await context.newCDPSession(page);
  const { appId } = await cdp.send('Page.getAppId');
  if (appId) {
    expect(appId).toBe(`${ORIGIN}/new/wisc3`);
  } else {
    const { url, data } = await cdp.send('Page.getAppManifest', {});
    expect(url).toMatch(/\/new\/manifest\.json$/);
    const manifest = JSON.parse(data ?? '{}');
    expect(manifest.id).toBeUndefined();
    expect(manifest.start_url).toBe('wisc3');
  }
  await context.close();
});

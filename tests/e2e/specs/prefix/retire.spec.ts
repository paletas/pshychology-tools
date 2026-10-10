import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitControlled, waitReady } from '../helpers/app';
import { tmpSpa } from '../helpers/paths';
import { resetTmp } from '../helpers/tmp';

const ORIGIN = 'http://localhost:5203';

// The retire worker takes the place of the phase-1 /new worker. Only /new/ is served from tmpSpa here, so copying the retire file over
// service-worker.js stands in for Traefik psytoolsretire (which serves it at /new/service-worker.js only).
function swapInRetire(): void {
  copyFileSync(join(tmpSpa, 'retire-service-worker.js'), join(tmpSpa, 'service-worker.js'));
}

async function state(page: Page) {
  return page.evaluate(async () => ({
    scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope).sort(),
    keys: await caches.keys(),
    dbs: (await indexedDB.databases()).map((d) => d.name),
  }));
}

async function installNew(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.goto('wisc3');
  await waitControlled(page);
  await waitReady(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(`${ORIGIN}/new/service-worker.js`);
  expect((await state(page)).keys).toContain(`wisc3-meta-${ORIGIN}/new/`);
}

async function expectRetired(page: Page): Promise<void> {
  // locally /wisc3 is the stub dir's 404; only the URL matters
  await expect.poll(() => page.url(), { timeout: 30_000 }).toBe(`${ORIGIN}/wisc3`);
  await expect.poll(async () => (await state(page)).scopes, { timeout: 30_000 }).toEqual([`${ORIGIN}/`]);
  const { keys } = await state(page);
  expect(keys.filter((k) => k.endsWith('/new/'))).toEqual([]);
  expect(keys).toContain('blazor-resources-/test');
}

test('R1 an installed /new worker is retired on the next launch and the page moves to /wisc3', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await installNew(page);
  await expect.poll(async () => (await state(page)).dbs, { timeout: 15_000 }).toContain('wisc3-refdata');
  swapInRetire();
  // the installed worker serves this load; its register() finds the new script
  await page.goto('wisc3').catch(() => undefined);
  await expectRetired(page);
  expect((await state(page)).dbs).toContain('wisc3-refdata');
  await context.close();
});

test('R2 an open controlled /new page is moved without any user action', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await installNew(page);
  swapInRetire();
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r!.update())).catch(() => undefined);
  await expectRetired(page);
  await context.close();
});

test('R3 a fresh /new/wisc3 visit loads, then bounces to /wisc3', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  swapInRetire();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  expect((await page.request.get('wisc3')).status()).toBe(200);
  await page.goto('wisc3').catch(() => undefined);
  await expectRetired(page);
  await context.close();
});

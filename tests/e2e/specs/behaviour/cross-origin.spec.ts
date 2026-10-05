import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitControlled, waitReady } from '../helpers/app';
import { resetTmp } from '../helpers/tmp';

// C5: the service worker never handles cross-origin requests.
test('C5 no cross-origin response comes from the service worker; offline reload is clean', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  const fromSw: string[] = [];
  const pageErrors: string[] = [];
  context.on('response', (resp) => {
    if (resp.fromServiceWorker() && new URL(resp.url()).hostname !== 'localhost') fromSw.push(resp.url());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('wisc3');
  await waitControlled(page);
  await page.reload(); // now every request goes through the controlled page
  await waitReady(page);
  expect(fromSw).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await waitReady(page);
  expect(pageErrors).toEqual([]);
  expect(fromSw).toEqual([]);
  await context.close();
});

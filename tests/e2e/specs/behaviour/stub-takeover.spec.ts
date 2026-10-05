import { cpSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitReady } from '../helpers/app';
import { fixturesDir, tmpSpa } from '../helpers/paths';
import { resetTmp } from '../helpers/tmp';

// C4: the previous app's stub service worker (and its blazor-resources cache) is replaced by the new one.
test('C4 new service worker takes over from the old stub', async ({ browser }) => {
  resetTmp();
  for (const name of readdirSync(tmpSpa)) rmSync(join(tmpSpa, name), { recursive: true, force: true });
  cpSync(join(fixturesDir, 'stub'), tmpSpa, { recursive: true });

  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  resetTmp();
  await page.goto('wisc3');

  await expect
    .poll(
      () =>
        page.evaluate(async () => ({
          meta: await caches.has('wisc3-meta-' + location.origin + '/'),
          controller: !!navigator.serviceWorker.controller,
          keys: await caches.keys(),
        })),
      { timeout: 15_000 },
    )
    .toMatchObject({ meta: true, controller: true });
  const keys = await page.evaluate(() => caches.keys());
  expect(keys.filter((k) => k.startsWith('blazor-resources-'))).toEqual([]);
  await waitReady(page);
  await context.close();
});

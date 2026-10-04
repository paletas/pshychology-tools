import { test } from '@playwright/test';
import { expectCase, fillCase, waitControlled, waitReady } from '../helpers/app';
import { blockAds } from '../helpers/adblock';
import { midCase, refData } from '../helpers/cases';
import { resetTmp } from '../helpers/tmp';

// C1: after one online visit the app starts and scores with no network.
test('C1 offline reload scores a full case', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();

  await page.goto('/wisc3');
  await waitControlled(page);
  await waitReady(page);

  await context.setOffline(true);
  await page.reload();
  await waitReady(page);

  const c = midCase(refData());
  await fillCase(page, c.input);
  await expectCase(page, c.input);
  await context.close();
});

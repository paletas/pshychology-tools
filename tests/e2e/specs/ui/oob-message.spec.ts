import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { fillDates, fillRaw, waitReady } from '../helpers/app';
import { resetTmp } from '../helpers/tmp';

// The out-of-bounds message is inline (oob-<Id>) and appears only for the row whose raw score is above its maximum.
test('oob-<Id> is absent before input and shown only for the out-of-bounds row', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('/wisc3');
  await waitReady(page);

  await expect(page.locator('[data-testid^="subtest-row-"]')).toHaveCount(13);
  await expect(page.locator('[data-testid^="oob-"]')).toHaveCount(0);

  // dates give a band (min/max); then max+1 in the first row only
  await fillDates(page, '2024-05-20', '2015-03-14');
  const first = await page.locator('[data-testid^="subtest-row-"]').first().getAttribute('data-testid').then((t) => t!.replace('subtest-row-', ''));
  const max = await page.evaluate((id) => (window as any).__wisc3Debug.snapshot().snapshot!.tests[id].max!, first);
  await expect(page.locator('[data-testid^="oob-"]')).toHaveCount(0);

  await fillRaw(page, first, max + 1);
  const msg = page.getByTestId(`oob-${first}`);
  await expect(msg).toBeVisible();
  await expect(msg).toContainText(String(max));
  await expect(page.locator('[data-testid^="oob-"]')).toHaveCount(1);
  await expect(page.getByTestId(`raw-${first}`)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId(`raw-${first}`)).toHaveAttribute('aria-describedby', /oob-msg-/);

  // back to a valid value: the message goes away
  await fillRaw(page, first, max);
  await expect(page.locator('[data-testid^="oob-"]')).toHaveCount(0);
  await context.close();
});

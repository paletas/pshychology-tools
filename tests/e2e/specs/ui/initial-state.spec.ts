import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitReady } from '../helpers/app';
import { collectErrors } from '../helpers/console';

// REV-12: the state before any input. The dates are empty, so the page explains why nothing is scored.
test('initial state: dates-missing status, empty results, three empty charts, glance dashes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockAds(context);
  const page = await context.newPage();
  const log = collectErrors(page);
  await page.goto('/wisc3');
  await waitReady(page);

  const msg = page.getByTestId('date-msg-both');
  await expect(msg).toHaveAttribute('data-key', 'date.missing.both');
  await expect(msg).toHaveAttribute('role', 'status');
  // no guard message is an alert yet; the one role=alert left is the static AVISO notice (.notice), which is not a guard
  await expect(page.locator('[role="alert"]:not(.notice)')).toHaveCount(0);

  await expect(page.getByTestId('results-empty')).toHaveAttribute('data-reason', 'results.empty.dates');
  await expect(page.locator('[data-testid^="index-row-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="chart-empty-"]')).toHaveCount(3);
  await expect(page.locator('[data-testid^="glance-"]')).toHaveText([/—/, /—/, /—/]);
  await expect(page.locator('[data-testid^="subtest-row-"]')).toHaveCount(13);
  await expect(page.locator('[data-testid^="oob-"]')).toHaveCount(0);
  expect(log.errors).toEqual([]);
  await context.close();
});

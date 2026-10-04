import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { scoreCase } from '../../../../web/src/engine/scoring';
import { blockAds } from '../helpers/adblock';
import { fillCase, waitReady } from '../helpers/app';
import { midCase, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';

// The lookup dialog ("Ver tabela"): wide table with the hit cell of each test, narrow per-test view, empty state.
async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/wisc3');
  await waitReady(page);
}

test.beforeEach(async ({ context }) => {
  await blockAds(context);
});

test('wide: hit cells match the engine; Escape closes', async ({ page }) => {
  const log = collectErrors(page);
  const data = refData();
  const c = midCase(data);
  await open(page, 1440, 900);
  await fillCase(page, c.input);
  await page.getByTestId('show-table').click();
  await expect(page.getByTestId('lookup-dialog')).toBeVisible();
  await expect(page.getByTestId('lookup-table')).toBeVisible();
  await expect(page.getByTestId('lookup-narrow')).toBeHidden();

  const snap = scoreCase(data, c.input);
  const hits = await page.locator('[data-testid^="lk-"][data-hit="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
  expect(hits.length).toBeGreaterThan(0);
  for (const id of hits) {
    const [, test, scaled] = id.split('-');
    expect(String(snap.tests[test].scaled.find((v) => v !== null)), id).toBe(scaled);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lookup-dialog')).toBeHidden();
  expect(log.errors).toEqual([]);
});

test('narrow: chips and next/previous move between tests; close button closes', async ({ page }) => {
  const log = collectErrors(page);
  await open(page, 390, 844);
  await fillCase(page, midCase(refData()).input);
  await page.getByTestId('show-table').click();
  await expect(page.getByTestId('lookup-narrow')).toBeVisible();
  await expect(page.getByTestId('lookup-table')).toBeHidden();
  const chips = page.locator('[data-testid^="lk-chip-"]');
  expect(await chips.count()).toBeGreaterThan(2);
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lk-next').click();
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lk-prev').click();
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await chips.nth(2).click();
  await expect(chips.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid^="lkn-"]').first()).toBeVisible();
  await page.getByTestId('lookup-close').click();
  await expect(page.getByTestId('lookup-dialog')).toBeHidden();
  expect(log.errors).toEqual([]);
});

test('without valid dates the dialog shows lookup-empty and no table', async ({ page }) => {
  const log = collectErrors(page);
  await open(page, 1440, 900);
  await page.getByTestId('show-table').click();
  await expect(page.getByTestId('lookup-dialog')).toBeVisible();
  await expect(page.getByTestId('lookup-empty')).toBeVisible();
  await expect(page.getByTestId('lookup-table')).toHaveCount(0);
  expect(log.errors).toEqual([]);
});

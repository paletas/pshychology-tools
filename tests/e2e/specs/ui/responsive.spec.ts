import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { fillCase, waitReady } from '../helpers/app';
import { midCase, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';

// The redesigned page at phone, tablet and desktop widths: no horizontal overflow, the layout switches where the CSS says it does.
const WIDTHS = [
  { w: 390, h: 844, menu: true, glance: true },
  { w: 820, h: 1180, menu: false, glance: true },
  { w: 1440, h: 900, menu: false, glance: false },
];

for (const { w, h, menu, glance } of WIDTHS) {
  test(`responsive at ${w} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await blockAds(context);
    const page = await context.newPage();
    const log = collectErrors(page);
    await page.goto('/wisc3');
    await waitReady(page);
    await fillCase(page, midCase(refData()).input);
    await expect(page.locator('[data-testid^="index-row-"]')).toHaveCount(6);
    await expect(page.locator('svg[data-testid^="chart-"]')).toHaveCount(3);

    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'horizontal overflow').toBeLessThanOrEqual(w);
    const menuBtn = page.locator('button.menu');
    if (menu) {
      await expect(menuBtn).toBeVisible();
      await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
      await menuBtn.click();
      await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    } else await expect(menuBtn).toBeHidden();
    const strip = page.locator('#glance');
    if (glance) await expect(strip).toBeVisible();
    else await expect(strip).toBeHidden();

    // every raw input stays inside the viewport and at least 24 px tall (WCAG 2.2 target size)
    const boxes = await page.locator('input[data-testid^="raw-"]').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, height: r.height };
      }),
    );
    expect(boxes).toHaveLength(13);
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(w);
      expect(b.height).toBeGreaterThanOrEqual(24);
    }
    expect(log.errors).toEqual([]);
    await context.close();
  });
}

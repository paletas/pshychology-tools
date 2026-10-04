import { expect, test } from '@playwright/test';
import { pt } from '../../../../web/src/i18n/pt';
import { blockAds, isAdUrl } from '../helpers/adblock';
import { waitReady } from '../helpers/app';
import { collectErrors } from '../helpers/console';

// REV-12: the state before any input. The dates are empty, so the page explains why nothing is scored.
// The NEW app is checked at 1280, 768 and 390 px. (The old app only renders from 768 px up, its design never scaled to phones; it is
// not part of this spec, and compare.spec only compares it where it renders.)
const WIDTHS = [
  { w: 1280, h: 900, glance: false, menu: false },
  { w: 768, h: 1024, glance: true, menu: false },
  { w: 390, h: 844, glance: true, menu: true },
];

for (const { w, h, glance, menu } of WIDTHS) {
  test(`initial state at ${w} px: dates-missing status, empty results, three empty charts, glance dashes`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await blockAds(context); // the page's AdSense tag is the one allowed external host (aborted, as in the other specs)
    const page = await context.newPage();
    const log = collectErrors(page);
    const external: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1' && !isAdUrl(r.url())) external.push(r.url());
    });
    await page.goto('wisc3');
    await waitReady(page);

    // top bar, its WISC-III link (behind the menu button on phones) and the notice
    await expect(page.locator('header.topbar')).toBeVisible();
    const menuBtn = page.locator('button.menu');
    if (menu) {
      await expect(menuBtn).toBeVisible();
      await menuBtn.click();
    } else await expect(menuBtn).toBeHidden();
    await expect(page.locator('header.topbar a[aria-current="page"]')).toHaveText('WISC-III');
    await expect(page.locator('.notice')).toBeVisible();
    await expect(page.locator('.notice')).toContainText(pt['Warning']);

    const msg = page.getByTestId('date-msg-both');
    await expect(msg).toHaveAttribute('data-key', 'date.missing.both');
    await expect(msg).toHaveAttribute('role', 'status');
    // no guard message is an alert yet. The notice is the one deliberate role=alert on the page: the static AVISO (.notice),
    // announced on load on purpose. The exclusion is that single element, nothing else.
    await expect(page.locator('[role="alert"]')).toHaveCount(1);
    await expect(page.locator('[role="alert"]')).toHaveClass(/\bnotice\b/);
    await expect(page.locator('[role="alert"]:not(p.notice)')).toHaveCount(0);

    await expect(page.getByTestId('results-empty')).toHaveAttribute('data-reason', 'results.empty.dates');
    await expect(page.locator('[data-testid^="index-row-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="chart-empty-"]')).toHaveCount(3);
    const strip = page.locator('#glance');
    if (glance) {
      await expect(strip).toBeVisible();
      await expect(page.locator('[data-testid^="glance-"]')).toHaveText([/—/, /—/, /—/]);
    } else await expect(strip).toBeHidden();
    await expect(page.locator('[data-testid^="subtest-row-"]')).toHaveCount(13);
    await expect(page.locator('[data-testid^="oob-"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'horizontal overflow').toBeLessThanOrEqual(w);
    expect(external).toEqual([]);
    expect(log.errors).toEqual([]);
    await context.close();
  });
}

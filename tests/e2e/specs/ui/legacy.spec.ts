import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitReady } from '../helpers/app';
import { collectErrors } from '../helpers/console';

// "Versão anterior" link: the URL comes from /config.json (server setting Legacy__Url, unset in this run).
// The service worker is blocked so page.route sees the config request.
const OLD = 'http://127.0.0.1:5300/wisc3';

async function ctxWithConfig(browser: Browser, body: unknown): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await blockAds(context);
  if (body !== undefined) await context.route('**/config.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }));
  return context;
}

test('unset (the real server here): no link', async ({ browser }) => {
  const context = await ctxWithConfig(browser, undefined);
  const page = await context.newPage();
  await page.goto('wisc3');
  await waitReady(page);
  const cfg = await page.evaluate(() => fetch('config.json').then((r) => r.json()));
  expect(cfg.legacyUrl ?? '').toBe('');
  await expect(page.getByTestId('legacy-link')).toHaveCount(0);
  await context.close();
});

for (const bad of ['', 'javascript:alert(1)', 'not a url']) {
  test(`config value ${JSON.stringify(bad)} shows no link`, async ({ browser }) => {
    const context = await ctxWithConfig(browser, { legacyUrl: bad });
    const page = await context.newPage();
    await page.goto('wisc3');
    await waitReady(page);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('legacy-link')).toHaveCount(0);
    await context.close();
  });
}

test('configured: a real link that leaves the app; offline it is disabled with a note', async ({ browser }) => {
  const context = await ctxWithConfig(browser, { legacyUrl: OLD });
  await context.route(`${OLD}**`, (r) => r.fulfill({ contentType: 'text/html', body: '<title>old</title>' }));
  const page = await context.newPage();
  const log = collectErrors(page);
  await page.goto('wisc3');
  await waitReady(page);
  const link = page.getByTestId('legacy-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', OLD);
  await expect(link).toHaveAttribute('rel', /noopener/);
  expect(log.errors).toEqual([]);

  await context.setOffline(true);
  await expect(page.getByTestId('legacy-offline')).toBeVisible();
  await expect(link).toHaveAttribute('aria-disabled', 'true');
  await expect(link).not.toHaveAttribute('href', /.+/);
  await context.setOffline(false);
  await expect(page.getByTestId('legacy-offline')).toHaveCount(0);

  await page.getByTestId('legacy-link').click();
  await page.waitForURL(`${OLD}**`);
  expect(page.url().startsWith(OLD)).toBe(true);
  await context.close();
});

test('on a phone the link sits in the menu', async ({ browser }) => {
  const context = await ctxWithConfig(browser, { legacyUrl: OLD });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('wisc3');
  await waitReady(page);
  await expect(page.getByTestId('legacy-link')).toBeHidden();
  await page.locator('button.menu').click();
  await expect(page.getByTestId('legacy-link')).toBeVisible();
  await context.close();
});

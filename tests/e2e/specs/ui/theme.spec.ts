import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { waitReady } from '../helpers/app';
import { collectErrors } from '../helpers/console';

// Theme: follows the system until chosen; the choice is the single wisc3-theme cookie and survives a reload.
test('system dark by default, toggle writes only the wisc3-theme cookie, reload keeps it', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  await blockAds(context);
  const page = await context.newPage();
  const log = collectErrors(page);
  await page.goto('/wisc3');
  await waitReady(page);

  const toggle = page.getByTestId('theme-toggle');
  expect(await context.cookies()).toEqual([]);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true'); // dark from the system
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const darkBg = await bg();

  await toggle.click(); // -> light
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg()).not.toBe(darkBg);
  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name)).toEqual(['wisc3-theme']);
  const [c] = cookies;
  expect(c.value).toBe('light');
  expect(c.path).toBe('/');
  expect(c.sameSite).toBe('Lax');
  expect(c.expires - Date.now() / 1000).toBeGreaterThan(170 * 86400);
  expect(c.expires - Date.now() / 1000).toBeLessThanOrEqual(180 * 86400 + 60);

  await page.reload();
  await waitReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // the cookie beats the system preference
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click(); // -> dark
  expect((await context.cookies()).map((x) => `${x.name}=${x.value}`)).toEqual(['wisc3-theme=dark']);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(log.errors).toEqual([]);
  await context.close();
});

test('an invalid cookie value is ignored', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'light' });
  await blockAds(context);
  await context.addCookies([{ name: 'wisc3-theme', value: 'purple', url: 'http://localhost:5201/' }]);
  const page = await context.newPage();
  await page.goto('/wisc3');
  await waitReady(page);
  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? '')).not.toBe('purple');
  await context.close();
});

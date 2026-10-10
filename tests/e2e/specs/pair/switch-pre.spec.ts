import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { pt } from '../../../../web/src/i18n/pt';
import { blockAds } from '../helpers/adblock';
import { waitControlled, waitReady } from '../helpers/app';

// PRE-switch (phase 1 state: old app at /, banner, new app at /new). Selected by SWITCH_PHASE=pre; delete at close-out.
const BANNER = '[data-testid="new-app-banner"]';
const SENTENCE =
  'Está disponível uma nova versão da calculadora WISC-III, que também funciona sem ligação à internet. Esta versão continua disponível.';

function originOf(baseURL: string | undefined): string {
  return new URL(baseURL!).origin;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitOldBlazor(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as any).Blazor, undefined, { timeout: 60_000 });
}

// the old form is InteractiveWebAssembly: window.Blazor exists before the runtime boots, dates typed earlier are lost
async function enterOldDates(page: Page, testDate: string, birthDate: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await page.locator('#testDate').fill(testDate);
    await page.locator('#testDate').press('Tab');
    await page.locator('#subjectBirthday').fill(birthDate);
    await page.locator('#subjectBirthday').press('Tab');
    const t = Date.now() + 3_000;
    while (Date.now() < t) {
      if ((await page.locator('#subjectAgeYear').inputValue()) !== '') return;
      await page.waitForTimeout(100);
    }
  }
}

async function assertAppId(page: Page, origin: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const { appId } = await cdp.send('Page.getAppId');
  console.log(`appId: ${appId || '(empty, manifest fallback)'}`);
  if (appId) {
    expect(appId).toBe(`${origin}/new/wisc3`);
  } else {
    const { url, data } = await cdp.send('Page.getAppManifest', {});
    expect(url).toMatch(/\/new\/manifest\.json$/);
    const manifest = JSON.parse(data ?? '{}');
    console.log(`manifest: ${url} start_url=${manifest.start_url} id=${manifest.id}`);
    expect(manifest.id).toBeUndefined();
    expect(manifest.start_url).toBe('wisc3');
  }
}

test('old -> new -> old', async ({ browser, baseURL }, testInfo) => {
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('wisc3');
  await waitOldBlazor(page);
  const banner = page.locator(BANNER);
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(SENTENCE);
  await expect(banner).toContainText('Experimentar a nova versão');
  await expect(banner).toContainText('Fechar');
  const oldCaches = (await page.evaluate(() => caches.keys())).filter((k) => !k.startsWith('wisc3-'));

  await banner.getByRole('link', { name: 'Experimentar a nova versão' }).click();
  await page.waitForURL(`${origin}/new/wisc3`);
  expect(await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).name)).toMatch(/\/new\/wisc3$/);
  await waitControlled(page);
  await waitReady(page);
  const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
  expect(scopes).toContain(`${origin}/new/`);
  expect(scopes).toContain(`${origin}/`);
  const keys = await page.evaluate(() => caches.keys());
  for (const k of oldCaches) expect(keys).toContain(k);

  if (testInfo.project.name === 'phone') {
    // below 640 px the new app's nav (with "Versão anterior") sits behind the Menu button (web/src/index.css:57)
    await page.locator('button.menu').click();
    await expect(page.locator('button.menu')).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(page.getByTestId('legacy-link')).toBeVisible();
  await page.getByTestId('legacy-link').click();
  await page.waitForURL(`${origin}/wisc3`);
  await expect(page.locator(BANNER)).toBeVisible();
  await context.close();
});

test('Fechar hides until reload', async ({ browser }) => {
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('wisc3');
  await waitOldBlazor(page);
  await expect(page.locator(BANNER)).toBeVisible();
  await page.locator('button[aria-label="Fechar aviso"]').click();
  await expect(page.locator(BANNER)).toHaveCount(0);
  await page.reload();
  await expect(page.locator(BANNER)).toBeVisible();
  await context.close();
});

test('old app shows corrected cell C1', async ({ browser }, testInfo) => {
  // the old calculator is hidden below the md breakpoint (WISC3.razor shows "DeviceSizeSmall" instead)
  test.skip(testInfo.project.name === 'phone', 'old calculator form is desktop-only');
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('wisc3');
  await waitOldBlazor(page);
  await enterOldDates(page, '2026-10-04', '2015-04-04');
  await expect(page.locator('#subjectAgeYear')).toHaveValue('11');
  const table = page.locator('table:not(#LookupTableVisualizer table)').first();
  const row = table
    .locator('tbody > tr')
    .filter({ has: page.locator('td:first-child span', { hasText: new RegExp(`^${escapeRe(pt['Test.ImageDisposition'])}$`) }) })
    .first();
  const input = row.locator('input[type=number]');
  await input.fill('38');
  await input.press('Tab');
  await expect
    .poll(async () => (await row.locator('td').allTextContents()).slice(2, 7).map((t) => t.trim()), { timeout: 3_000 })
    .toContain('13');
  await context.close();
});

test('new app App ID and no request outside /new/', async ({ browser, baseURL }) => {
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  const outside: string[] = [];
  const edge: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    if (u.pathname.startsWith('/cdn-cgi/')) {
      edge.push(u.pathname);
      return;
    }
    if (!u.pathname.startsWith('/new/')) outside.push(u.pathname);
  });
  await page.goto(`${origin}/new/wisc3`);
  await waitReady(page);
  expect(outside).toEqual([]);
  console.log(`edge-injected (exempt): ${edge.length} ${JSON.stringify(edge)}`);
  await assertAppId(page, origin);
  await context.close();
});

test('new app offline reload at /new/wisc3', async ({ browser, baseURL }) => {
  test.skip(new URL(baseURL!).hostname !== 'localhost', 'offline reload runs on the local pair only');
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto(`${origin}/new/wisc3`);
  await waitControlled(page);
  await waitReady(page);
  await context.setOffline(true);
  await page.reload();
  await waitReady(page);
  await context.close();
});

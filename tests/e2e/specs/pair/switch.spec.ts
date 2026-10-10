import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { pt } from '../../../../web/src/i18n/pt';
import { blockAds } from '../helpers/adblock';
import { waitControlled, waitReady } from '../helpers/app';

// POST-switch (phase 2 state: new app at / and /new, old app at /legacy). Selected by SWITCH_PHASE=post.
// Runs locally (pair config) and read-only against prod (prod config). Tests tagged @legacy also run alone in the mid phase.
const BANNER = '[data-testid="new-app-banner"]';

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

async function assertRootAppId(page: Page, origin: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const { appId } = await cdp.send('Page.getAppId');
  console.log(`appId: ${appId || '(empty, manifest fallback)'}`);
  if (appId) {
    expect(appId).toBe(`${origin}/wisc3`);
  } else {
    const { url, data } = await cdp.send('Page.getAppManifest', {});
    expect(url).toBe(`${origin}/manifest.json`);
    const manifest = JSON.parse(data ?? '{}');
    console.log(`manifest: ${url} start_url=${manifest.start_url} id=${manifest.id}`);
    expect(manifest.id).toBeUndefined();
    expect(manifest.start_url).toBe('wisc3');
  }
}

test('root serves the new app, App ID /wisc3, no request outside the root app', async ({ browser, baseURL }) => {
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  const paths: string[] = [];
  const edge: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    if (u.pathname.startsWith('/cdn-cgi/')) {
      edge.push(u.pathname);
      return;
    }
    paths.push(u.pathname);
  });
  await page.goto(`${origin}/`);
  await page.waitForURL(`${origin}/wisc3`);
  await waitControlled(page);
  await waitReady(page);
  expect(paths.filter((p) => p.startsWith('/new/') || p.startsWith('/legacy/'))).toEqual([]);
  console.log(`edge-injected (exempt): ${edge.length} ${JSON.stringify(edge)}`);
  await assertRootAppId(page, origin);
  await context.close();
});

test('Versão anterior opens /legacy/wisc3 without banner and Back returns', async ({ browser, baseURL }, testInfo) => {
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('wisc3');
  await waitReady(page);
  if (testInfo.project.name === 'phone') {
    // below 640 px the new app's nav (with "Versão anterior") sits behind the Menu button (web/src/index.css:57)
    await page.locator('button.menu').click();
    await expect(page.locator('button.menu')).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(page.getByTestId('legacy-link')).toHaveAttribute('href', `${origin}/legacy/wisc3`);
  await page.getByTestId('legacy-link').click();
  await page.waitForURL(`${origin}/legacy/wisc3`);
  await waitOldBlazor(page);
  await expect(page.locator(BANNER)).toHaveCount(0);
  await page.goBack();
  await page.waitForURL(`${origin}/wisc3`);
  await waitReady(page);
  await context.close();
});

test('@legacy old app boots under /legacy/ (base, SW scope, nav, requests)', async ({ browser, baseURL }) => {
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  const paths: string[] = [];
  const edge: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    if (u.pathname.startsWith('/cdn-cgi/')) {
      edge.push(u.pathname);
      return;
    }
    paths.push(u.pathname);
  });
  await page.goto('legacy/wisc3');
  await waitOldBlazor(page);
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => document.baseURI)).toBe(`${origin}/legacy/`);
  await expect(page.locator(BANNER)).toHaveCount(0);
  expect(await page.evaluate(() => (document.querySelector('link[rel=manifest]') as HTMLLinkElement).href)).toBe(`${origin}/legacy/manifest.json`);
  expect(await page.evaluate(() => (document.querySelector('a[href="WISC3"]') as HTMLAnchorElement).href)).toBe(`${origin}/legacy/WISC3`);
  await expect
    .poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope)), { timeout: 30_000 })
    .toContain(`${origin}/legacy/`);
  console.log(`edge-injected (exempt): ${edge.length} ${JSON.stringify(edge)}`);
  expect(paths.filter((p) => !p.startsWith('/legacy/'))).toEqual([]);
  await context.close();
});

test('@legacy old app at /legacy shows corrected cell C1', async ({ browser }, testInfo) => {
  // the old calculator is hidden below the md breakpoint (WISC3.razor shows "DeviceSizeSmall" instead)
  test.skip(testInfo.project.name === 'phone', 'old calculator form is desktop-only');
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('legacy/wisc3');
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

test('@legacy bare /legacy redirects to /legacy/wisc3', async ({ browser, baseURL }) => {
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  for (const p of ['/legacy', '/legacy/']) {
    const res = await page.request.get(origin + p, { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(res.status());
    expect(res.headers()['location']).toMatch(/\/legacy\/wisc3$/);
  }
  await context.close();
});

test('/new/wisc3 loads then bounces to /wisc3, which links to /legacy/wisc3', async ({ browser, baseURL }, testInfo) => {
  const origin = originOf(baseURL);
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  const res = await page.request.get(`${origin}/new/wisc3`, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  // the retire worker may interrupt this navigation
  await page.goto(`${origin}/new/wisc3`).catch(() => undefined);
  await expect.poll(() => page.url(), { timeout: 30_000 }).toBe(`${origin}/wisc3`);
  await waitReady(page);
  if (testInfo.project.name === 'phone') {
    await page.locator('button.menu').click();
    await expect(page.locator('button.menu')).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(page.getByTestId('legacy-link')).toHaveAttribute('href', `${origin}/legacy/wisc3`);
  await context.close();
});

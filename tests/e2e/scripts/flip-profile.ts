import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { blockAds } from '../specs/helpers/adblock';
import { e2eDir } from '../specs/helpers/paths';

// Persistent-profile check of the flip (AC C4): `npx tsx scripts/flip-profile.ts <prepare|check>`.
// prepare: fresh profile, visit /wisc3 on the old app (root SW installed). check: after the flip the same profile must
// be taken over by the new app, /legacy/wisc3 must come from the network and the root app must work offline.
const origin = process.env.FLIP_ORIGIN ?? 'https://psy.itssilvestre.com';
const dir = resolve(e2eDir, '.tmp', 'flip-profile');
const ROOT_SW = `${origin}/service-worker.js`;

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function fail(reason: string): never {
  log(`FAIL ${reason}`);
  process.exit(1);
}

const mode = process.argv[2];
if (mode !== 'prepare' && mode !== 'check') fail('usage: flip-profile.ts <prepare|check>');
if (mode === 'prepare') rmSync(dir, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(dir, {
  serviceWorkers: 'allow',
  locale: 'pt-PT',
  viewport: { width: 1280, height: 900 },
});
await blockAds(context);
const page: Page = context.pages()[0] ?? (await context.newPage());

async function ready(timeout: number): Promise<boolean> {
  try {
    await page.waitForSelector('[data-testid="app"][data-ready="true"]', { timeout });
    return true;
  } catch {
    return false;
  }
}

try {
  if (mode === 'prepare') {
    await page.goto(`${origin}/wisc3`);
    await page.waitForFunction(() => !!(window as any).Blazor, undefined, { timeout: 60_000 });
    const deadline = Date.now() + 30_000;
    let scope = '';
    while (Date.now() < deadline && !scope) {
      scope = await page.evaluate(async (sw) => {
        const r = (await navigator.serviceWorker.getRegistrations()).find((x) => x.active?.scriptURL === sw && new URL(x.scope).pathname === '/');
        return r ? r.scope : '';
      }, ROOT_SW);
      if (!scope) await page.waitForTimeout(500);
    }
    if (!scope) fail(`no active registration for ${ROOT_SW} with scope ${origin}/`);
    const base = await page.evaluate(() => document.querySelector('base')?.getAttribute('href'));
    if (base !== '/') fail(`base href is ${base}, expected /`);
    log(`PREPARE OK scope=${scope} base=/`);
  } else {
    await page.goto(`${origin}/wisc3`);
    let taken = false;
    for (let i = 0; i < 12 && !taken; i++) {
      const isReady = (await page.locator('[data-testid="app"][data-ready="true"]').count()) > 0;
      const sw = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
      if (isReady && sw === ROOT_SW) taken = true;
      else {
        await page.waitForTimeout(5_000);
        await page.reload();
      }
    }
    if (!taken) fail('new app did not take over the root service worker within 12 reloads');
    log('CHECK takeover OK');

    const r = await page.goto(`${origin}/legacy/wisc3`);
    if (!r) fail('no response for /legacy/wisc3');
    if (r.fromServiceWorker()) fail('/legacy/wisc3 was served by a service worker');
    if (!(await r.text()).includes('<base href="/legacy/"')) fail('/legacy/wisc3 body has no <base href="/legacy/"');
    log('CHECK legacy-network OK');

    await page.goto(`${origin}/wisc3`);
    if (!(await ready(30_000))) fail('root app not ready before offline');
    await context.setOffline(true);
    await page.reload();
    if (!(await ready(30_000))) fail('root app not ready offline');
    log('CHECK offline OK');
  }
} catch (e) {
  fail(String((e as Error).message ?? e));
} finally {
  await context.close();
}

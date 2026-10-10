import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { blockAds } from '../specs/helpers/adblock';
import { e2eDir } from '../specs/helpers/paths';

// Persistent-profile check of the flip (AC C4): `npx tsx scripts/flip-profile.ts <prepare|check>`.
// prepare: fresh profile, visit /wisc3 on the old app (root SW installed). check: after the flip the same profile must
// be taken over by the new app, /legacy/wisc3 must come from the network and the root app must work offline.
// Retire of the /new install (2.1.0), each mode with its own profile:
// prepare-new: root app and the phase-1 /new app both installed (run before the deploy).
// check-new: after deploy and purge the same profile must be moved to /wisc3, /new/ scope and caches gone, root kept (re-runnable).
// bounce-new: a fresh profile visiting /new/wisc3 gets the page (200), then lands on /wisc3 with no /new/ scope.
// check-root: a fresh profile on /wisc3 gets the root worker, no /new/ scope, and works offline.
const origin = process.env.FLIP_ORIGIN ?? 'https://psy.itssilvestre.com';
const ROOT_SW = `${origin}/service-worker.js`;
const NEW_SW = `${origin}/new/service-worker.js`;

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function fail(reason: string): never {
  log(`FAIL ${reason}`);
  process.exit(1);
}

const profileDirs: Record<string, string> = {
  prepare: 'flip-profile',
  check: 'flip-profile',
  'prepare-new': 'flip-profile-new',
  'check-new': 'flip-profile-new',
  'bounce-new': 'flip-profile-bounce',
  'check-root': 'flip-profile-root',
};
const mode = process.argv[2] ?? '';
if (!Object.hasOwn(profileDirs, mode)) fail('usage: flip-profile.ts <prepare|check|prepare-new|check-new|bounce-new|check-root>');
const dir = resolve(e2eDir, '.tmp', profileDirs[mode]);
if (['prepare', 'prepare-new', 'bounce-new', 'check-root'].includes(mode)) rmSync(dir, { recursive: true, force: true });

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

interface SwState {
  url: string;
  scopes: string[];
  activeByScope: Record<string, string>;
  keys: string[];
  controller: string;
}

async function swState(): Promise<SwState | null> {
  try {
    return await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      const activeByScope: Record<string, string> = {};
      for (const r of regs) activeByScope[r.scope] = r.active?.scriptURL ?? '';
      return {
        url: location.href,
        scopes: regs.map((r) => r.scope).sort(),
        activeByScope,
        keys: await caches.keys(),
        controller: navigator.serviceWorker.controller?.scriptURL ?? '',
      };
    });
  } catch {
    return null; // mid-navigation
  }
}

// polls swState() until `ok` holds or `timeout` ms pass; returns the last state either way
async function pollState(ok: (s: SwState) => boolean, timeout: number, interval = 500): Promise<{ ok: boolean; last: SwState | null }> {
  const deadline = Date.now() + timeout;
  let last: SwState | null = null;
  while (Date.now() < deadline) {
    last = await swState();
    if (last && ok(last)) return { ok: true, last };
    await page.waitForTimeout(interval);
  }
  return { ok: false, last };
}

const newKeys = (s: SwState): string[] => s.keys.filter((k) => k.endsWith('/new/'));
const rootKeysKept = (s: SwState): boolean => s.keys.includes(`wisc3-meta-${origin}/`) && s.keys.includes(`wisc3-precache-v2-${origin}/`);

try {
  if (mode === 'prepare-new') {
    await page.goto(`${origin}/wisc3`);
    await ready(60_000);
    const root = await pollState((s) => s.activeByScope[`${origin}/`] === ROOT_SW, 30_000);
    if (!root.ok) fail(`root worker not active at ${origin}/: ${JSON.stringify(root.last)}`);
    await page.goto(`${origin}/new/wisc3`);
    await ready(60_000);
    const nw = await pollState(
      (s) =>
        s.activeByScope[`${origin}/new/`] === NEW_SW &&
        [`wisc3-meta-${origin}/new/`, `wisc3-precache-v2-${origin}/new/`, `wisc3-meta-${origin}/`, `wisc3-precache-v2-${origin}/`].every((k) => s.keys.includes(k)),
      30_000,
    );
    if (!nw.ok) fail(`/new app not installed as expected: ${JSON.stringify(nw.last)}`);
    const text = await page.evaluate(() => fetch('/new/service-worker.js', { cache: 'no-store' }).then((r) => r.text()));
    if (text.includes('wisc3-retire')) fail('prepare-new must run before the deploy');
    log(`PREPARE-NEW OK root=${origin}/ new=${origin}/new/ newCaches=${newKeys(nw.last!).join(',')}`);
  } else if (mode === 'check-new') {
    await page.goto(`${origin}/healthz`);
    const before = await swState();
    log(`CHECK-NEW before newScope=${before?.scopes.includes(`${origin}/new/`) ? 1 : 0} newCaches=${before ? newKeys(before).length : 0}`);
    let last: SwState | null = null;
    let moved = false;
    for (let attempt = 1; attempt <= 12 && !moved; attempt++) {
      await page.goto(`${origin}/new/wisc3`).catch(() => undefined);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && !moved) {
        last = await swState();
        const isReady = (await page.locator('[data-testid="app"][data-ready="true"]').count().catch(() => 0)) > 0;
        if (
          last &&
          last.url === `${origin}/wisc3` &&
          !last.scopes.includes(`${origin}/new/`) &&
          newKeys(last).length === 0 &&
          rootKeysKept(last) &&
          last.controller === ROOT_SW &&
          isReady
        ) {
          moved = true;
          log(`CHECK-NEW moved OK attempt=${attempt} url=${last.url}`);
          log(`CHECK-NEW root-kept OK keys=${last.keys.filter((k) => k.endsWith(`${origin}/`)).join(',')}`);
        } else await page.waitForTimeout(1_000);
      }
    }
    if (!moved) fail(`/new install was not moved to the root: ${JSON.stringify(last)}`);
  } else if (mode === 'bounce-new') {
    let status = 0;
    page.on('response', (r) => {
      if (!status && r.request().resourceType() === 'document' && r.frame() === page.mainFrame() && r.url() === `${origin}/new/wisc3`) status = r.status();
    });
    await page.goto(`${origin}/new/wisc3`).catch(() => undefined);
    const res = await pollState((s) => s.url === `${origin}/wisc3` && !s.scopes.includes(`${origin}/new/`), 30_000);
    if (!res.ok) fail(`no bounce to ${origin}/wisc3: ${JSON.stringify(res.last)}`);
    if (status !== 200) fail(`/new/wisc3 document status ${status}, expected 200`);
    log(`BOUNCE-NEW OK status=200 url=${origin}/wisc3`);
  } else if (mode === 'check-root') {
    await page.goto(`${origin}/wisc3`);
    await ready(60_000);
    const res = await pollState((s) => s.controller === ROOT_SW, 30_000);
    if (!res.ok) fail(`root worker does not control /wisc3: ${JSON.stringify(res.last)}`);
    if (res.last!.scopes.includes(`${origin}/new/`)) fail(`scope ${origin}/new/ is registered: ${JSON.stringify(res.last)}`);
    await context.setOffline(true);
    await page.reload();
    if (!(await ready(30_000))) fail('root app not ready offline');
    log('CHECK-ROOT OK');
  } else if (mode === 'prepare') {
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

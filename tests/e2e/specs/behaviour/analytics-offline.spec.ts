import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fillCase, waitReady } from '../helpers/app';
import { blockAds } from '../helpers/adblock';
import { midCase, refData } from '../helpers/cases';
import { resetTmp } from '../helpers/tmp';

const WEBSITE_ID = '11111111-1111-1111-1111-111111111111';
const ENDPOINT = 'https://stats.test.invalid/api/send';
const HOST = 'psy.itssilvestre.com';

/** Records of the offline queue, read straight from IndexedDB (null when the database does not exist). */
function queued(page: Page): Promise<Array<{ ts: number }> | null> {
  return page.evaluate(
    () =>
      new Promise<Array<{ ts: number }> | null>((resolve) => {
        const req = indexedDB.open('wisc3-events');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('events')) {
            db.close();
            resolve(null);
            return;
          }
          const all = db.transaction('events').objectStore('events').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as Array<{ ts: number }>);
          };
          all.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
  );
}

test('offline events are queued and replayed with their original timestamp', async () => {
  test.setTimeout(90_000);
  resetTmp();
  // the headless shell ignores the secure-origin flag; the full chromium channel honours it (crypto.subtle / randomUUID need a secure context)
  const browser = await chromium.launch({
    channel: 'chromium',
    args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=http://${HOST}:5201`],
  });
  try {
    const context = await browser.newContext({ locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block' });
    await blockAds(context);
    const bodies: any[] = [];
    let offline = false; // routes answer before the network, so context.setOffline alone would not stop the POST
    await context.route('**/config.json', (route) =>
      route.fulfill({ json: { legacyUrl: null, analytics: { websiteId: WEBSITE_ID, endpoint: ENDPOINT } } }),
    );
    await context.route(ENDPOINT, (route) => {
      if (offline) return route.abort('internetdisconnected');
      bodies.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({ status: 200, body: '{}' });
    });
    const page = await context.newPage();
    await page.goto(`http://${HOST}:5201/wisc3`);
    await waitReady(page);
    await expect.poll(() => bodies.some((b) => !b.payload?.name), { timeout: 15_000 }).toBe(true);

    await context.setOffline(true);
    offline = true;
    const c = midCase(refData());
    await fillCase(page, c.input);
    await page.getByTestId('start-fresh').click();

    await expect.poll(async () => (await queued(page))?.length ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
    const offlineRecords = (await queued(page))!;
    const tsList = offlineRecords.map((r) => r.ts);
    expect(bodies.filter((b) => b.payload?.name).length).toBe(0);

    await context.setOffline(false);
    offline = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await queued(page))?.length ?? -1, { timeout: 15_000 }).toBe(0);

    const events = bodies.filter((b) => b.payload?.name);
    for (const name of ['calc_started', 'results_shown', 'sheet_left', 'sheet_reset']) {
      const e = events.find((b) => b.payload.name === name);
      expect(e, name).toBeTruthy();
      expect(Number.isInteger(e.payload.timestamp), `${name} timestamp is an integer`).toBe(true);
      expect(tsList, `${name} keeps its queued timestamp`).toContain(e.payload.timestamp);
      expect(e.payload.data.offline).toBe(true);
      expect(e.payload.data.app_version).toBe('2.3.0');
      expect(e.payload.hostname).toBe(HOST);
      expect(e.payload).not.toHaveProperty('screen');
    }

    // privacy: no input value (dates, raw scores) in any payload
    const all = JSON.stringify(bodies);
    expect(all).not.toContain(c.input.testDate);
    expect(all).not.toContain(c.input.birthDate);
    for (const e of events) {
      for (const [k, v] of Object.entries(e.payload.data ?? {})) {
        expect(['string', 'boolean'], `${e.payload.name}.${k}`).toContain(typeof v);
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
});

test('no analytics on localhost', async ({ page }) => {
  resetTmp();
  const posts: string[] = [];
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { legacyUrl: null, analytics: { websiteId: WEBSITE_ID, endpoint: ENDPOINT } } }),
  );
  await page.route(ENDPOINT, (route) => {
    posts.push(route.request().url());
    return route.fulfill({ status: 200, body: '{}' });
  });
  await page.goto('wisc3');
  await waitReady(page);
  await fillCase(page, midCase(refData()).input);
  await page.getByTestId('start-fresh').click();
  await page.waitForTimeout(1500);
  expect(posts).toHaveLength(0);
  expect((await queued(page)) ?? []).toHaveLength(0);
});

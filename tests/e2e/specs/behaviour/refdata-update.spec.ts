import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { debugState, expectCase, fillCase, waitControlled, waitReady } from '../helpers/app';
import { midCase, refData } from '../helpers/cases';
import { dataDir, tmpData } from '../helpers/paths';
import { resetTmp } from '../helpers/tmp';

// current dataVersion (the .tmp/data copy made by prepare-tmp, else data/) plus a suffix
const versionFile = existsSync(join(tmpData, 'version.json')) ? join(tmpData, 'version.json') : join(dataDir, 'version.json');
const NEW_VERSION = `${JSON.parse(readFileSync(versionFile, 'utf8')).dataVersion}-update-test`;

function bumpDataVersion(version: string): void {
  const file = join(tmpData, 'version.json');
  const v = JSON.parse(readFileSync(file, 'utf8'));
  v.dataVersion = version;
  writeFileSync(file, JSON.stringify(v, null, 2) + '\n');
}

/** A partially filled case (dates and the first half of the raws). */
function halfCase() {
  const c = midCase(refData());
  const ids = Object.keys(c.input.raw).slice(0, 4);
  return { c, ids };
}

async function startOnline(browser: import('@playwright/test').Browser, opts: { block?: boolean } = {}) {
  const context = await browser.newContext(opts.block ? { serviceWorkers: 'block' } : {});
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('wisc3');
  if (!opts.block) await waitControlled(page);
  await waitReady(page);
  return { context, page };
}

async function oldVersionKept(page: Page, oldVersion: string): Promise<void> {
  await page.waitForTimeout(1500); // let the background update attempt finish
  await expect(page.getByTestId('data-updated-banner')).toHaveCount(0);
  expect((await debugState(page)).dataVersion).toBe(oldVersion);
  const c = midCase(refData());
  await fillCase(page, c.input);
  await expectCase(page, c.input);
  await expect(page.getByTestId('data-version')).toHaveText(`Dados: ${oldVersion}`);
}

test('C2 update: banner, old data until start-fresh, then new data', async ({ browser }) => {
  resetTmp();
  const { context, page } = await startOnline(browser);
  const oldVersion = (await debugState(page)).dataVersion!;
  expect(oldVersion).not.toBe(NEW_VERSION);

  bumpDataVersion(NEW_VERSION);
  await page.reload();
  await waitReady(page);

  const { c, ids } = halfCase();
  await fillCase(page, c.input, ids);
  await expect(page.getByTestId('data-updated-banner')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('data-version')).toHaveText(`Dados: ${oldVersion}`);
  // mid-case values are unchanged by the update: the subset of raws entered still scores with the old data
  const partial = { ...c.input, raw: Object.fromEntries(ids.map((id) => [id, c.input.raw[id]])) };
  await expectCase(page, partial);

  await page.getByTestId('start-fresh').click();
  await expect(page.getByTestId('data-version')).toHaveText(`Dados: ${NEW_VERSION}`);
  await context.close();
});

test('C2 corrupt bundle body is rejected', async ({ browser }) => {
  resetTmp();
  const { context, page } = await startOnline(browser, { block: true });
  const oldVersion = (await debugState(page)).dataVersion!;
  bumpDataVersion(NEW_VERSION);
  let hit = false;
  await page.route('**/api/reference/bundle/**', async (route) => {
    hit = true;
    const resp = await route.fetch();
    await route.fulfill({ response: resp, body: (await resp.text()) + ' ' });
  });
  await page.reload();
  await waitReady(page);
  await expect.poll(() => hit).toBe(true);
  await oldVersionKept(page, oldVersion);
  await context.close();
});

test('C2 bundle with invalid schema is rejected', async ({ browser }) => {
  resetTmp();
  const { context, page } = await startOnline(browser, { block: true });
  const oldVersion = (await debugState(page)).dataVersion!;

  // a bundle whose sha matches its body but which lacks `indices`
  const manifestRes = await page.request.get('api/reference/manifest');
  const manifest = await manifestRes.json();
  // manifest.url is relative to the manifest URL
  const bundle = await (await page.request.get(new URL(manifest.url, manifestRes.url()).href)).json();
  delete bundle.indices;
  bundle.dataVersion = NEW_VERSION;
  const body = JSON.stringify(bundle);
  const sha = createHash('sha256').update(body).digest('hex');
  let hit = false;
  await page.route('**/api/reference/manifest', (route) =>
    route.fulfill({
      json: { schemaVersion: 1, dataVersion: NEW_VERSION, sha256: sha, bytes: Buffer.byteLength(body), url: `bundle/${sha}.json` },
    }),
  );
  await page.route(`**/api/reference/bundle/${sha}.json`, (route) => {
    hit = true;
    return route.fulfill({ body, contentType: 'application/json' });
  });
  await page.reload();
  await waitReady(page);
  await expect.poll(() => hit).toBe(true);
  await oldVersionKept(page, oldVersion);
  await context.close();
});

test('C2 interrupted bundle download keeps the old data', async ({ browser }) => {
  resetTmp();
  const { context, page } = await startOnline(browser, { block: true });
  const oldVersion = (await debugState(page)).dataVersion!;
  bumpDataVersion(NEW_VERSION);
  let hit = false;
  await page.route('**/api/reference/bundle/**', (route) => {
    hit = true;
    return route.abort('failed');
  });
  await page.reload();
  await waitReady(page);
  await expect.poll(() => hit).toBe(true);
  await oldVersionKept(page, oldVersion);
  await context.close();
});

test('C2 offline: no manifest request is made', async ({ browser }) => {
  resetTmp();
  const { context, page } = await startOnline(browser);
  const manifestRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/reference/manifest')) manifestRequests.push(r.url());
  });
  await context.setOffline(true);
  await page.reload();
  await waitReady(page);
  await page.waitForTimeout(1500);
  expect(manifestRequests).toEqual([]);
  await context.close();
});

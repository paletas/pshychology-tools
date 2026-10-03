import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { blockAds } from '../helpers/adblock';
import { fillCase, fillRaw, waitControlled, waitReady } from '../helpers/app';
import { midCase, refData } from '../helpers/cases';
import { tmpSpa } from '../helpers/paths';
import { resetTmp } from '../helpers/tmp';

// C3: a new service worker waits; the banner offers it; nothing reloads until the user clicks.
test('C3 update banner, no automatic reload, one reload on click', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('/wisc3');
  await waitControlled(page);
  await waitReady(page);

  const c = midCase(refData());
  const ids = Object.keys(c.input.raw).slice(0, 3);
  await fillCase(page, c.input, ids);

  appendFileSync(join(tmpSpa, 'service-worker.js'), '\n// v2');
  let navigations = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++;
  });
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r!.update()));

  await expect(page.getByText('Nova versão disponível')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(5000);
  expect(navigations).toBe(0);
  await expect(page.locator('#testDate')).toHaveValue(c.input.testDate);
  for (const id of ids) await expect(page.getByTestId(`raw-${id}`)).toHaveValue(String(c.input.raw[id]));

  await page.getByRole('button', { name: 'Atualizar' }).click();
  await expect.poll(() => navigations, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(3000);
  expect(navigations).toBe(1);
  await waitReady(page);
  await fillRaw(page, ids[0], c.input.raw[ids[0]]!); // the page is alive after the reload
  await context.close();
});

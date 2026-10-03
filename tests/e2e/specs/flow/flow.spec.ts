import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { scoreCase } from '../../../../web/src/engine/scoring';
import { blockAds } from '../helpers/adblock';
import { cellMismatches, fillCase, readCells, waitControlled, waitReady } from '../helpers/app';
import { canvasInkRatio, NEW_CHARTS } from '../helpers/canvas';
import { flowCases, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';
import { expectedArrows, expectedCells } from '../helpers/format';
import { reportsDir } from '../helpers/paths';
import { resetTmp } from '../helpers/tmp';

// C7: six cases entered like a user would (fill + Tab), every cell checked against scoreCase, charts non-blank, no console errors.
test('C7 flow: six cases, cells, charts, no console errors', async ({ browser }, testInfo) => {
  resetTmp();
  const data = refData();
  const cases = flowCases(data);
  expect(cases).toHaveLength(6);

  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  const log = collectErrors(page);
  await page.goto('/wisc3');
  await waitControlled(page);
  await waitReady(page);

  for (const [index, c] of cases.entries()) {
    log.clear();
    await fillCase(page, c.input);

    const snap = scoreCase(data, c.input);
    const expected = expectedCells(data, snap);
    await expect.poll(() => cellMismatches(page, expected), { timeout: 10_000, message: c.name }).toEqual([]);

    // classification arrows only for entries that exist
    const cells = await readCells(page);
    for (const name of Object.keys(snap.indices)) {
      const arrow = await page.getByTestId(`index-class-${name}`).count();
      expect(arrow, `${c.name} arrow ${name}`).toBe(expectedArrows(snap).includes(name) ? 1 : 0);
    }
    expect(cells['sum-complete'], c.name).toBe(String(snap.sums.complete));

    if (c.name.startsWith('C1')) {
      // manual-confirmed correction: scaled 13 in both columns
      await expect(page.getByTestId('scaled-ImageDisposition-realization')).toHaveText('13');
      await expect(page.getByTestId('scaled-ImageDisposition-perceptiveOrganization')).toHaveText('13');
    }

    expect(snap.indicesShown, `${c.name} shows indices`).toBe(true);
    for (const chart of NEW_CHARTS) {
      const canvas = page.getByTestId(chart);
      await expect.poll(() => canvasInkRatio(canvas), { timeout: 15_000, message: `${c.name} ${chart}` }).toBeGreaterThanOrEqual(0.01);
    }
    expect(log.errors, `${c.name} console errors`).toEqual([]);

    if (index === 0) {
      const dir = join(reportsDir, 'screens');
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${testInfo.project.name}.png`), fullPage: true });
      if (testInfo.project.name === 'flow-chromium-phone') {
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width).toBeLessThanOrEqual(375);
      }
    }

    await page.getByTestId('start-fresh').click();
  }
  await context.close();
});

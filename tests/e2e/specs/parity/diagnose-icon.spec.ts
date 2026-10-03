import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blockAds } from '../helpers/adblock';
import { fillDates, fillRaw, waitReady } from '../helpers/app';
import { resetTmp } from '../helpers/tmp';
import { reportsDir, webDist } from '../helpers/paths';

// REV-8 step 52: why is the out-of-bounds icon visible before any input? Records computed display, class list,
// snapshot state and the CSS rule order, then asserts the fixed behaviour.
const readRows = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const snap = (window as any).__wisc3Debug.snapshot().snapshot!;
    return Array.from(document.querySelectorAll('[data-testid^="subtest-row-"]')).map((tr) => {
      const id = tr.getAttribute('data-testid')!.replace('subtest-row-', '');
      const svg = tr.querySelector('svg')!;
      return { id, display: getComputedStyle(svg).display, cls: svg.getAttribute('class'), outOfBounds: snap.tests[id].outOfBounds };
    });
  });

test('warning icons are hidden before input and shown only for the out-of-bounds row', async ({ browser }) => {
  resetTmp();
  const context = await browser.newContext();
  await blockAds(context);
  const page = await context.newPage();
  await page.goto('/wisc3');
  await waitReady(page);

  const rows = await readRows(page);
  const cssFile = readdirSync(resolve(webDist, 'assets')).find((f) => f.endsWith('.css'))!;
  const css = readFileSync(resolve(webDist, 'assets', cssFile), 'utf8');
  const iHidden = css.indexOf('.hidden{');
  const iInline = css.indexOf('.inline{');

  // dates give a band (min/max); then max+1 in the first row only
  await fillDates(page, '2024-05-20', '2015-03-14');
  const first = rows[0].id;
  const max = await page.evaluate((id) => (window as any).__wisc3Debug.snapshot().snapshot!.tests[id].max!, first);
  await fillRaw(page, first, max + 1);
  const after = await readRows(page);

  const cascade = rows.some((r) => r.cls?.split(/\s+/).includes('hidden') && r.display !== 'none');
  const state = rows.some((r) => r.outOfBounds);
  const lines = [
    '# Warning icon diagnosis (REV-8 step 52)',
    '',
    `CSS rule order in ${cssFile}: index of \`.hidden{\` = ${iHidden}, index of \`.inline{\` = ${iInline} (the later rule wins when both classes are present).`,
    '',
    '| row | class | computed display | snapshot outOfBounds |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.cls} | ${r.display} | ${r.outOfBounds} |`),
    '',
    `Cause: cascade (hidden class present but display != none) = ${cascade}; state (outOfBounds true for empty input) = ${state}.`,
    '',
    `After dates + raw ${max + 1} (max+1) in ${first}:`,
    '',
    '| row | computed display | outOfBounds |',
    '|---|---|---|',
    ...after.map((r) => `| ${r.id} | ${r.display} | ${r.outOfBounds} |`),
  ];
  writeFileSync(resolve(reportsDir, 'diagnose-icon.md'), lines.join('\n') + '\n');

  expect(rows.length).toBe(13);
  for (const r of rows) {
    expect(r.outOfBounds, r.id).toBe(false);
    expect(r.display, r.id).toBe('none');
  }
  for (const r of after) {
    if (r.id === first) {
      expect(r.outOfBounds).toBe(true);
      expect(r.display).not.toBe('none');
    } else expect(r.display, r.id).toBe('none');
  }
});

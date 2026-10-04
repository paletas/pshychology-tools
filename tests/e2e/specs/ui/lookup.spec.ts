import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { birthFor } from '../../../../web/test/shared/load';
import { ptNew } from '../../../../web/src/i18n/pt-new';
import { pt } from '../../../../web/src/i18n/pt';
import { blockAds } from '../helpers/adblock';
import { fillCase, fillDates, waitReady } from '../helpers/app';
import { TEST_DATE, midCase, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';
import { reportsDir } from '../helpers/paths';

// V24. The lookup dialog ("Ver Tabela"), tests (a)-(j):
//  (a) wide: opens as a modal dialog (labelled, focus inside), table for the child's band, narrow view absent
//  (b) wide: highlights: exactly one hit per test with a raw score, the hit equals the data's range, non-hits are not marked, the
//      hit colours contrast >= 4.5:1 (light and dark); a second case moves the highlights
//  (c) wide: every cell equals the raw range of the data for that band (19 rows x 13 tests), average band rows 7-13 marked
//  (d) wide: sticky header rows and sticky first column while the table scrolls inside the dialog
//  (e) guard empty state: no dates / age out of range -> lookup-empty with Table.NoTableDisplay, no table, no print button
//  (f) narrow (390): chips, previous/next (wrapping), 19 rows with the hit and the "given raw / scaled" line equal to the data
//  (g) keyboard and closing: focus stays in the dialog while tabbing, Escape, close button and backdrop click close it, focus returns
//  (h) print: the print button sets the print layout (only the dialog, black hit cells, fits the paper), afterprint restores
//  (i) axe (WCAG 2.2 A/AA, colour contrast) with the dialog open, wide and narrow, light and dark
//  (j) fit: at 7 widths the dialog stays inside the viewport, the page does not overflow, 44 px controls, screenshots
type Range = [number, number];
const range = (r?: Range) => (r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]} - ${r[1]}`) : '');
const sFor = (scaled: Record<string, Range>, raw: number) => Object.entries(scaled).find(([, r]) => raw >= r[0] && raw <= r[1])?.[0] ?? null;

const SHOT = join(reportsDir, 'screens/lookup');
async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/wisc3');
  await waitReady(page);
}
async function show(page: Page) {
  await page.getByTestId('show-table').click();
  await expect(page.getByTestId('lookup-dialog')).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await blockAds(context);
});

test('(a) wide: modal dialog with the band table, focus inside, narrow view absent', async ({ page }) => {
  const log = collectErrors(page);
  const data = refData();
  const c = midCase(data);
  await open(page, 1440, 900);
  await fillCase(page, c.input);
  await show(page);
  const dlg = page.getByTestId('lookup-dialog');
  expect(await dlg.evaluate((d: HTMLDialogElement) => d.matches(':modal'))).toBe(true);
  await expect(dlg).toHaveAttribute('aria-labelledby', 'lk-title');
  await expect(page.locator('#lk-title')).toHaveText(ptNew['lookup.title']);
  await expect(page.getByTestId('lookup-table')).toBeVisible();
  await expect(page.getByTestId('lookup-table')).toHaveAttribute('data-band', '10y00m');
  await expect(page.getByTestId('lookup-narrow')).toBeHidden();
  await expect(page.getByTestId('lookup-print')).toBeVisible();
  await expect(page.locator('.lk-sub')).toContainText('10 anos');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  // the page behind is inert while the modal is open
  expect(await page.getByTestId('raw-Information').evaluate((e) => e.matches(':modal') || !!e.closest('dialog'))).toBe(false);
  expect(log.errors).toEqual([]);
});

test('(b) wide: the highlighted cells are the data ranges holding each raw score; contrast >= 4.5', async ({ page, browser }) => {
  const log = collectErrors(page);
  const data = refData();
  const c = midCase(data);
  await open(page, 1440, 900);
  await fillCase(page, c.input);
  await show(page);
  const hits = async () => page.locator('[data-testid^="lk-"][data-hit="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
  const expected = (raw: Record<string, number>) =>
    data.tests.map((t) => `lk-${t.id}-${sFor(data.subtests['10y00m'][t.id].scaled, raw[t.id])}`).sort();
  expect((await hits()).sort()).toEqual(expected(c.input.raw as Record<string, number>));
  // each hit cell holds the raw score; no other cell of a hit column is marked
  for (const t of data.tests) {
    const cells = page.locator(`[data-testid^="lk-${t.id}-"]`);
    await expect(cells).toHaveCount(19);
    expect(await cells.evaluateAll((els) => els.filter((e) => e.getAttribute('data-hit') === 'true').length), t.id).toBe(1);
  }
  const hit = page.locator('[data-testid^="lk-"][data-hit="true"]').first();
  const colours = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const rgb = (c: string) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; const v = ctx.fillStyle as string; return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const h = document.querySelector('[data-hit="true"]') as HTMLElement;
    const n = document.querySelector('[data-hit="false"]') as HTMLElement;
    const sh = getComputedStyle(h); const sn = getComputedStyle(n);
    return { hitBg: sh.backgroundColor, nonBg: sn.backgroundColor, hit: ratio(sh.color, sh.backgroundColor), key: getComputedStyle(document.querySelector('.lk-key')!).backgroundColor };
  });
  expect(colours.hit).toBeGreaterThanOrEqual(4.5);
  expect(colours.hitBg).not.toBe(colours.nonBg);
  expect(colours.key, 'the hint key swatch is the hit colour').toBe(colours.hitBg);
  await expect(hit).toHaveText(/^\d+( - \d+)?$/);

  // another case: the marks move; a cleared raw leaves its column without a mark
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lookup-dialog')).toBeHidden();
  const low = Object.fromEntries(data.tests.map((t) => [t.id, data.subtests['10y00m'][t.id].min]));
  await fillCase(page, { ...c.input, raw: low });
  await show(page);
  expect((await hits()).sort()).toEqual(expected(low));
  await page.keyboard.press('Escape');
  await page.getByTestId('raw-Information').fill('');
  await page.getByTestId('raw-Information').press('Tab');
  await show(page);
  expect((await hits()).some((id) => id.startsWith('lk-Information-'))).toBe(false);
  expect(await page.locator('[data-testid^="lk-Similarities-"][data-hit="true"]').count()).toBe(1);

  // dark theme: same marks, contrast still >= 4.5
  const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await blockAds(dark);
  const dp = await dark.newPage();
  await dp.goto('/wisc3');
  await waitReady(dp);
  await fillCase(dp, c.input);
  await show(dp);
  const dk = await dp.evaluate(() => {
    const h = document.querySelector('[data-hit="true"]') as HTMLElement;
    const s = getComputedStyle(h);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const rgb = (c: string) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; const v = ctx.fillStyle as string; return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const [x, y] = [lum(rgb(s.color)), lum(rgb(s.backgroundColor))].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  });
  expect(dk).toBeGreaterThanOrEqual(4.5);
  await dark.close();
  expect(log.errors).toEqual([]);
});

test('(c) wide: all 19 x 13 cells equal the data ranges; rows 7-13 are the average band', async ({ page }) => {
  const log = collectErrors(page);
  const data = refData();
  await open(page, 1440, 900);
  await fillCase(page, midCase(data).input);
  await show(page);
  const texts = await page.locator('[data-testid^="lk-"][data-hit]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-testid')!, e.textContent!])));
  expect(Object.keys(texts)).toHaveLength(19 * 13);
  for (const t of data.tests) {
    for (let s = 1; s <= 19; s++) expect(texts[`lk-${t.id}-${s}`], `${t.id} ${s}`).toBe(range(data.subtests['10y00m'][t.id].scaled[String(s)]));
  }
  const rows = page.locator('table.lk tbody tr');
  await expect(rows).toHaveCount(19);
  expect(await rows.evaluateAll((trs) => trs.map((r, i) => r.classList.contains('avg') === (i + 1 >= 7 && i + 1 <= 13)))).toEqual(Array(19).fill(true));
  // scaled score at both ends of every row, header groups with the existing strings
  expect(await page.locator('table.lk tbody tr').first().locator('th').allTextContents()).toEqual(['1', '1']);
  await expect(page.locator('table.lk thead')).toContainText(pt['TableHeader.VerbalTests']);
  await expect(page.locator('table.lk thead')).toContainText(pt['TableHeader.RealizationTests']);
  await expect(page.locator('table.lk caption')).toHaveText(/Resultado bruto para cada resultado padronizado, banda dos 10 anos/);
  expect(log.errors).toEqual([]);
});

test('(d) wide: header rows and first column stay put while the table scrolls', async ({ page }) => {
  const log = collectErrors(page);
  await open(page, 768, 500); // narrow enough for a horizontal scroll, short enough for a vertical one, still the wide layout
  await fillCase(page, midCase(refData()).input);
  await show(page);
  const wrap = page.locator('.lk-wide');
  await expect(wrap).toBeVisible();
  const dims = await wrap.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }));
  expect(dims.sw, 'scrolls horizontally').toBeGreaterThan(dims.cw);
  expect(dims.sh, 'scrolls vertically').toBeGreaterThan(dims.ch);
  await expect(wrap).toHaveAttribute('tabindex', '0');
  await expect(wrap).toHaveAttribute('aria-label', ptNew['lookup.scroll']);
  const colLeft = () => page.evaluate(() => document.querySelector('table.lk tbody tr:nth-child(15) th')!.getBoundingClientRect().left);
  const left0 = await colLeft();
  await wrap.evaluate((e) => { e.scrollTop = 220; e.scrollLeft = 260; });
  await page.waitForTimeout(100);
  const m = await page.evaluate(() => {
    const w = document.querySelector('.lk-wide')!.getBoundingClientRect();
    const th1 = document.querySelector('table.lk thead tr:first-child th.grp')!.getBoundingClientRect();
    const th2 = document.querySelector('table.lk thead tr:nth-child(2) th')!.getBoundingClientRect();
    const row = document.querySelector('table.lk tbody tr:nth-child(15) th')!.getBoundingClientRect();
    return { wTop: w.top, wLeft: w.left, th1: th1.top, th2: th2.top, th2h: th2.height, row: row.left };
  });
  expect(Math.abs(m.th1 - m.wTop), 'group header row sticks at the top').toBeLessThanOrEqual(2);
  expect(m.th2 - m.wTop, 'second header row sticks under it').toBeGreaterThanOrEqual(20);
  expect(m.th2 - m.wTop).toBeLessThanOrEqual(60);
  expect(Math.abs(m.row - left0), 'scaled column did not move with the horizontal scroll').toBeLessThanOrEqual(1);
  expect(m.row - m.wLeft).toBeLessThanOrEqual(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
  expect(log.errors).toEqual([]);
});

test('(e) guard empty state: no dates, and an age out of range, show lookup-empty and no table', async ({ page }) => {
  const log = collectErrors(page);
  await open(page, 1440, 900);
  // no dates
  await show(page);
  await expect(page.getByTestId('lookup-empty')).toHaveText(pt['Table.NoTableDisplay']);
  await expect(page.getByTestId('lookup-table')).toHaveCount(0);
  await expect(page.getByTestId('lookup-narrow')).toHaveCount(0);
  await expect(page.getByTestId('lookup-print')).toHaveCount(0);
  await expect(page.getByTestId('lookup-close')).toBeVisible();
  await expect(page.locator('.lk-sub')).toHaveCount(0);
  await page.getByTestId('lookup-close').click();
  await expect(page.getByTestId('lookup-dialog')).toBeHidden();
  // too young (5 years): still empty
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [5, 0, 0]));
  await show(page);
  await expect(page.getByTestId('lookup-empty')).toBeVisible();
  await expect(page.getByTestId('lookup-table')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // too old (17 years)
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [17, 1, 0]));
  await show(page);
  await expect(page.getByTestId('lookup-empty')).toBeVisible();
  await expect(page.getByTestId('lookup-table')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // a valid age brings the table back
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [10, 2, 0]));
  await show(page);
  await expect(page.getByTestId('lookup-table')).toBeVisible();
  await expect(page.getByTestId('lookup-empty')).toHaveCount(0);
  expect(log.errors).toEqual([]);
});

test('(f) narrow: chips, previous/next with wrap-around, 19 rows, hit and given line equal the data', async ({ page }) => {
  const log = collectErrors(page);
  const data = refData();
  const c = midCase(data);
  await open(page, 390, 844);
  await fillCase(page, c.input);
  await show(page);
  await expect(page.getByTestId('lookup-narrow')).toBeVisible();
  await expect(page.getByTestId('lookup-table')).toBeHidden();
  await expect(page.getByTestId('lookup-print')).toBeHidden();
  const chips = page.locator('[data-testid^="lk-chip-"]');
  await expect(chips).toHaveCount(13);
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid^="lkn-"]')).toHaveCount(19);
  // every chip: its list equals the data and marks the hit; the given line shows the raw and the scaled values
  for (let i = 0; i < 13; i++) {
    await chips.nth(i).click();
    await expect(chips.nth(i)).toHaveAttribute('aria-pressed', 'true');
    expect(await chips.evaluateAll((els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').length)).toBe(1);
    const id = (await chips.nth(i).getAttribute('data-testid'))!.replace('lk-chip-', ''); // the chip order is the dialog's (verbal, then realization)
    expect(data.tests.map((t) => t.id)).toContain(id);
    const table = data.subtests['10y00m'][id].scaled;
    const raw = c.input.raw[id] as number;
    for (let s = 1; s <= 19; s++) {
      const li = page.getByTestId(`lkn-${s}`);
      await expect(li, `${id} ${s}`).toHaveText(new RegExp(`^${s}${range(table[String(s)]) || '—'}$`));
      await expect(li).toHaveAttribute('data-hit', String(sFor(table, raw) === String(s)));
    }
    await expect(page.locator('.lk-given')).toContainText(`${ptNew['lookup.given']} ${raw}`);
    await expect(page.locator('.lk-given')).toContainText(`${ptNew['lookup.givenScaled']} ${sFor(table, raw)}`);
  }
  // previous / next wrap around
  await chips.nth(12).click();
  await page.getByTestId('lk-next').click();
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lk-prev').click();
  await expect(chips.nth(12)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lk-prev').click();
  await expect(chips.nth(11)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByTestId('lookup-close').click();
  await expect(page.getByTestId('lookup-dialog')).toBeHidden();
  expect(log.errors).toEqual([]);
});

test('(g) keyboard and closing: focus stays inside, Escape / close / backdrop close, focus returns', async ({ page }) => {
  const log = collectErrors(page);
  await open(page, 1440, 900);
  await fillCase(page, midCase(refData()).input);
  const opener = page.getByTestId('show-table');
  const dlg = page.getByTestId('lookup-dialog');
  // keyboard open
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(dlg).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('dialog')), `Tab ${i}`).toBe(true); // body = focus went to the browser UI; never the page behind
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('dialog')), `Shift+Tab ${i}`).toBe(true);
  }
  // the scrollable table region is reachable with the keyboard
  await page.locator('.lk-wide').focus();
  expect(await page.evaluate(() => document.activeElement?.classList.contains('lk-wide'))).toBe(true);
  // Escape
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(opener).toBeFocused();
  // close button
  await opener.click();
  await expect(dlg).toBeVisible();
  await page.getByTestId('lookup-close').click();
  await expect(dlg).toBeHidden();
  await expect(opener).toBeFocused();
  // backdrop click (outside the dialog box)
  await opener.click();
  await expect(dlg).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(dlg).toBeHidden();
  // a click inside does not close it
  await opener.click();
  await page.locator('#lk-title').click();
  await expect(dlg).toBeVisible();
  // narrow: Escape closes too
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('lookup-narrow')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  expect(log.errors).toEqual([]);
});

for (const [name, w, h] of [['A4 landscape', 1123, 794], ['A4 portrait', 794, 1123]] as const) {
  test(`(h) print: the lookup prints alone, black hit cells, fits ${name}`, async ({ page }) => {
    const log = collectErrors(page);
    const data = refData();
    await open(page, 1440, 900);
    await fillCase(page, midCase(data).input);
    await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed++; }; });
    await show(page);
    await page.getByTestId('lookup-print').click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await expect(page.locator('body')).toHaveClass(/print-lookup/);
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ media: 'print' });
    for (const sel of ['main > h1', '.lede', '.layout', '.charts', '.topbar', '#glance', '.foot', '.lk-actions', '.lk-narrow']) await expect(page.locator(sel).first(), sel).toBeHidden();
    await expect(page.getByTestId('lookup-table')).toBeVisible();
    await expect(page.locator('.lk-head h2')).toBeVisible();
    const hit = await page.locator('[data-hit="true"]').first().evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }));
    expect(hit).toEqual({ bg: 'rgb(0, 0, 0)', fg: 'rgb(255, 255, 255)' });
    const fit = await page.evaluate(() => {
      const t = document.querySelector('table.lk')!.getBoundingClientRect();
      return { right: t.right, left: t.left, scroll: document.documentElement.scrollWidth };
    });
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right, 'table fits the paper width').toBeLessThanOrEqual(w);
    expect(fit.scroll).toBeLessThanOrEqual(w);
    mkdirSync(SHOT, { recursive: true });
    await page.screenshot({ path: join(SHOT, `print-${name.replace(' ', '-')}.png`), fullPage: true });
    // afterprint restores the screen layout
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('body')).not.toHaveClass(/print-lookup/);
    await expect(page.locator('.layout')).toBeVisible();
    expect(log.errors).toEqual([]);
  });
}

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`(i) axe on the open dialog at ${w} px, ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
      await blockAds(context);
      const page = await context.newPage();
      const log = collectErrors(page);
      await page.goto('/wisc3');
      await waitReady(page);
      await fillCase(page, midCase(refData()).input);
      await show(page);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(res.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      if (w > 639) {
        // the scroll region is focusable and labelled; the table has a caption and header scopes
        await expect(page.locator('table.lk caption')).toHaveCount(1);
        expect(await page.locator('table.lk th:not([scope])').count()).toBe(0);
      }
      mkdirSync(SHOT, { recursive: true });
      await page.screenshot({ path: join(SHOT, `lookup-${w}-${scheme}.png`) });
      expect(log.errors).toEqual([]);
      await context.close();
    });
  }
}

for (const [w, h] of [[320, 640], [375, 812], [390, 844], [639, 900], [640, 900], [768, 1024], [820, 1180], [1100, 800], [1440, 900]] as const) {
  test(`(j) fit at ${w} px: inside the viewport, no overflow, 44 px controls, ${w < 640 ? 'narrow' : 'wide'} view`, async ({ page }) => {
    const log = collectErrors(page);
    await open(page, w, h);
    await fillCase(page, midCase(refData()).input);
    await show(page);
    const narrow = w < 640;
    await expect(page.getByTestId('lookup-narrow')).toBeVisible({ visible: narrow });
    await expect(page.getByTestId('lookup-table')).toBeVisible({ visible: !narrow });
    const m = await page.evaluate(() => {
      const d = document.querySelector('dialog#lookup')!.getBoundingClientRect();
      const small: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('dialog#lookup button')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.height < 43.5 || r.width < 43.5) small.push(`${el.getAttribute('data-testid')} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
      }
      const head = document.querySelector('.lk-head')!.getBoundingClientRect();
      const close = document.querySelector('#lk-close')!.getBoundingClientRect();
      return { left: d.left, right: d.right, top: d.top, bottom: d.bottom, scroll: document.documentElement.scrollWidth, small, closeIn: close.right <= innerWidth && close.left >= 0 && close.bottom <= head.bottom + 1 };
    });
    expect(m.left).toBeGreaterThanOrEqual(-0.5);
    expect(m.right).toBeLessThanOrEqual(w + 0.5);
    expect(m.top).toBeGreaterThanOrEqual(-0.5);
    expect(m.bottom).toBeLessThanOrEqual(h + 0.5);
    expect(m.scroll, 'page overflow').toBeLessThanOrEqual(w);
    expect(m.small, 'controls under 44 px').toEqual([]);
    expect(m.closeIn, 'close button reachable inside the head').toBe(true);
    if (narrow) {
      // the chip row scrolls inside itself, the list can be reached to its last row
      const last = page.getByTestId('lkn-19');
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeVisible();
      await expect(page.getByTestId('lk-next')).toBeVisible();
    } else {
      const scroller = await page.locator('.lk-wide').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      expect(scroller.cw).toBeGreaterThan(0);
    }
    if ([390, 768, 1440].includes(w)) {
      mkdirSync(SHOT, { recursive: true });
      await page.screenshot({ path: join(SHOT, `fit-${w}.png`) });
    }
    expect(log.errors).toEqual([]);
  });
}

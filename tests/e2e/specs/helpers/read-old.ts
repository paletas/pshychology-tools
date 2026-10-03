import type { BrowserContext, Page } from '@playwright/test';
import { pt } from '../../../../web/src/i18n/pt';
import type { IndexName } from '../../../../web/src/engine/types';
import { INDEX_NAMES } from '../../../../web/src/engine/types';
import type { CaseRecord } from '../../scripts/generate-cases';
import { emptyReading, LABEL_KEY, norm, normCi, type Cols5, type Reading } from './reading';

export const OLD_URL = 'http://localhost:5100/wisc3';
const TEST_IDS = [
  'ImageCompletion', 'Information', 'Code', 'Similarities', 'ImageDisposition', 'Arithmetic', 'Cubes',
  'Vocabulary', 'ObjectComposition', 'Comprehension', 'SymbolSearch', 'DigitMemory', 'Labyrinth',
];

/** Init script (once per context): traps the window.wisc3 assignment and stores the last non-null points of each draw* call in window.__oldCharts. */
export async function installOldTraps(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const keys: Record<string, string> = {
      drawStandardResultsChart: 'standardResults',
      drawStandardFactorialIndicesChart: 'factorial',
      drawQiResultsChart: 'qi',
    };
    const charts: Record<string, unknown> = {};
    (window as any).__oldCharts = charts;
    let stored: any;
    const wrap = (target: any) =>
      new Proxy(target, {
        set(obj, prop, value) {
          if (typeof prop === 'string' && keys[prop] && typeof value === 'function') {
            const orig = value;
            value = function (this: unknown, _el: unknown, points: unknown) {
              if (points) charts[keys[prop]] = JSON.parse(JSON.stringify(points));
              return orig.apply(this, arguments as any);
            };
          }
          obj[prop] = value;
          return true;
        },
      });
    Object.defineProperty(window, 'wisc3', {
      configurable: true,
      get: () => stored,
      set: (v) => {
        stored = v && typeof v === 'object' ? wrap(v) : v;
      },
    });
  });
}

const errorUiVisible = (page: Page) => page.locator('#blazor-error-ui').isVisible();

async function waitAgeFilled(page: Page): Promise<'ok' | 'crashed' | 'timeout'> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await errorUiVisible(page)) return 'crashed';
    if ((await page.locator('#subjectAgeYear').inputValue()) !== '') return 'ok';
    await page.waitForTimeout(100);
  }
  return 'timeout';
}

async function enterDates(page: Page, c: CaseRecord): Promise<void> {
  await page.locator('#testDate').fill(c.testDate);
  await page.locator('#testDate').press('Tab');
  await page.locator('#subjectBirthday').fill(c.birthDate);
  await page.locator('#subjectBirthday').press('Tab');
}

interface Dom {
  age: string[];
  rows: { label: string; scaled: string[] }[];
  sums: string[];
  complete: string;
  index: { label: string; sum: string; iq: string; cls: string | null; pct: string; ci: string }[];
}

function readDom(page: Page): Promise<Dom> {
  return page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].filter((t) => !t.closest('#LookupTableVisualizer'));
    const text = (el: Element | undefined | null) => el?.textContent ?? '';
    const [sub, idx] = tables;
    const rows = [...sub.querySelectorAll('tbody > tr')].map((tr) => {
      const tds = [...tr.querySelectorAll(':scope > td')];
      return { label: text(tds[0].querySelector('span')), scaled: tds.slice(2, 7).map(text) };
    });
    const foot = [...sub.querySelectorAll('tfoot > tr')];
    const footTds = [...foot[0].querySelectorAll(':scope > td')];
    const completeTds = [...foot[1].querySelectorAll(':scope > td')];
    const index = [...idx.querySelectorAll('tbody > tr')].map((tr) => {
      const tds = [...tr.querySelectorAll(':scope > td')];
      const clone = tds[2].cloneNode(true) as HTMLElement;
      clone.querySelectorAll('svg').forEach((s) => s.remove());
      return {
        label: text(tds[0]),
        sum: text(tds[1]),
        iq: clone.textContent ?? '',
        cls: tds[2].querySelector('svg title')?.textContent ?? null,
        pct: text(tds[3]),
        ci: text(tds[4]),
      };
    });
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    return {
      age: [val('subjectAgeYear'), val('subjectAgeMonth'), val('subjectAgeDay')],
      rows,
      sums: footTds.slice(2, 7).map(text),
      complete: text(completeTds[1]),
      index,
    };
  });
}

/** Reads the old app for a case (page already at OLD_URL, traps installed). */
export async function readOld(page: Page, c: CaseRecord, predictedAgeNonNull: boolean): Promise<Reading> {
  await page.waitForFunction(() => !!(window as any).Blazor, undefined, { timeout: 30_000 });
  await enterDates(page, c);

  if (predictedAgeNonNull) {
    let r = await waitAgeFilled(page);
    if (r === 'timeout') {
      await enterDates(page, c);
      r = await waitAgeFilled(page);
    }
    if (r === 'crashed') return emptyReading({ stage: 'age', test: null });
    if (r === 'timeout') throw new Error('old app: age fields did not fill');
  } else {
    await page.waitForTimeout(2000);
    if (await errorUiVisible(page)) return emptyReading({ stage: 'age', test: null });
  }

  const dom0 = await readDom(page);
  if (dom0.rows.length !== 13) throw new Error(`old app: expected 13 test rows, found ${dom0.rows.length}`);
  const subTable = page.locator('table:not(#LookupTableVisualizer table)').first();
  for (const id of TEST_IDS) {
    const v = c.raw[id];
    if (v === null || v === undefined) continue;
    const idx = dom0.rows.findIndex((r) => norm(r.label) === norm(pt[`Test.${id}`]));
    if (idx < 0) throw new Error(`old app: no row for ${id}`);
    const input = subTable.locator('tbody > tr').nth(idx).locator('input[type=number]');
    await input.fill(String(v));
    await input.press('Tab');
    if (await errorUiVisible(page)) return emptyReading({ stage: 'raw', test: id });
  }
  await page.waitForTimeout(150);

  const select = page.locator('select').first();
  await select.selectOption('Percentil95');
  const dom95 = await readDom(page);
  await select.selectOption('Percentil90');
  const dom90 = await readDom(page);
  await select.selectOption('Percentil95');

  const reading = emptyReading();
  reading.age = dom95.age.map((s) => (norm(s) === '' ? null : Number(norm(s))));
  for (const id of TEST_IDS) {
    const row = dom95.rows.find((r) => norm(r.label) === norm(pt[`Test.${id}`]))!;
    reading.scaled[id] = row.scaled.map(norm) as Cols5;
  }
  reading.sums = [...dom95.sums, dom95.complete].map(norm);
  for (const name of INDEX_NAMES as readonly IndexName[]) {
    const label = norm(pt[`QI.${LABEL_KEY[name]}`]);
    const r95 = dom95.index.find((r) => norm(r.label) === label);
    const r90 = dom90.index.find((r) => norm(r.label) === label);
    if (!r95 || !r90) continue;
    reading.indices[name] = {
      sum: norm(r95.sum),
      iq: norm(r95.iq),
      cls: r95.cls === null ? null : norm(r95.cls),
      pct: norm(r95.pct),
      ci90: normCi(r90.ci),
      ci95: normCi(r95.ci),
    };
  }
  const charts = await page.evaluate(() => (window as any).__oldCharts as Record<string, unknown>);
  reading.charts = charts.standardResults && charts.factorial && charts.qi ? charts : null;
  return reading;
}

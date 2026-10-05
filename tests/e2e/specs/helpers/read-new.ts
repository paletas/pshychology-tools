import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { IndexName } from '../../../../web/src/engine/types';
import { INDEX_NAMES } from '../../../../web/src/engine/types';
import type { CaseRecord } from '../../scripts/generate-cases';
import { fillCase, waitReady } from './app';
import { emptyReading, norm, normCi, type Cols5, type Reading } from './reading';

export const NEW_URL = 'http://localhost:5200/wisc3';
export const TEST_IDS = [
  'ImageCompletion', 'Information', 'Code', 'Similarities', 'ImageDisposition', 'Arithmetic', 'Cubes',
  'Vocabulary', 'ObjectComposition', 'Comprehension', 'SymbolSearch', 'DigitMemory', 'Labyrinth',
];
const COLS = ['verbal', 'realization', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'];

interface Cells {
  cells: Record<string, string>;
  cls: Record<string, string | null>;
  columns: Record<string, string | null>;
  rows: string[];
  empty: boolean;
}

function readCells(page: Page): Promise<Cells> {
  return page.evaluate(() => {
    const cells: Record<string, string> = {};
    const cls: Record<string, string | null> = {};
    const columns: Record<string, string | null> = {};
    const rows: string[] = [];
    document.querySelectorAll('[data-testid]').forEach((el) => {
      const id = el.getAttribute('data-testid')!;
      if (id.startsWith('index-class-')) cls[id.slice('index-class-'.length)] = el.textContent ?? null;
      else if (id.startsWith('index-row-')) rows.push(id.slice('index-row-'.length));
      else {
        cells[id] = el.textContent ?? '';
        if (id.startsWith('scaled-')) columns[id.slice('scaled-'.length)] = el.getAttribute('data-columns');
      }
    });
    return { cells, cls, columns, rows, empty: !!document.querySelector('[data-testid="results-empty"]') };
  });
}

async function setCi(page: Page, level: '90' | '95'): Promise<void> {
  const btn = page.locator(`[data-testid="ci-select"] [data-ci="${level}"]`);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

/** Reads the new app for a case (navigates to NEW_URL first). */
export async function readNew(page: Page, c: CaseRecord): Promise<Reading> {
  await page.goto(NEW_URL);
  await waitReady(page);
  await fillCase(page, { testDate: c.testDate, birthDate: c.birthDate, raw: c.raw });
  await page.waitForTimeout(100);

  await setCi(page, '95');
  const r95 = await readCells(page);
  await setCi(page, '90');
  const r90 = await readCells(page);
  await setCi(page, '95');

  const reading = emptyReading();
  // age: the sentence is shown only for a computed age (age-empty otherwise)
  reading.age = ['age-years', 'age-months', 'age-days'].map((id) => {
    const t = norm(r95.cells[id]);
    return t === '' ? null : Number(t);
  });
  // scaled-<Id> holds one value; data-columns lists the old columns it stands for
  for (const id of TEST_IDS) {
    const cols = (r95.columns[id] ?? '').split(',').filter(Boolean);
    if (cols.length === 0 || cols.some((col) => !COLS.includes(col))) throw new Error(`scaled-${id}: bad data-columns "${r95.columns[id]}"`);
    const v = norm(r95.cells[`scaled-${id}`]);
    reading.scaled[id] = COLS.map((col) => (cols.includes(col) ? v : '')) as Cols5;
  }
  reading.sums = [...COLS.map((col) => r95.cells[`sum-${col}`]), r95.cells['sum-complete']].map(norm);
  // [REV-12] an absent index-row means all its fields are blank (results-empty is then present)
  if (r95.rows.length === 0 && !r95.empty) throw new Error('no index rows and no results-empty');
  for (const name of INDEX_NAMES as readonly IndexName[]) {
    if (!r95.rows.includes(name)) continue; // stays blank (emptyReading)
    const cls = r95.cls[name];
    reading.indices[name] = {
      sum: norm(r95.cells[`index-sum-${name}`]),
      iq: norm(r95.cells[`index-iq-${name}`]),
      cls: cls === undefined || cls === null ? null : norm(cls),
      pct: norm(r95.cells[`index-pct-${name}`]),
      ci90: normCi(r90.cells[`index-ci-${name}`]),
      ci95: normCi(r95.cells[`index-ci-${name}`]),
    };
  }
  const debug = await page.evaluate(() => (window as any).__wisc3Debug.snapshot());
  reading.charts = debug.charts ?? null;
  return reading;
}

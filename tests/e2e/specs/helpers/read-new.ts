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

function readCells(page: Page): Promise<{ cells: Record<string, string>; cls: Record<string, string | null>; age: string[] }> {
  return page.evaluate(() => {
    const cells: Record<string, string> = {};
    const cls: Record<string, string | null> = {};
    document.querySelectorAll('[data-testid]').forEach((el) => {
      const id = el.getAttribute('data-testid')!;
      if (id.startsWith('index-class-')) cls[id.slice('index-class-'.length)] = el.querySelector('title')?.textContent ?? null;
      else cells[id] = el.textContent ?? '';
    });
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    return { cells, cls, age: [val('subjectAgeYear'), val('subjectAgeMonth'), val('subjectAgeDay')] };
  });
}

/** Reads the new app for a case (navigates to NEW_URL first). */
export async function readNew(page: Page, c: CaseRecord): Promise<Reading> {
  await page.goto(NEW_URL);
  await waitReady(page);
  await fillCase(page, { testDate: c.testDate, birthDate: c.birthDate, raw: c.raw });
  await page.waitForTimeout(100);

  const select = page.getByTestId('ci-select');
  await select.selectOption('Percentil95');
  const r95 = await readCells(page);
  await select.selectOption('Percentil90');
  const r90 = await readCells(page);
  await select.selectOption('Percentil95');

  const reading = emptyReading();
  reading.age = r95.age.map((s) => (norm(s) === '' ? null : Number(norm(s))));
  for (const id of TEST_IDS) {
    reading.scaled[id] = COLS.map((col) => norm(r95.cells[`scaled-${id}-${col}`])) as Cols5;
  }
  reading.sums = [...COLS.map((col) => r95.cells[`sum-${col}`]), r95.cells['sum-complete']].map(norm);
  for (const name of INDEX_NAMES as readonly IndexName[]) {
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

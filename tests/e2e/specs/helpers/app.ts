import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CaseInput } from '../../../../web/src/engine/types';
import { expectedCells } from './format';
import { refData } from './cases';
import { scoreCase } from '../../../../web/src/engine/scoring';
import { formatCi } from '../../../../web/src/engine/format';

// [REV-13] exact expected texts that mean "blank" for an index field: '' (sum/iq/pct) and the blank CI formatCi(null) = ' - '. '—' (unavailable) is NOT blank.
const BLANK_INDEX_TEXTS = new Set(['', formatCi(null)]);

export async function waitReady(page: Page): Promise<void> {
  await expect(page.getByTestId('app')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
}

/** Waits until the service worker is active and controls this page. */
export async function waitControlled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30_000 });
}

export async function fillDates(page: Page, testDate: string, birthDate: string): Promise<void> {
  await page.locator('#testDate').fill(testDate);
  await page.locator('#testDate').press('Tab');
  await page.locator('#subjectBirthday').fill(birthDate);
  await page.locator('#subjectBirthday').press('Tab');
}

export async function fillRaw(page: Page, testId: string, value: number): Promise<void> {
  const input = page.getByTestId(`raw-${testId}`);
  await input.fill(String(value));
  await input.press('Tab');
}

/** Dates first, then each raw (fill + Tab), in test order. */
export async function fillCase(page: Page, input: CaseInput, onlyIds?: string[]): Promise<void> {
  await fillDates(page, input.testDate, input.birthDate);
  for (const [id, v] of Object.entries(input.raw)) {
    if (v === null || (onlyIds && !onlyIds.includes(id))) continue;
    await fillRaw(page, id, v);
  }
}

/** Texts of every data-testid element currently in the page. */
export function readCells(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll('[data-testid]').forEach((el) => {
      out[el.getAttribute('data-testid')!] = el.textContent ?? '';
    });
    return out;
  });
}

/** Keys whose displayed text differs from the expected one (empty when everything matches). */
export function diffCells(actual: Record<string, string>, expected: Record<string, string>): string[] {
  const resultsEmpty = actual['results-empty'] !== undefined;
  return Object.entries(expected)
    // [REV-12/13] index rows are not rendered while results-empty shows: an absent index-* field equals an exact expected blank only then
    .filter(([k, v]) => !(resultsEmpty && actual[k] === undefined && k.startsWith('index-') && BLANK_INDEX_TEXTS.has(v)))
    .filter(([k, v]) => actual[k] === undefined || actual[k].trim() !== v.trim())
    .map(([k, v]) => `${k}: expected "${v}", got ${actual[k] === undefined ? 'missing' : `"${actual[k]}"`}`);
}

export async function cellMismatches(page: Page, expected: Record<string, string>): Promise<string[]> {
  return diffCells(await readCells(page), expected);
}

/** Asserts (with retry) that the page shows exactly what scoreCase predicts for the input, using the given data (default: data/). */
export async function expectCase(page: Page, input: CaseInput, data = refData()): Promise<void> {
  const expected = expectedCells(data, scoreCase(data, input));
  await expect.poll(() => cellMismatches(page, expected), { timeout: 10_000 }).toEqual([]);
}

export interface DebugState {
  dataVersion: string | null;
  dataSha: string | null;
}

export function debugState(page: Page): Promise<DebugState> {
  return page.evaluate(() => {
    const s = (window as any).__wisc3Debug.snapshot();
    return { dataVersion: s.dataVersion, dataSha: s.dataSha };
  });
}

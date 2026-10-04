import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { scoreCase } from '../../../../web/src/engine/scoring';
import { blockAds, isAdUrl } from '../helpers/adblock';
import { fillCase, fillDates, fillRaw, waitReady } from '../helpers/app';
import { TEST_DATE, midCase, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';
import type { ErrorLog } from '../helpers/console';
import { e2eDir } from '../helpers/paths';
import { birthFor } from '../../../../web/test/shared/load';

// REV-12: input guards of the new app. The clock is pinned so "today" is 2026-10-03.
const SHOTS = resolve(e2eDir, 'reports/screens/guards');
const FUTURE = '2027-01-10';

let errors: ErrorLog;
let external: string[];

test.beforeEach(async ({ page, context }) => {
  await blockAds(context); // the page's AdSense tag is the one allowed external host (aborted, as in the other specs)
  errors = collectErrors(page);
  external = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1' && !isAdUrl(r.url())) external.push(r.url());
  });
  await page.clock.setFixedTime(new Date('2026-10-03T10:00:00'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/wisc3');
  await waitReady(page);
});

interface Expect {
  /** date message: testid suffix, data-key and role */
  msg?: [field: string, key: string, role: 'alert' | 'status'];
  reason: string;
}

/** The results/charts/glance are empty for the reason, nothing is scored, and nothing went wrong in the browser. */
async function expectBlocked(page: Page, e: Expect): Promise<void> {
  if (e.msg) {
    const m = page.getByTestId(`date-msg-${e.msg[0]}`);
    await expect(m).toHaveAttribute('data-key', e.msg[1]);
    await expect(m).toHaveAttribute('role', e.msg[2]);
  }
  await expect(page.getByTestId('results-empty')).toHaveAttribute('data-reason', e.reason);
  await expect(page.locator('[data-testid^="index-row-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="chart-empty-"]')).toHaveCount(3);
  await expect(page.locator('[data-testid^="glance-"]')).toHaveText([/—/, /—/, /—/]);
  expect(errors.errors).toEqual([]);
  expect(external).toEqual([]);
}

const birthTyped = async (page: Page, v: string) => {
  await page.locator('#subjectBirthday').fill(v);
  await page.locator('#subjectBirthday').press('Tab');
};

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.screenshot({ path: resolve(SHOTS, `${name}-${w}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('(a) both dates empty', async ({ page }) => {
  await expectBlocked(page, { msg: ['both', 'date.missing.both', 'status'], reason: 'results.empty.dates' });
});

test('(b) a partly typed birth date is invalid', async ({ page }) => {
  await page.locator('#subjectBirthday').focus();
  await page.keyboard.type('12');
  await page.locator('#subjectBirthday').blur(); // a partial date fires no input event; the guard reads badInput when the field loses focus
  await expectBlocked(page, { msg: ['birth', 'date.invalid.birth', 'alert'], reason: 'results.empty.dates' });
  await expect(page.locator('#subjectBirthday')).toHaveAttribute('aria-invalid', 'true');
});

test('(c) only the birth date', async ({ page }) => {
  await birthTyped(page, '2015-01-01');
  await expectBlocked(page, { msg: ['test', 'date.missing.test', 'status'], reason: 'results.empty.dates' });
});

test('(d) test date equal to the birth date', async ({ page }) => {
  await fillDates(page, '2020-05-05', '2020-05-05');
  await expectBlocked(page, { msg: ['test', 'date.same', 'alert'], reason: 'results.empty.dates' });
});

test('(e) test date before the birth date', async ({ page }) => {
  await fillDates(page, '2020-05-04', '2020-05-05');
  await expectBlocked(page, { msg: ['test', 'date.before', 'alert'], reason: 'results.empty.dates' });
  await shot(page, 'e-test-before-birth');
});

test('(f) 5y9m30d is below the supported range, with the age shown', async ({ page }) => {
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [5, 9, 30]));
  await expectBlocked(page, { msg: ['birth', 'age.tooYoung', 'alert'], reason: 'results.empty.age' });
  await expect(page.getByTestId('date-msg-birth')).toContainText('5 anos, 9 meses e 30 dias');
  await expect(page.getByTestId('age')).toContainText('5 anos, 9 meses e 30 dias');
  await expect(page.getByTestId('norm-band')).toHaveCount(0);
  await shot(page, 'f-age-too-young');
});

test('(g) 17y3m0d is above the supported range', async ({ page }) => {
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [17, 3, 0]));
  await expectBlocked(page, { msg: ['birth', 'age.tooOld', 'alert'], reason: 'results.empty.age' });
  await expect(page.getByTestId('date-msg-birth')).toContainText('17 anos, 3 meses e 0 dias');
});

test('(h) a birth year of 1890 is implausible', async ({ page }) => {
  await fillDates(page, TEST_DATE, '1890-01-01');
  await expectBlocked(page, { msg: ['birth', 'age.implausible', 'alert'], reason: 'results.empty.age' });
});

test('(i) a future test date warns and the results still show', async ({ page }) => {
  const data = refData();
  const c = midCase(data);
  const input = { ...c.input, testDate: FUTURE, birthDate: birthFor(FUTURE, c.age) };
  await fillCase(page, input);
  const warn = page.getByTestId('date-msg-test');
  await expect(warn).toHaveAttribute('data-key', 'date.future');
  await expect(warn).toHaveAttribute('data-level', 'warn');
  await expect(page.locator('[data-testid="strip"]')).toHaveCount(6);
  await expect(page.locator('[data-testid^="chart-empty-"]')).toHaveCount(0);
  const snap = scoreCase(data, input);
  for (const name of ['verbal', 'realization', 'completeScale', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'] as const) {
    const e = snap.indices[name]!.entry;
    await expect(page.getByTestId(`index-iq-${name}`)).toHaveText(e === 'unavailable' ? '—' : String(e!.iq));
  }
  expect(errors.errors).toEqual([]);
  expect(external).toEqual([]);
});

test('(j) a raw score of 12.5 is rejected with a message', async ({ page }) => {
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [10, 2, 0]));
  const input = page.getByTestId('raw-Information');
  await input.click();
  await input.pressSequentially('12.5');
  await expect(page.getByTestId('raw-msg-Information')).toHaveAttribute('data-key', 'raw.invalid');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('scaled-Information')).toHaveText('');
  await expectBlocked(page, { reason: 'results.empty.invalidRaw' });
  await shot(page, 'j-raw-12-5');
});

test('(k) a pasted "abc" is rejected', async ({ page }) => {
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [10, 2, 0]));
  const input = page.getByTestId('raw-Information');
  await input.click();
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="raw-Information"]')!;
    const dt = new DataTransfer();
    dt.setData('text', 'abc');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId('raw-msg-Information')).toHaveAttribute('data-key', 'raw.invalid');
  await expect(page.getByTestId('scaled-Information')).toHaveText('');
  expect(errors.errors).toEqual([]);
});

test('(l) typing -3 leaves 3 in the field and no message', async ({ page }) => {
  await fillDates(page, TEST_DATE, birthFor(TEST_DATE, [10, 2, 0]));
  const input = page.getByTestId('raw-Information');
  await input.click();
  await page.keyboard.press('-');
  await page.keyboard.press('3');
  await expect(input).toHaveValue('3');
  await expect(page.getByTestId('raw-msg-Information')).toHaveCount(0);
  expect(errors.errors).toEqual([]);
});

test('(m) a mandatory raw above the maximum shows the existing message and the reason', async ({ page }) => {
  const c = midCase(refData());
  await fillCase(page, c.input);
  const snap = scoreCase(refData(), c.input);
  const max = snap.tests['Information'].max!;
  await fillRaw(page, 'Information', max + 1);
  await expect(page.getByTestId('oob-Information')).toBeVisible();
  await expectBlocked(page, { reason: 'results.empty.invalidRaw' });
});

test('(n) three mandatory raws missing names the three tests', async ({ page }) => {
  const c = midCase(refData());
  const data = refData();
  const mandatory = data.tests.filter((t) => t.mandatory).map((t) => t.id);
  const skip = mandatory.slice(0, 3);
  await fillDates(page, c.input.testDate, c.input.birthDate);
  for (const [id, v] of Object.entries(c.input.raw)) {
    if (skip.includes(id) || v === null) continue;
    await fillRaw(page, id, v);
  }
  await expectBlocked(page, { reason: 'results.empty.mandatory' });
  const text = (await page.getByTestId('results-empty').textContent()) ?? '';
  expect(text).toContain('Faltam 3');
  for (const id of skip) {
    const row = page.getByTestId(`subtest-row-${id}`).locator('b').first();
    expect(text).toContain(((await row.textContent()) ?? '').trim());
  }
});

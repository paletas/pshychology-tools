import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatCi } from '../../../../web/src/engine/format';
import { pt } from '../../../../web/src/i18n/pt';
import { ptNew } from '../../../../web/src/i18n/pt-new';
import { blockAds } from '../helpers/adblock';
import { fillCase, waitReady } from '../helpers/app';
import { midCase, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';
import { reportsDir } from '../helpers/paths';

// [REV-14] The three SVG charts show a tooltip on hover, keyboard focus and tap (the old Chart.js charts did on hover).
// Expected texts are derived here, independently of the chart implementation (the app's tooltip module).
// Tests: (a)-(e), plus the negative controls (f) split in three (f1-f3): 8 tests in all.
type Charts = {
  standardResults: { Verbal: (number | null)[]; Realization: (number | null)[] };
  factorial: { VerbalComprehension: (number | null)[]; PerceptiveOrganization: (number | null)[]; ProcessingVelocity: (number | null)[] };
  qi: { QI: Entry[]; Indices: Entry[] };
};
type Entry = { label: string; min: number | null; max: number | null; q1: number | null; q3: number | null; median: number | null };
type Tip = { for: string | null; title: string; lines: string[] };
type Exp = Tip & { name?: string };

const PROFILE_IDS = ['Information', 'Similarities', 'Arithmetic', 'Vocabulary', 'Comprehension', 'DigitMemory', 'ImageCompletion', 'Code', 'ImageDisposition', 'Cubes', 'ObjectComposition', 'SymbolSearch', 'Labyrinth'];
const GROUPS = [
  { key: 'CV', ids: ['Information', 'Similarities', 'Vocabulary', 'Comprehension'], field: 'VerbalComprehension', from: 0, label: 'QI.VerbalComprehension' },
  { key: 'OP', ids: ['ImageCompletion', 'ImageDisposition', 'Cubes', 'ObjectComposition'], field: 'PerceptiveOrganization', from: 4, label: 'QI.PerceptiveOrganization' },
  { key: 'VP', ids: ['Code', 'SymbolSearch'], field: 'ProcessingVelocity', from: 8, label: 'QI.ProcessingVelocity' },
] as const;
const QI_KEYS = [['V', 'verbal'], ['R', 'realization'], ['EC', 'completeScale'], ['CV', 'verbalComprehension'], ['OP', 'perceptiveOrganization'], ['VP', 'processingVelocity']] as const;
const KINDS = ['standard', 'factorial', 'qi'] as const;

const fill = (t: string, v: string) => t.replace('{0}', v);
const optionalIds = () => new Set(refData().tests.filter((t) => !t.mandatory).map((t) => t.id));
const title = (id: string) => pt[`Test.${id}`] + (optionalIds().has(id) ? ' ' + ptNew['optional'] : '');
const ci = (a: number | null, b: number | null) => formatCi(a !== null && b !== null ? [a, b] : null);

function expectedQi(charts: Charts): (Exp & { key: string; name: string })[] {
  const entries = [...charts.qi.QI, ...charts.qi.Indices];
  const out: (Exp & { key: string; name: string })[] = [];
  QI_KEYS.forEach(([key, name], i) => {
    const e = entries[i];
    if (e.median === null) return;
    out.push({
      key,
      name,
      for: `qi-${key}`,
      title: i < 3 ? ptNew[`chart.iq.${key}`] : e.label,
      lines: [`${ptNew['chart.qi.result']}: ${e.median}`, `${fill(ptNew['ci.range'], '90')} ${ci(e.q1, e.q3)}`, `${fill(ptNew['ci.range'], '95')} ${ci(e.min, e.max)}`],
    });
  });
  return out;
}

function expectedStandard(charts: Charts): Exp[] {
  const out: Exp[] = [];
  PROFILE_IDS.forEach((id, i) => {
    const v = charts.standardResults.Verbal[i] ?? charts.standardResults.Realization[i];
    if (v === null || v === undefined) return;
    out.push({ for: `standard-${id}`, title: title(id), lines: [`${pt[i < 6 ? 'QI.Verbal' : 'QI.Realization']}: ${v}`] });
  });
  return out;
}

function expectedFactorial(charts: Charts): Exp[] {
  const out: Exp[] = [];
  for (const g of GROUPS) {
    g.ids.forEach((id, i) => {
      const v = charts.factorial[g.field][g.from + i];
      if (v === null) return;
      out.push({ for: `factorial-${id}`, title: title(id), lines: [`${pt[g.label]}: ${v}`] });
    });
  }
  return out;
}

async function readTip(page: Page, kind: string): Promise<Tip> {
  const tip = page.getByTestId(`chart-tip-${kind}`);
  await expect(tip).toHaveCount(1);
  return tip.evaluate((el) => ({
    for: el.getAttribute('data-tip-for'),
    title: el.querySelector('[data-testid="chart-tip-title"]')!.textContent ?? '',
    lines: [...el.querySelectorAll('[data-testid="chart-tip-line"]')].map((l) => l.textContent ?? ''),
  }));
}

function tipDiff(actual: Tip, expected: Tip): string[] {
  const out: string[] = [];
  if (actual.for !== expected.for) out.push(`for: expected "${expected.for}", got "${actual.for}"`);
  if (actual.title !== expected.title) out.push(`title: expected "${expected.title}", got "${actual.title}"`);
  const n = Math.max(actual.lines.length, expected.lines.length);
  for (let i = 0; i < n; i++) {
    if (actual.lines[i] !== expected.lines[i]) out.push(`line ${i}: expected "${expected.lines[i] ?? 'missing'}", got "${actual.lines[i] ?? 'missing'}"`);
  }
  return out;
}

const charts = (page: Page): Promise<Charts> => page.evaluate(() => (window as any).__wisc3Debug.snapshot().charts);
const hit = (page: Page, tip: string) => page.locator(`[data-tip="${tip}"]`);

async function open(browser: Browser, opts: Parameters<Browser['newContext']>[0], withInput = true) {
  const context = await browser.newContext(opts);
  await blockAds(context);
  const page = await context.newPage();
  const log = collectErrors(page);
  await page.goto('/wisc3');
  await waitReady(page);
  if (withInput) await fillCase(page, midCase(refData()).input);
  return { context, page, log };
}

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

test('(a) hover shows every mark\'s values on all three charts', async ({ browser }) => {
  const { context, page, log } = await open(browser, DESKTOP);
  const c = await charts(page);
  const expected = { standard: expectedStandard(c), factorial: expectedFactorial(c), qi: expectedQi(c) };
  for (const kind of KINDS) {
    const svg = page.locator(`svg[data-testid="chart-${kind}"]`);
    const marks = Number(await svg.getAttribute('data-marks'));
    await expect(svg.locator('.tip-hit')).toHaveCount(marks);
    expect(expected[kind]).toHaveLength(marks);
    for (const e of expected[kind]) {
      await hit(page, e.for!).hover();
      expect(tipDiff(await readTip(page, kind), e), e.for!).toEqual([]);
    }
    await page.mouse.move(0, 0);
    await expect(page.getByTestId(`chart-tip-${kind}`)).toHaveCount(0);
  }
  expect(log.errors).toEqual([]);
  await context.close();
});

test('(b) the QI tooltip agrees with the index table and shows both intervals', async ({ browser }) => {
  const { context, page, log } = await open(browser, DESKTOP);
  const text = async (id: string) => (await page.getByTestId(id).textContent()) ?? '';
  await page.locator('[data-testid="ci-select"] [data-ci="90"]').click();
  for (const [key, name] of QI_KEYS) {
    await hit(page, `qi-${key}`).hover();
    const t = await readTip(page, 'qi');
    expect(t.lines[0]).toBe(`${ptNew['chart.qi.result']}: ${await text(`index-iq-${name}`)}`);
    expect(t.lines[1]).toBe(`${fill(ptNew['ci.range'], '90')} ${await text(`index-ci-${name}`)}`);
  }
  const line1 = new Map<string, string>();
  for (const [key] of QI_KEYS) {
    await hit(page, `qi-${key}`).hover();
    line1.set(key, (await readTip(page, 'qi')).lines[1]);
  }
  await page.locator('[data-testid="ci-select"] [data-ci="95"]').click();
  for (const [key, name] of QI_KEYS) {
    await hit(page, `qi-${key}`).hover();
    const t = await readTip(page, 'qi');
    expect(t.lines[2]).toBe(`${fill(ptNew['ci.range'], '95')} ${await text(`index-ci-${name}`)}`);
    expect(t.lines[1]).toBe(line1.get(key));
  }
  expect(log.errors).toEqual([]);
  await context.close();
});

test('(c) keyboard: one tab stop, focus shows, arrows move, Escape closes', async ({ browser }) => {
  const { context, page, log } = await open(browser, DESKTOP);
  const exp = expectedQi(await charts(page));
  const qiStop = page.locator('svg[data-testid="chart-qi"] .tip-hit[tabindex="0"]');
  await expect(qiStop).toHaveCount(1);
  await qiStop.focus();
  expect(tipDiff(await readTip(page, 'qi'), exp[0])).toEqual([]);
  expect((await readTip(page, 'qi')).for).toBe('qi-V');
  for (let i = 1; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
    expect(tipDiff(await readTip(page, 'qi'), exp[i]), exp[i].for!).toEqual([]);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chart-tip-qi')).toHaveCount(0);
  await page.locator('svg[data-testid="chart-standard"] .tip-hit[tabindex="0"]').focus();
  expect((await readTip(page, 'standard')).for).toBe('standard-Information');
  expect(log.errors).toEqual([]);
  await context.close();
});

test('(d) touch: tap shows a readable tooltip inside the figure at 390 px', async ({ browser }) => {
  const { context, page, log } = await open(browser, PHONE);
  const c = await charts(page);
  const qi = expectedQi(c);
  const std = expectedStandard(c);
  const picks: [string, Exp][] = [
    ...qi.map((e): [string, Exp] => ['qi', e]),
    ...['standard-Information', 'standard-Code', 'standard-Labyrinth'].map((id): [string, Exp] => ['standard', std.find((e) => e.for === id)!]),
  ];
  for (const [kind, e] of picks) {
    await hit(page, e.for!).tap();
    expect(tipDiff(await readTip(page, kind), e), e.for!).toEqual([]);
    const m = await page.getByTestId(`chart-tip-${kind}`).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const b = el.parentElement!.getBoundingClientRect();
      const px = (x: Element) => parseFloat(getComputedStyle(x).fontSize);
      return { l: r.left, r: r.right, bl: b.left, br: b.right, sw: document.documentElement.scrollWidth, fs: [px(el), ...[...el.querySelectorAll('[data-testid="chart-tip-line"]')].map(px)] };
    });
    expect(m.l, e.for!).toBeGreaterThanOrEqual(m.bl - 0.5);
    expect(m.r, e.for!).toBeLessThanOrEqual(m.br + 0.5);
    expect(m.l).toBeGreaterThanOrEqual(0);
    expect(m.r).toBeLessThanOrEqual(390);
    expect(m.sw).toBeLessThanOrEqual(390);
    for (const f of m.fs) expect(f).toBeGreaterThanOrEqual(11);
  }
  await hit(page, 'qi-EC').tap();
  mkdirSync(join(reportsDir, 'screens/tooltips'), { recursive: true });
  await page.locator('figure', { has: page.getByTestId('chart-qi') }).screenshot({ path: join(reportsDir, 'screens/tooltips/qi-390.png') });
  await page.locator('#h-charts').tap();
  await expect(page.locator('[data-testid^="chart-tip-"]')).toHaveCount(0);
  expect(log.errors).toEqual([]);
  await context.close();
});

test('(e) the tooltip is readable in light and dark', async ({ browser }) => {
  const { context, page, log } = await open(browser, DESKTOP);
  mkdirSync(join(reportsDir, 'screens/tooltips'), { recursive: true });
  const colours = () => page.getByTestId('chart-tip-qi').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
  const figure = page.locator('figure', { has: page.getByTestId('chart-qi') });
  const one = async (scheme: 'light' | 'dark') => {
    await page.emulateMedia({ colorScheme: scheme });
    await hit(page, 'qi-V').evaluate((el) => (el as unknown as HTMLElement).blur());
    await hit(page, 'qi-V').focus();
    const col = await colours();
    expect(col.bg).not.toBe(col.fg);
    await figure.screenshot({ path: join(reportsDir, `screens/tooltips/qi-${scheme}.png`) });
    return col;
  };
  const light = await one('light');
  const dark = await one('dark');
  expect(dark.bg).not.toBe(light.bg);
  expect(log.errors).toEqual([]);
  await context.close();
});

test.describe('(f) negative controls', () => {
  test('(f1) no input: no targets and no tooltip', async ({ browser }) => {
    const { context, page, log } = await open(browser, DESKTOP, false);
    await expect(page.locator('.tip-hit')).toHaveCount(0);
    await expect(page.locator('[data-testid^="chart-tip-"]')).toHaveCount(0);
    expect(log.errors).toEqual([]);
    await context.close();
  });

  test('(f2) a wrong expected value is reported as exactly one line difference', async ({ browser }) => {
    const { context, page, log } = await open(browser, DESKTOP);
    const exp = expectedQi(await charts(page))[0];
    const median = (await charts(page)).qi.QI[0].median!;
    await hit(page, 'qi-V').hover();
    const wrong = `${ptNew['chart.qi.result']}: ${median + 1}`;
    expect(tipDiff(await readTip(page, 'qi'), { ...exp, lines: [wrong, ...exp.lines.slice(1)] })).toEqual([
      `line 0: expected "${wrong}", got "${ptNew['chart.qi.result']}: ${median}"`,
    ]);
    expect(log.errors).toEqual([]);
    await context.close();
  });

  test('(f3) the expectation of another bar is detected', async ({ browser }) => {
    const { context, page, log } = await open(browser, DESKTOP);
    const exp = expectedQi(await charts(page));
    await hit(page, 'qi-V').hover();
    const d = tipDiff(await readTip(page, 'qi'), exp[1]);
    expect(d.length).toBeGreaterThan(0);
    expect(d[0]).toBe('for: expected "qi-R", got "qi-V"');
    expect(log.errors).toEqual([]);
    await context.close();
  });
});

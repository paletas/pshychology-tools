import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { INDEX_NAMES } from '../../../../web/src/engine/types';
import type { Age, CaseInput } from '../../../../web/src/engine/types';
import { fixedModel } from '../../../../web/test/shared/fixed-model';
import type { GoldenCorrection, KeySets, OldResult, Tag } from '../../../../web/test/shared/fixed-model';
import { loadGolden } from '../../../../web/test/shared/load';
import type { CaseRecord } from '../../scripts/generate-cases';
import { blockAds } from '../helpers/adblock';
import type { AdLog } from '../helpers/adblock';
import { NEW_CHARTS, OLD_CHART_INSTANCES, oldCanvasInkRatio, svgMarks } from '../helpers/canvas';
import { diff, uncovered } from '../helpers/compare';
import type { FieldDiff, Verdict } from '../helpers/compare';
import { collectErrors } from '../helpers/console';
import type { ErrorLog } from '../helpers/console';
import { expectedNew, expectedOld } from '../helpers/expected';
import { e2eDir, reportsDir } from '../helpers/paths';
import { collectOldConsole, evaluateOldConsole } from '../helpers/old-console';
import type { OldConsoleLog, PredictedOldConsole } from '../helpers/old-console';
import { readNew } from '../helpers/read-new';
import { installOldTraps, OLD_URL, readOld } from '../helpers/read-old';

const casesFile = join(e2eDir, '.tmp/cases.json');
const predFile = join(e2eDir, '.tmp/predictions-old.json');
if (!existsSync(casesFile) || !existsSync(predFile)) throw new Error('run scripts/run-compare.mjs (or generate-cases + predict-old) first');

interface Prediction {
  id: string;
  old: OldResult;
  correctionsHit?: string[];
  oldCorrected?: OldResult;
  oldConsole?: PredictedOldConsole[];
}
const cases: CaseRecord[] = JSON.parse(readFileSync(casesFile, 'utf8'));
const predictions = new Map<string, Prediction>((JSON.parse(readFileSync(predFile, 'utf8')) as Prediction[]).map((p) => [p.id, p]));

const idx = loadGolden<Record<string, { sum: number; inTable: boolean }[]>>('indices.json');
const keySets = Object.fromEntries(INDEX_NAMES.map((n) => [n, new Set<number>(idx[n].filter((r) => r.inTable).map((r) => r.sum))])) as KeySets;
const corrections = loadGolden<GoldenCorrection[]>('corrections.json');

const casesDir = join(reportsDir, 'compare/cases');
const chartsDir = join(reportsDir, 'screens/charts');
mkdirSync(casesDir, { recursive: true });
mkdirSync(chartsDir, { recursive: true });

async function pollMarks(read: () => Promise<number>): Promise<number> {
  let v = 0;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    v = await read();
    if (v > 0) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  return v;
}

/** Fixed review cases whose old/new pages are saved as screenshots (V18). */
const REVIEW_IDS = new Set(['strat-10y00m-1', 'edge-index-missing-key', 'edge-all-max']);
const MIN_INK = 0.01;

async function pollInk(read: () => Promise<number>): Promise<number> {
  let v = 0;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    v = await read();
    if (v >= MIN_INK) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  return v;
}

test.describe.configure({ mode: 'serial' });

let oldCtx: BrowserContext;
let newCtx: BrowserContext;
let oldPage: Page;
let newPage: Page;
let oldAds: AdLog;
let newAds: AdLog;
let oldLog: OldConsoleLog;
let newLog: ErrorLog;

test.beforeAll(async ({ browser }) => {
  oldCtx = await browser.newContext();
  newCtx = await browser.newContext();
  await installOldTraps(oldCtx);
  oldAds = await blockAds(oldCtx);
  newAds = await blockAds(newCtx);
  oldPage = await oldCtx.newPage();
  newPage = await newCtx.newPage();
  oldLog = collectOldConsole(oldPage);
  newLog = collectErrors(newPage);
});

test.afterAll(async () => {
  await oldCtx?.close();
  await newCtx?.close();
});

for (const c of cases) {
  test(`compare ${c.id}`, async () => {
    test.setTimeout(180_000);
    const pred = predictions.get(c.id);
    const record: Record<string, unknown> = { id: c.id, kind: c.kind, testDate: c.testDate, birthDate: c.birthDate, raw: c.raw };
    let verdict: Verdict = 'harness-failure';
    let tags: Tag[] = [];
    const adBlockedBefore = oldAds.blocked.length + newAds.blocked.length;
    const adRespBefore = oldAds.adResponses.length + newAds.adResponses.length;
    try {
      if (!pred) throw new Error('no prediction for case');
      const input: CaseInput = { testDate: c.testDate, birthDate: c.birthDate, raw: c.raw };
      const model = fixedModel(input, { ...pred.old, correctionsHit: pred.correctionsHit, oldCorrected: pred.oldCorrected }, keySets, corrections);
      tags = model.tags;
      record.correctionIds = model.correctionIds;
      const expOld = expectedOld(pred.old);
      const expNew = expectedNew(model.expected);
      record.age = pred.old.age as Age | null;
      record.tags = tags;
      record.expectedOldCrash = expOld.crashed;

      // old app
      const oldCtx = { oldConsole: pred.oldConsole ?? [] };
      oldLog.clear();
      await oldPage.goto(OLD_URL);
      const oldRead = await readOld(oldPage, c, { ...oldCtx, age: pred.old.age, throwAtTest: pred.old.throwAt?.test ?? null }, oldLog);
      const oldIndicesShown = pred.old.indicesShown && !pred.old.throws;
      let oldInk: number[] = [0, 0, 0];
      if (oldIndicesShown) oldInk = await Promise.all(OLD_CHART_INSTANCES.map((i) => pollInk(() => oldCanvasInkRatio(oldPage, i))));
      // [REV-8] QI y-axis range of the review cases (old: Chart.js 2 instance, new: SVG data-y-min/data-y-max)
      let oldAxis: { min: number; max: number } | null = null;
      if (REVIEW_IDS.has(c.id) && oldIndicesShown) {
        oldAxis = await oldPage.evaluate(() => {
          const y = (window as any).wisc3.__qiResultsChartInstance?.scales?.['y-axis-0'];
          return y ? { min: y.min as number, max: y.max as number } : null;
        });
      }
      if (REVIEW_IDS.has(c.id)) await oldPage.screenshot({ path: join(chartsDir, `${c.id}-old.png`), fullPage: true });
      const oldConsole = evaluateOldConsole(oldLog.records, oldCtx);
      const oldErrors = oldLog.records.map((r) => r.text);

      // new app (reloads inside readNew)
      newLog.clear();
      const newRead = await readNew(newPage, c);
      const newIndicesShown = model.expected.indicesShown;
      // new charts are SVG: marks when indices exist, the chart-empty-* state (and no marks) when they do not
      let newMarks: number[] = [0, 0, 0];
      let newEmpty = 0;
      if (newIndicesShown) newMarks = await Promise.all(NEW_CHARTS.map((ch) => pollMarks(() => svgMarks(newPage.getByTestId(ch)))));
      else {
        newEmpty = await newPage.locator('[data-testid^="chart-empty-"]').count();
        newMarks = await Promise.all(NEW_CHARTS.map((ch) => svgMarks(newPage.getByTestId(ch))));
      }
      let newAxis: { min: number; max: number } | null = null;
      if (REVIEW_IDS.has(c.id) && newIndicesShown) newAxis = await newPage.evaluate(() => (window as any).__wisc3Debug.chartAxis('chart-qi'));
      if (REVIEW_IDS.has(c.id)) await newPage.screenshot({ path: join(chartsDir, `${c.id}-new.png`), fullPage: true });
      const newErrors = [...newLog.errors];

      const oldVsPred: FieldDiff[] = diff(oldRead, expOld);
      const newVsFixed: FieldDiff[] = diff(newRead, expNew);
      const oldVsNew: FieldDiff[] = diff(oldRead, newRead);
      const notCovered = uncovered(oldVsNew, tags, expNew, model.correctionIds, corrections);
      const blankOld = oldIndicesShown && oldInk.some((v) => v < MIN_INK);
      const blankNew = newIndicesShown ? newMarks.some((v) => !(v > 0)) : newEmpty !== 3 || newMarks.some((v) => v > 0);

      // max is recorded only: tick generation differs between Chart.js 2 and the new SVG axis
      const qiAxisBad = REVIEW_IDS.has(c.id) && oldIndicesShown && newIndicesShown && (oldAxis === null || newAxis === null || oldAxis.min !== newAxis.min);
      if (REVIEW_IDS.has(c.id)) record.qiAxis = { old: oldAxis, new: newAxis };
      if (qiAxisBad) record.regressionField = 'qiAxis.min';

      Object.assign(record, {
        chartInk: { old: oldInk },
        chartMarks: { new: newMarks, emptyStates: newEmpty },
        blankCharts: { old: blankOld, new: blankNew },
        consoleErrors: { old: oldErrors, new: newErrors },
        oldConsole,
        oldCrash: { observed: oldRead.crashed, predicted: expOld.crashed },
        oldVsPrediction: oldVsPred,
        newVsFixedModel: newVsFixed,
        oldVsNew,
        uncovered: notCovered,
        oldReading: oldRead,
        newReading: newRead,
      });

      // old-side console verdict: unclassified record or classified kind not predicted -> regression; predicted kind not observed -> old-model-mismatch
      const oldRegression = oldConsole.unclassified.length > 0 || oldConsole.observed.some((k) => !oldConsole.predicted.includes(k));
      const oldMissing = oldConsole.predicted.some((k) => !oldConsole.observed.includes(k));
      if (oldRegression) verdict = 'regression';
      else if (oldVsPred.length > 0 || blankOld || oldMissing) verdict = 'old-model-mismatch';
      else if (newVsFixed.length > 0 || notCovered.length > 0 || blankNew || newErrors.length > 0 || qiAxisBad) verdict = 'regression';
      else verdict = tags.length > 0 && oldVsNew.length > 0 ? 'expected-diff' : 'pass';
    } catch (e) {
      record.error = String((e as Error).stack ?? e);
      verdict = 'harness-failure';
    }
    record.verdict = verdict;
    record.tags = tags;
    record.ads = {
      blocked: oldAds.blocked.length + newAds.blocked.length - adBlockedBefore,
      responses: oldAds.adResponses.length + newAds.adResponses.length - adRespBefore,
    };
    writeFileSync(join(casesDir, `${c.id}.json`), JSON.stringify(record, null, 1) + '\n');
    // the test never fails on a verdict, so the whole run completes
  });
}


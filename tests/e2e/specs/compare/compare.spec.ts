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
import { canvasInkRatio, NEW_CHARTS, OLD_CHART_INSTANCES, oldCanvasInkRatio } from '../helpers/canvas';
import { diff, uncovered } from '../helpers/compare';
import type { FieldDiff, Verdict } from '../helpers/compare';
import { collectErrors } from '../helpers/console';
import type { ConsoleOptions, ErrorLog } from '../helpers/console';
import { expectedNew, expectedOld } from '../helpers/expected';
import { e2eDir, reportsDir } from '../helpers/paths';
import { readNew } from '../helpers/read-new';
import { installOldTraps, OLD_URL, readOld } from '../helpers/read-old';

const casesFile = join(e2eDir, '.tmp/cases.json');
const predFile = join(e2eDir, '.tmp/predictions-old.json');
if (!existsSync(casesFile) || !existsSync(predFile)) throw new Error('run scripts/run-compare.mjs (or generate-cases + predict-old) first');

interface Prediction {
  id: string;
  old: OldResult;
  oldCorrected?: OldResult;
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
let oldLog: ErrorLog;
let newLog: ErrorLog;
const oldOpts: ConsoleOptions = { oldNullChart: true, oldThrows: false };

test.beforeAll(async ({ browser }) => {
  oldCtx = await browser.newContext();
  newCtx = await browser.newContext();
  await installOldTraps(oldCtx);
  oldAds = await blockAds(oldCtx);
  newAds = await blockAds(newCtx);
  oldPage = await oldCtx.newPage();
  newPage = await newCtx.newPage();
  oldLog = collectErrors(oldPage, oldOpts);
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
      const model = fixedModel(input, { ...pred.old, oldCorrected: pred.oldCorrected }, keySets, corrections);
      tags = model.tags;
      const expOld = expectedOld(pred.old);
      const expNew = expectedNew(model.expected);
      record.age = pred.old.age as Age | null;
      record.tags = tags;
      record.expectedOldCrash = expOld.crashed;

      // old app
      oldOpts.oldThrows = pred.old.throws;
      oldLog.clear();
      await oldPage.goto(OLD_URL);
      const oldRead = await readOld(oldPage, c, pred.old.age !== null);
      const oldIndicesShown = pred.old.indicesShown && !pred.old.throws;
      let oldInk: number[] = [0, 0, 0];
      if (oldIndicesShown) oldInk = await Promise.all(OLD_CHART_INSTANCES.map((i) => pollInk(() => oldCanvasInkRatio(oldPage, i))));
      if (REVIEW_IDS.has(c.id)) await oldPage.screenshot({ path: join(chartsDir, `${c.id}-old.png`), fullPage: true });
      const oldErrors = [...oldLog.errors];

      // new app (reloads inside readNew)
      newLog.clear();
      const newRead = await readNew(newPage, c);
      const newIndicesShown = model.expected.indicesShown;
      let newInk: number[] = [0, 0, 0];
      if (newIndicesShown) newInk = await Promise.all(NEW_CHARTS.map((ch) => pollInk(() => canvasInkRatio(newPage.getByTestId(ch)))));
      if (REVIEW_IDS.has(c.id)) await newPage.screenshot({ path: join(chartsDir, `${c.id}-new.png`), fullPage: true });
      const newErrors = [...newLog.errors];

      const oldVsPred: FieldDiff[] = diff(oldRead, expOld);
      const newVsFixed: FieldDiff[] = diff(newRead, expNew);
      const oldVsNew: FieldDiff[] = diff(oldRead, newRead);
      const notCovered = uncovered(oldVsNew, tags, expNew);
      const blankOld = oldIndicesShown && oldInk.some((v) => v < MIN_INK);
      const blankNew = newIndicesShown && newInk.some((v) => v < MIN_INK);

      Object.assign(record, {
        chartInk: { old: oldInk, new: newInk },
        blankCharts: { old: blankOld, new: blankNew },
        consoleErrors: { old: oldErrors, new: newErrors },
        oldVsPrediction: oldVsPred,
        newVsFixedModel: newVsFixed,
        oldVsNew,
        uncovered: notCovered,
        oldReading: oldRead,
        newReading: newRead,
      });

      if (oldVsPred.length > 0 || blankOld) verdict = 'old-model-mismatch';
      else if (newVsFixed.length > 0 || notCovered.length > 0 || blankNew || newErrors.length > 0 || oldErrors.length > 0) verdict = 'regression';
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


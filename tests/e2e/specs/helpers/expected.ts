import { comparisonBand, formatCi, formatPercentile } from '../../../../web/src/engine/format';
import type { IndexName } from '../../../../web/src/engine/types';
import { INDEX_NAMES } from '../../../../web/src/engine/types';
import { pt } from '../../../../web/src/i18n/pt';
import type { ExpectedCase, OldResult } from '../../../../web/test/shared/fixed-model';
import { TEST_IDS } from '../../../../web/test/shared/fixed-model';
import { LOCALE } from './format';
import { ageOf, emptyReading, normCi, type Cols5, type Reading } from './reading';

const cell = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));
const ci = (v: number[] | null | undefined): string => normCi(v ? formatCi(v as [number, number]) : '');
const clsText = (e: string) => pt[`QI.AverageComparison.${e}`];
const UNAVAILABLE = '—';

/** What the old app must show, from the oracle prediction (the old app's recorded outcome). */
export function expectedOld(old: OldResult): Reading {
  if (old.throws) return emptyReading({ stage: old.throwStage ?? 'age', test: old.throwAt?.test ?? null });
  const r = emptyReading();
  r.age = ageOf(old.age);
  for (const id of TEST_IDS) r.scaled[id] = old.tests![id].scaled.map(cell) as unknown as Cols5;
  const s = old.sums;
  r.sums = s
    ? [s.verbal, s.realization, s.verbalComprehension, s.perceptiveOrganization, s.processingVelocity, s.complete].map(cell)
    : ['', '', '', '', '', ''];
  for (const name of INDEX_NAMES as readonly IndexName[]) {
    const e = old.indices?.[name];
    if (!old.indicesShown || !e) continue;
    r.indices[name] = {
      sum: cell(e.sum),
      iq: cell(e.iq),
      cls: e.comparison ? clsText(e.comparison) : null,
      pct: (e.percentile ?? '').replace('.', ','),
      ci90: ci(e.ci90),
      ci95: ci(e.ci95),
    };
  }
  r.charts = old.indicesShown ? old.charts : null;
  return r;
}

/** What the new app must show, from the fixed-model snapshot. */
export function expectedNew(exp: ExpectedCase): Reading {
  const r = emptyReading();
  r.age = ageOf(exp.age);
  for (const id of TEST_IDS) r.scaled[id] = exp.tests[id].scaled.map(cell) as unknown as Cols5;
  const s = exp.sums;
  r.sums = [s.verbal, s.realization, s.verbalComprehension, s.perceptiveOrganization, s.processingVelocity, s.complete].map(cell);
  for (const name of INDEX_NAMES as readonly IndexName[]) {
    const row = exp.indices[name];
    if (!row) continue;
    const e = row.entry;
    if (e === 'unavailable') {
      r.indices[name] = { sum: cell(row.sum), iq: UNAVAILABLE, cls: null, pct: UNAVAILABLE, ci90: UNAVAILABLE, ci95: UNAVAILABLE };
    } else {
      r.indices[name] = {
        sum: cell(row.sum),
        iq: String(e.iq),
        cls: clsText(comparisonBand(e.iq)),
        pct: formatPercentile(e.percentile, LOCALE),
        ci90: ci(e.ci90),
        ci95: ci(e.ci95),
      };
    }
  }
  r.charts = exp.indicesShown ? exp.charts : null;
  return r;
}

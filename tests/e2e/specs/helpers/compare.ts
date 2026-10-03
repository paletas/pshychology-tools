import { chartsToMaps } from '../../../../web/test/shared/fixed-model';
import type { Tag } from '../../../../web/test/shared/fixed-model';
import type { IndexName } from '../../../../web/src/engine/types';
import { INDEX_NAMES } from '../../../../web/src/engine/types';
import type { Reading } from './reading';

export type Verdict = 'pass' | 'expected-diff' | 'regression' | 'old-model-mismatch' | 'harness-failure';

export interface FieldDiff {
  field: string;
  a: string;
  b: string;
}

function flat(prefix: string, v: unknown, out: Record<string, string>): void {
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) flat(`${prefix}.${k}`, x, out);
  } else {
    out[prefix] = v === null || v === undefined ? 'null' : String(v);
  }
}

/** Every displayed field of a reading as `field -> text`. */
export function flatten(r: Reading): Record<string, string> {
  const out: Record<string, string> = {};
  out.crashed = r.crashed ? `${r.crashed.stage}${r.crashed.test ? `:${r.crashed.test}` : ''}` : '';
  r.age.forEach((v, i) => (out[`age.${i}`] = v === null ? '' : String(v)));
  for (const [id, cols] of Object.entries(r.scaled)) cols.forEach((v, i) => (out[`scaled.${id}.${i}`] = v));
  r.sums.forEach((v, i) => (out[`sums.${i}`] = v));
  for (const name of INDEX_NAMES) {
    const ix = r.indices[name];
    out[`index.${name}.sum`] = ix.sum;
    out[`index.${name}.iq`] = ix.iq;
    out[`index.${name}.cls`] = ix.cls ?? '';
    out[`index.${name}.pct`] = ix.pct;
    out[`index.${name}.ci90`] = ix.ci90;
    out[`index.${name}.ci95`] = ix.ci95;
  }
  if (r.charts === null) {
    out.chart = 'none';
  } else {
    try {
      flat('chart', chartsToMaps(r.charts), out);
    } catch (e) {
      out['chart.error'] = String((e as Error).message);
    }
  }
  return out;
}

export function diff(a: Reading, b: Reading): FieldDiff[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
  return keys.filter((k) => fa[k] !== fb[k]).map((k) => ({ field: k, a: fa[k] ?? '(absent)', b: fb[k] ?? '(absent)' }));
}

const QI_CHART_POS: Record<string, [string, number]> = {
  verbal: ['QI', 0],
  realization: ['QI', 1],
  completeScale: ['QI', 2],
  verbalComprehension: ['Indices', 0],
  perceptiveOrganization: ['Indices', 1],
  processingVelocity: ['Indices', 2],
};

/** Fields an `index-missing-key` case may change: that index's IQ, classification, percentile, CI fields and its QI-chart entry. */
function indexMissingKeyCovers(field: string, unavailable: IndexName[]): boolean {
  return unavailable.some((n) => {
    if (/^index\.[A-Za-z]+\.(iq|cls|pct|ci90|ci95)$/.test(field) && field.startsWith(`index.${n}.`)) return true;
    const [grp, pos] = QI_CHART_POS[n];
    return field.startsWith(`chart.qi.${grp}.${pos}.`);
  });
}

/** Old-vs-new diff fields not covered by the case's tags. */
export function uncovered(diffs: FieldDiff[], tags: Tag[], expectedNew: Reading): FieldDiff[] {
  if (tags.some((t) => t === 'gate-low' || t === 'gate-high-throw' || t === 'manual-correction')) return [];
  const unavailable = INDEX_NAMES.filter((n) => expectedNew.indices[n].iq === '—');
  return diffs.filter((d) => !(tags.includes('index-missing-key') && indexMissingKeyCovers(d.field, unavailable)));
}

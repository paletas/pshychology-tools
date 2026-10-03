import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { chartPayloads } from '../../src/engine/charts';
import { comparisonBand } from '../../src/engine/format';
import { scoreCase } from '../../src/engine/scoring';
import { INDEX_NAMES } from '../../src/engine/types';
import type { IndexName } from '../../src/engine/types';
import { pt } from '../../src/i18n/pt';
import { chartsToMaps, fixedModel } from '../shared/fixed-model';
import type { GoldenCorrection, KeySets } from '../shared/fixed-model';
import { goldenDir, loadData, loadGolden } from '../shared/load';

const data = loadData();
const CORRECTION_IDS = ['C1', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];

describe('scenarios vs fixed model', () => {
  it('scoreCase + chartPayloads equal the predicted outcome for every scenario', () => {
    const file = resolve(goldenDir, 'scenarios.json');
    if (!existsSync(file)) throw new Error('run oracle golden first');
    const scenarios: any[] = JSON.parse(readFileSync(file, 'utf8'));
    const idx = loadGolden<Record<string, any[]>>('indices.json');
    const keySets = Object.fromEntries(
      INDEX_NAMES.map((n) => [n, new Set<number>(idx[n].filter((r) => r.inTable).map((r) => r.sum))]),
    ) as KeySets;
    const corrections = loadGolden<GoldenCorrection[]>('corrections.json');

    const tagCounts: Record<string, number> = {};
    const correctionHits: Record<string, number> = Object.fromEntries(CORRECTION_IDS.map((id) => [id, 0]));
    const failures: string[] = [];
    const ageKey = (a: number[]) => a[0] * 10000 + a[1] * 100 + a[2];
    const highBad: string[] = [];
    const lowBad: string[] = [];
    let untaggedAbove17y3m = 0;
    for (const s of scenarios) {
      const { expected, tags, correctionIds } = fixedModel(s, { ...s.old, correctionsHit: s.correctionsHit, oldCorrected: s.oldCorrected }, keySets, corrections);
      for (const t of tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      for (const id of correctionIds) correctionHits[id] = (correctionHits[id] ?? 0) + 1;
      const k = s.old.age ? ageKey(s.old.age) : null;
      if (tags.includes('gate-high-throw') && !(k !== null && k >= ageKey([17, 0, 0]) && k <= ageKey([17, 2, 30]))) highBad.push(s.id);
      if (tags.includes('gate-low') && !(k !== null && k >= ageKey([5, 10, 0]) && k <= ageKey([5, 11, 30]))) lowBad.push(s.id);
      if (k !== null && k >= ageKey([17, 3, 0]) && tags.length === 0) untaggedAbove17y3m++;
      const actual = scoreCase(data, s);
      const { charts: expCharts, ...expSnap } = expected;
      const actCharts = chartPayloads(actual, pt);
      const okSnap = isDeepStrictEqual(actual, expSnap);
      const okCharts = isDeepStrictEqual(chartsToMaps(actCharts), chartsToMaps(expCharts));
      let okCls = true;
      const base = tags.includes('manual-correction') ? s.oldCorrected : s.old;
      if (okSnap && base?.indices && actual.indicesShown) {
        for (const n of INDEX_NAMES as readonly IndexName[]) {
          const e = actual.indices[n]?.entry;
          const o = base.indices[n];
          if (e && e !== 'unavailable' && o && comparisonBand(e.iq) !== o.comparison) okCls = false;
        }
      }
      if (!(okSnap && okCharts && okCls)) {
        failures.push(s.id);
        if (failures.length <= 3) {
          expect(actual, `snapshot ${s.id}`).toEqual(expSnap);
          expect(chartsToMaps(actCharts), `charts ${s.id}`).toEqual(chartsToMaps(expCharts));
          expect(okCls, `classification ${s.id}`).toBe(true);
        }
      }
    }
    console.log(`scenarios.golden count=${scenarios.length} tags=${JSON.stringify(tagCounts)} failures=${failures.length}`);
    expect(failures).toEqual([]);
    console.log(`correctionHits ${CORRECTION_IDS.map((id) => `${id}=${correctionHits[id]}`).join(' ')}`);
    for (const id of CORRECTION_IDS) expect(correctionHits[id], `correction ${id} hit`).toBeGreaterThanOrEqual(1);
    console.log(`gateHighAgeRange=17y0m0d..17y2m30d gateLowAgeRange=5y10m0d..5y11m30d untaggedAbove17y3m=${untaggedAbove17y3m}`);
    expect(highBad).toEqual([]);
    expect(lowBad).toEqual([]);
    expect(untaggedAbove17y3m).toBeGreaterThanOrEqual(1);
    expect(scenarios.length).toBeGreaterThanOrEqual(10000);
    expect(tagCounts['manual-correction'] ?? 0).toBeGreaterThanOrEqual(1);
  });
});

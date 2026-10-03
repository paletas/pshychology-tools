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
    const failures: string[] = [];
    for (const s of scenarios) {
      const { expected, tags } = fixedModel(s, { ...s.old, oldCorrected: s.oldCorrected }, keySets, corrections);
      for (const t of tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      const actual = scoreCase(data, s);
      const { charts: expCharts, ...expSnap } = expected;
      const actCharts = chartPayloads(actual, pt);
      const okSnap = isDeepStrictEqual(actual, expSnap);
      const okCharts = isDeepStrictEqual(chartsToMaps(actCharts), chartsToMaps(expCharts));
      let okCls = true;
      const base = s.old.throws && s.old.throwStage === 'raw' ? s.oldCorrected : s.old;
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
    expect(scenarios.length).toBeGreaterThanOrEqual(10000);
    expect(tagCounts['manual-correction'] ?? 0).toBeGreaterThanOrEqual(1);
  });
});

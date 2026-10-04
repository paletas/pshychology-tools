import { describe, expect, it } from 'vitest';
import { lookupIndex } from '../../src/engine/scoring';
import { INDEX_NAMES } from '../../src/engine/types';
import type { GoldenCorrection } from '../shared/fixed-model';
import { loadData, loadGoldenOriginal } from '../shared/load';

const data = loadData();
const golden = loadGoldenOriginal<Record<string, any[]>>('indices.json');
const corrections = loadGoldenOriginal<GoldenCorrection[]>('corrections.json').filter((c) => c.kind === 'index');

describe('indices vs golden-original', () => {
  it('inTable rows equal golden (corrected cells equal golden corrected), non-key rows unavailable', () => {
    let inTable = 0;
    let missing = 0;
    let correctedCells = 0;
    for (const name of INDEX_NAMES) {
      const keys = new Set(golden[name].filter((r) => r.inTable).map((r) => String(r.sum)));
      expect(new Set(Object.keys(data.indices[name]))).toEqual(keys);
      for (const r of golden[name]) {
        const got = lookupIndex(data, name, r.sum);
        if (r.inTable) {
          expect(got, `${name} ${r.sum}`).not.toBe('unavailable');
          if (got === 'unavailable') continue;
          const expected = { iq: r.iq as number, percentile: r.percentile as string, ci90: [...r.ci90] as number[], ci95: [...r.ci95] as number[] };
          for (const c of corrections.filter((x) => x.index === name && x.sum === r.sum)) {
            if (c.field === 'iq') expected.iq = c.corrected;
            else if (c.field === 'percentile') expected.percentile = c.corrected;
            else if (c.field === 'ci95Lower') expected.ci95[0] = c.corrected;
            else expected.ci95[1] = c.corrected;
            correctedCells++;
          }
          expect(got.iq, `${name} ${r.sum} iq`).toBe(expected.iq);
          expect(got.ci90, `${name} ${r.sum} ci90`).toEqual(expected.ci90);
          expect(got.ci95, `${name} ${r.sum} ci95`).toEqual(expected.ci95);
          expect(String(got.percentile), `${name} ${r.sum} percentile`).toBe(expected.percentile);
          inTable++;
        } else {
          expect(got).toBe('unavailable');
          missing++;
        }
      }
    }
    console.log(`indices.golden inTable=${inTable} unavailable=${missing} correctedCells=${correctedCells}`);
    expect(correctedCells).toBe(42);
    expect(correctedCells).toBe(corrections.length);
    expect(inTable).toBeGreaterThan(400);
  });
});

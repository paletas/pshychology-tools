import { describe, expect, it } from 'vitest';
import { lookupIndex } from '../../src/engine/scoring';
import { INDEX_NAMES } from '../../src/engine/types';
import { loadData, loadGolden } from '../shared/load';

const data = loadData();
const golden = loadGolden<Record<string, any[]>>('indices.json');

describe('indices vs golden', () => {
  it('inTable rows equal, non-key rows unavailable', () => {
    let inTable = 0;
    let missing = 0;
    for (const name of INDEX_NAMES) {
      const keys = new Set(golden[name].filter((r) => r.inTable).map((r) => String(r.sum)));
      expect(new Set(Object.keys(data.indices[name]))).toEqual(keys);
      for (const r of golden[name]) {
        const got = lookupIndex(data, name, r.sum);
        if (r.inTable) {
          expect(got, `${name} ${r.sum}`).not.toBe('unavailable');
          if (got === 'unavailable') continue;
          expect(got.iq).toBe(r.iq);
          expect(got.ci90).toEqual(r.ci90);
          expect(got.ci95).toEqual(r.ci95);
          expect(String(got.percentile), `${name} ${r.sum} percentile`).toBe(r.percentile);
          inTable++;
        } else {
          expect(got).toBe('unavailable');
          missing++;
        }
      }
    }
    console.log(`indices.golden inTable=${inTable} unavailable=${missing}`);
    expect(inTable).toBeGreaterThan(400);
  });
});

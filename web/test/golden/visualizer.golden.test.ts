import { describe, expect, it } from 'vitest';
import { lookupGrid } from '../../src/engine/bands';
import type { GoldenCorrection } from '../shared/fixed-model';
import { loadData, loadGoldenOriginal } from '../shared/load';

const data = loadData();
const golden = loadGoldenOriginal<{ bands: any[] }>('subtests.json');
const corrections = loadGoldenOriginal<GoldenCorrection[]>('corrections.json').filter((c) => c.kind === 'scaled');

describe('lookup-table visualizer grid (golden-original)', () => {
  it('equals the raw ranges derived from the golden rows (scaled corrections applied)', () => {
    let cells = 0;
    for (const band of golden.bands) {
      const grid = lookupGrid(data, band.id);
      for (const [testId, g] of Object.entries<any>(band.tests)) {
        // same algorithm as WISC3LookupTableVisualizer: first/last raw per scaled value (Verbal ?? Realization)
        const derived: ([number, number] | null)[] = Array.from({ length: 20 }, () => null);
        for (const row of g.rows as (number | null)[][]) {
          const raw = row[0] as number;
          let s: number | null = row[1] ?? row[2];
          const c = corrections.find((x) => x.band === band.id && x.test === testId && x.raw === raw);
          if (c) s = c.corrected[0] ?? c.corrected[1];
          if (s === null) continue;
          const cur = derived[s];
          derived[s] = cur ? [cur[0], raw] : [raw, raw];
        }
        expect(grid[testId], `${band.id} ${testId}`).toEqual(derived);
        cells++;
      }
    }
    console.log(`visualizer.golden band-tests=${cells}`);
    expect(cells).toBe(22 * 13);
  });
});

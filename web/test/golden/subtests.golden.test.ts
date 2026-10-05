import { describe, expect, it } from 'vitest';
import { scaledFor, selectBand } from '../../src/engine/bands';
import { COLUMNS } from '../../src/engine/types';
import type { GoldenCorrection } from '../shared/fixed-model';
import { loadData, loadGoldenOriginal } from '../shared/load';

const data = loadData();
const golden = loadGoldenOriginal<{ bands: any[] }>('subtests.json');
const corrections = loadGoldenOriginal<GoldenCorrection[]>('corrections.json').filter((c) => c.kind === 'scaled');

const columnsFor = (testId: string, s: number | null) => {
  const cols = data.tests.find((t) => t.id === testId)!.columns;
  return COLUMNS.map((c) => (cols.includes(c) ? s : null));
};

// Against golden-original (the pre-fix tables, REV-11); the live fixed tables are checked by fixed-old.golden.
describe('subtests vs golden-original', () => {
  it('every row matches the old table, except the corrected cells which match golden corrected', () => {
    let rows = 0;
    let corrected = 0;
    let gaps = 0;
    for (const band of golden.bands) {
      expect(selectBand(data, band.age)?.id, `band for ${band.id}`).toBe(band.id);
      for (const [testId, g] of Object.entries<any>(band.tests)) {
        const gapSet = new Set<number>(g.gaps ?? []);
        for (const row of g.rows as (number | null)[][]) {
          const raw = row[0] as number;
          const got = scaledFor(data, band.id, testId, raw);
          const c = corrections.find((x) => x.band === band.id && x.test === testId && x.raw === raw);
          if (gapSet.has(raw)) expect(c, `gap ${band.id} ${testId} ${raw} must be a listed correction`).toBeDefined();
          if (c) {
            expect(columnsFor(testId, got), `${c.id} ${band.id} ${testId} ${raw}`).toEqual(c.corrected);
            corrected++;
            if (gapSet.has(raw)) gaps++;
          } else {
            expect(columnsFor(testId, got), `${band.id} ${testId} ${raw}`).toEqual(row.slice(1));
            rows++;
          }
        }
        expect(scaledFor(data, band.id, testId, g.min - 1)).toBeNull();
        expect(scaledFor(data, band.id, testId, g.max + 1)).toBeNull();
      }
    }
    console.log(`subtests.golden rows=${rows} correctedRows=${corrected} gapRows=${gaps}`);
    expect(corrected).toBe(corrections.length);
    expect(corrected).toBe(9);
    expect(gaps).toBe(1);
    expect(rows).toBeGreaterThan(13000);
  });
});

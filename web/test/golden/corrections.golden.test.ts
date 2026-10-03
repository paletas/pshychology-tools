import { describe, expect, it } from 'vitest';
import { scaledFor } from '../../src/engine/bands';
import { lookupIndex } from '../../src/engine/scoring';
import { INDEX_NAMES } from '../../src/engine/types';
import { loadData, loadGolden } from '../shared/load';

const data = loadData();
const golden = loadGolden<{ bands: any[] }>('subtests.json');
const goldenIdx = loadGolden<Record<string, any[]>>('indices.json');

describe('data/ differs from the old tables only by the confirmed correction', () => {
  it('tableDiffCells=1 indexDiffCells=0', () => {
    const diffs: string[] = [];
    for (const band of golden.bands) {
      for (const [testId, g] of Object.entries<any>(band.tests)) {
        const gapSet = new Set<number>(g.gaps ?? []);
        for (const row of g.rows as (number | null)[][]) {
          const raw = row[0] as number;
          const newer = scaledFor(data, band.id, testId, raw);
          const older = gapSet.has(raw) ? 'throws' : (row.slice(1).find((v) => v !== null) ?? null);
          if (older !== newer) diffs.push(`${band.id} ${testId} raw ${raw}: old ${older} -> ${newer}`);
        }
      }
    }
    let indexDiff = 0;
    for (const name of INDEX_NAMES) {
      for (const r of goldenIdx[name]) {
        const got = lookupIndex(data, name, r.sum);
        const older = r.inTable ? `${r.iq}|${r.percentile}|${r.ci90}|${r.ci95}` : 'unavailable';
        const newer = got === 'unavailable' ? got : `${got.iq}|${got.percentile}|${got.ci90}|${got.ci95}`;
        if (older !== newer) indexDiff++;
      }
    }
    console.log(`tableDiffCells=${diffs.length} indexDiffCells=${indexDiff}`);
    expect(diffs).toEqual(['11y06m ImageDisposition raw 38: old throws -> 13']);
    expect(indexDiff).toBe(0);
  });
});

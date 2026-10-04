import { describe, expect, it } from 'vitest';
import { loadData, loadGolden } from '../shared/load';
import { tableDiff } from '../shared/table-diff';

// REV-11: the old app's tables (the live oracle golden) already contain the approved corrections, so they equal data/ exactly.
describe('fixed old app tables vs data/', () => {
  it('fixedOldVsData scaled=0 index=0 and no gap is left', () => {
    const data = loadData();
    const golden = loadGolden<{ bands: any[] }>('subtests.json');
    const goldenIdx = loadGolden<Record<string, any[]>>('indices.json');
    const { scaled, index } = tableDiff(data, golden, goldenIdx);
    const gaps = golden.bands.reduce((n, b) => n + Object.values<any>(b.tests).reduce((m, t) => m + (t.gaps?.length ?? 0), 0), 0);
    console.log(`fixedOldVsData scaled=${scaled.size} index=${index.size} gaps=${gaps}`);
    expect([...scaled]).toEqual([]);
    expect([...index]).toEqual([]);
    expect(gaps).toBe(0);
  });
});

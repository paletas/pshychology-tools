import { describe, expect, it } from 'vitest';
import type { GoldenCorrection } from '../shared/fixed-model';
import { loadData, loadGoldenOriginal } from '../shared/load';
import { tableDiff } from '../shared/table-diff';

const data = loadData();
// REV-11: the pre-fix tables of the old app are frozen in golden-original; the live golden is the fixed old app (fixed-old.golden).
const golden = loadGoldenOriginal<{ bands: any[] }>('subtests.json');
const goldenIdx = loadGoldenOriginal<Record<string, any[]>>('indices.json');
const corrections = loadGoldenOriginal<GoldenCorrection[]>('corrections.json');

const firstScaled = (cols: (number | null)[]) => cols.find((v) => v !== null) ?? null;

describe('data/ differs from the original old tables (golden-original) only by the approved corrections', () => {
  it('tableDiffCells=9 indexDiffCells=42', () => {
    const { scaled: diffs, index: indexDiffs } = tableDiff(data, golden, goldenIdx);
    const expectedScaled = new Set(
      corrections
        .filter((c) => c.kind === 'scaled')
        .map((c) => `${c.band}|${c.test}|${c.raw}|${c.old.throws ? 'throws' : firstScaled(c.old.scaled)}|${firstScaled(c.corrected)}`),
    );
    const expectedIndex = new Set(
      corrections.filter((c) => c.kind === 'index').map((c) => `${c.index}|${c.sum}|${c.field}|${c.old}|${c.corrected}`),
    );
    console.log(`tableDiffCells=${diffs.size} indexDiffCells=${indexDiffs.size}`);
    expect([...diffs].sort()).toEqual([...expectedScaled].sort());
    expect([...indexDiffs].sort()).toEqual([...expectedIndex].sort());
    expect(diffs.size).toBe(9);
    expect(indexDiffs.size).toBe(42);
  });
});

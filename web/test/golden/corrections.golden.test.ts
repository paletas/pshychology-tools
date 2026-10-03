import { describe, expect, it } from 'vitest';
import { scaledFor } from '../../src/engine/bands';
import { lookupIndex } from '../../src/engine/scoring';
import { INDEX_NAMES } from '../../src/engine/types';
import type { GoldenCorrection } from '../shared/fixed-model';
import { loadData, loadGolden } from '../shared/load';

const data = loadData();
const golden = loadGolden<{ bands: any[] }>('subtests.json');
const goldenIdx = loadGolden<Record<string, any[]>>('indices.json');
const corrections = loadGolden<GoldenCorrection[]>('corrections.json');

const firstScaled = (cols: (number | null)[]) => cols.find((v) => v !== null) ?? null;

describe('data/ differs from the old tables only by the approved corrections', () => {
  it('tableDiffCells=9 indexDiffCells=42', () => {
    const diffs = new Set<string>();
    for (const band of golden.bands) {
      for (const [testId, g] of Object.entries<any>(band.tests)) {
        const gapSet = new Set<number>(g.gaps ?? []);
        for (const row of g.rows as (number | null)[][]) {
          const raw = row[0] as number;
          const newer = scaledFor(data, band.id, testId, raw);
          const older = gapSet.has(raw) ? 'throws' : firstScaled(row.slice(1));
          if (older !== newer) diffs.add(`${band.id}|${testId}|${raw}|${older}|${newer}`);
        }
      }
    }
    const indexDiffs = new Set<string>();
    for (const name of INDEX_NAMES) {
      for (const r of goldenIdx[name]) {
        const got = lookupIndex(data, name, r.sum);
        if (!r.inTable) {
          if (got !== 'unavailable') indexDiffs.add(`${name}|${r.sum}|unexpected-key`);
          continue;
        }
        if (got === 'unavailable') {
          indexDiffs.add(`${name}|${r.sum}|missing-key`);
          continue;
        }
        const cmp = (field: string, a: unknown, b: unknown) => {
          if (String(a) !== String(b)) indexDiffs.add(`${name}|${r.sum}|${field}|${a}|${b}`);
        };
        cmp('iq', r.iq, got.iq);
        cmp('percentile', r.percentile, got.percentile);
        cmp('ci90Lower', r.ci90[0], got.ci90[0]);
        cmp('ci90Upper', r.ci90[1], got.ci90[1]);
        cmp('ci95Lower', r.ci95[0], got.ci95[0]);
        cmp('ci95Upper', r.ci95[1], got.ci95[1]);
      }
    }
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

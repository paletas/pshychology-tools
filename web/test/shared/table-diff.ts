// Test-only. Cell-level diff of a golden table set (subtests.json + indices.json rows) against the bundled data/.
import { scaledFor } from '../../src/engine/bands';
import { lookupIndex } from '../../src/engine/scoring';
import { INDEX_NAMES } from '../../src/engine/types';
import type { RefData } from '../../src/engine/types';

const firstScaled = (cols: (number | null)[]) => cols.find((v) => v !== null) ?? null;

/** Scaled cells are "band|test|raw|golden|data" (golden "throws" for a gap row); index cells are "index|sum|field|golden|data". */
export function tableDiff(data: RefData, golden: { bands: any[] }, goldenIdx: Record<string, any[]>): { scaled: Set<string>; index: Set<string> } {
  const scaled = new Set<string>();
  for (const band of golden.bands) {
    for (const [testId, g] of Object.entries<any>(band.tests)) {
      const gapSet = new Set<number>(g.gaps ?? []);
      for (const row of g.rows as (number | null)[][]) {
        const raw = row[0] as number;
        const newer = scaledFor(data, band.id, testId, raw);
        const older = gapSet.has(raw) ? 'throws' : firstScaled(row.slice(1));
        if (older !== newer) scaled.add(`${band.id}|${testId}|${raw}|${older}|${newer}`);
      }
    }
  }
  const index = new Set<string>();
  for (const name of INDEX_NAMES) {
    for (const r of goldenIdx[name]) {
      const got = lookupIndex(data, name, r.sum);
      if (!r.inTable) {
        if (got !== 'unavailable') index.add(`${name}|${r.sum}|unexpected-key`);
        continue;
      }
      if (got === 'unavailable') {
        index.add(`${name}|${r.sum}|missing-key`);
        continue;
      }
      const cmp = (field: string, a: unknown, b: unknown) => {
        if (String(a) !== String(b)) index.add(`${name}|${r.sum}|${field}|${a}|${b}`);
      };
      cmp('iq', r.iq, got.iq);
      cmp('percentile', r.percentile, got.percentile);
      cmp('ci90Lower', r.ci90[0], got.ci90[0]);
      cmp('ci90Upper', r.ci90[1], got.ci90[1]);
      cmp('ci95Lower', r.ci95[0], got.ci95[0]);
      cmp('ci95Upper', r.ci95[1], got.ci95[1]);
    }
  }
  return { scaled, index };
}

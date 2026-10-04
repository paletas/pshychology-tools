import { formatCi, formatPercentile } from '../../../../web/src/engine/format';
import type { RefData, Snapshot } from '../../../../web/src/engine/types';
import { COLUMNS, INDEX_NAMES } from '../../../../web/src/engine/types';

export const LOCALE = 'pt-PT';

/** Cell texts the new UI must show for a snapshot, keyed by data-testid (mirrors SubtestTable / IndexTable). Default CI is 95%. */
export function expectedCells(data: RefData, s: Snapshot, ci: 'Percentil90' | 'Percentil95' = 'Percentil95'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of data.tests) {
    const snap = s.tests[t.id];
    // one value per row (the columns it stands for are in data-columns)
    out[`scaled-${t.id}`] = String(snap.scaled.find((v) => v !== null && v !== undefined) ?? '');
  }
  for (const c of COLUMNS) out[`sum-${c}`] = String(s.sums[c]);
  out['sum-complete'] = String(s.sums.complete);
  for (const name of INDEX_NAMES) {
    const row = s.indices[name];
    const entry = row?.entry;
    const ok = entry && entry !== 'unavailable' ? entry : null;
    const unavailable = entry === 'unavailable';
    out[`index-sum-${name}`] = row ? String(row.sum) : '';
    out[`index-iq-${name}`] = unavailable ? '—' : ok ? String(ok.iq) : '';
    out[`index-pct-${name}`] = unavailable ? '—' : ok ? formatPercentile(ok.percentile, LOCALE) : '';
    out[`index-ci-${name}`] = unavailable ? '—' : formatCi(ok ? (ci === 'Percentil90' ? ok.ci90 : ok.ci95) : null);
  }
  return out;
}

/** Index names whose classification arrow must be present (an entry that is not unavailable). */
export function expectedArrows(s: Snapshot): string[] {
  return INDEX_NAMES.filter((n) => {
    const e = s.indices[n]?.entry;
    return !!e && e !== 'unavailable';
  });
}

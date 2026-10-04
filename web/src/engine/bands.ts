import { compareAge } from './gate';
import type { Age, Band, RefData } from './types';

/** First band (in order) whose [from, to] contains the age; null when none. */
export function selectBand(data: RefData, age: Age): Band | null {
  return data.bands.find((b) => compareAge(age, b.from) >= 0 && compareAge(age, b.to) <= 0) ?? null;
}

/** Scaled value for a raw score, or null when the raw is outside min..max or unmapped. */
export function scaledFor(data: RefData, bandId: string, testId: string, raw: number): number | null {
  const e = data.subtests[bandId]?.[testId];
  if (!e || raw < e.min || raw > e.max) return null;
  for (const [s, r] of Object.entries(e.scaled)) if (raw >= r[0] && raw <= r[1]) return Number(s);
  return null;
}

/**
 * Lookup-table visualizer grid: per test, index = scaled value, entry = [firstRaw, lastRaw] or null.
 * Same shape as WISC3LookupTableVisualizer (rows 1..19).
 */
export function lookupGrid(data: RefData, bandId: string): Record<string, ([number, number] | null)[]> {
  const out: Record<string, ([number, number] | null)[]> = {};
  for (const t of data.tests) {
    const row: ([number, number] | null)[] = Array.from({ length: 20 }, () => null);
    for (const [s, r] of Object.entries(data.subtests[bandId][t.id].scaled)) row[Number(s)] = [r[0], r[1]];
    out[t.id] = row;
  }
  return out;
}

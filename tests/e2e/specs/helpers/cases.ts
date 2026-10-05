import type { Age, CaseInput, RefData } from '../../../../web/src/engine/types';
import { birthFor, loadData } from '../../../../web/test/shared/load';

export const TEST_DATE = '2026-10-03';

let cached: RefData | null = null;
/** Reference data as the server bundles it (built from data/wisc3-pt). */
export function refData(): RefData {
  return (cached ??= loadData());
}

export interface FlowCase {
  name: string;
  age: Age;
  input: CaseInput;
}

/** raw = min + floor((max-min)*k/4) with k cycling 1..3 over the tests of the band */
function rawsFor(data: RefData, bandId: string, overrides: Record<string, number> = {}): Record<string, number> {
  const raw: Record<string, number> = {};
  data.tests.forEach((t, i) => {
    const table = data.subtests[bandId][t.id];
    const k = (i % 3) + 1;
    raw[t.id] = table.min + Math.floor(((table.max - table.min) * k) / 4);
  });
  return { ...raw, ...overrides };
}

export function caseFor(data: RefData, name: string, age: Age, bandId: string, overrides: Record<string, number> = {}): FlowCase {
  return {
    name,
    age,
    input: { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw: rawsFor(data, bandId, overrides) },
  };
}

/** Bands 06y00m, 09y06m, 12y00m, 14y06m, 16y06m at band start + 2 months, plus C1 (11y8m0d, ImageDisposition 38). */
export function flowCases(data: RefData): FlowCase[] {
  const out = ['06y00m', '09y06m', '12y00m', '14y06m', '16y06m'].map((id) => {
    const band = data.bands.find((b) => b.id === id)!;
    return caseFor(data, `band ${id}`, [band.from[0], band.from[1] + 2, 0], id);
  });
  out.push(caseFor(data, 'C1 manual correction 11y8m0d', [11, 8, 0], '11y06m', { ImageDisposition: 38 }));
  return out;
}

/** Band 10y00m, age 10y2m0d, the middle raw of each test. */
export function midCase(data: RefData, age: Age = [10, 2, 0], bandId = '10y00m'): FlowCase {
  const raw: Record<string, number> = {};
  for (const t of data.tests) {
    const table = data.subtests[bandId][t.id];
    raw[t.id] = Math.floor((table.min + table.max) / 2);
  }
  return { name: `mid ${bandId}`, age, input: { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw } };
}

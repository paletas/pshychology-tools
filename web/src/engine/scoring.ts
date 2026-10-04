import { dayCountAge } from './age';
import { scaledFor, selectBand } from './bands';
import { isSupported } from './gate';
import { INDEX_NAMES } from './types';
import type { Age, CaseInput, IndexName, IndexResult, IndexSnapshot, RefData, Scaled, Snapshot, Sums, TestSnapshot } from './types';

export function lookupIndex(data: RefData, name: IndexName, sum: number): IndexResult {
  const table = data.indices[name];
  const entry = table ? Object.prototype.hasOwnProperty.call(table, String(sum)) ? table[String(sum)] : undefined : undefined;
  return entry ?? 'unavailable';
}

const emptyScaled = (): Scaled => [null, null, null, null, null];

const emptyIndices = (): Record<IndexName, IndexSnapshot | null> => ({
  verbal: null,
  realization: null,
  completeScale: null,
  verbalComprehension: null,
  perceptiveOrganization: null,
  processingVelocity: null,
});

const zeroSums = (): Sums => ({ verbal: 0, realization: 0, verbalComprehension: 0, perceptiveOrganization: 0, processingVelocity: 0, complete: 0 });

/** Display for an age that is not supported (also used for a missing age). */
function blocked(data: RefData, age: Age | null): Snapshot {
  const tests: Record<string, TestSnapshot> = {};
  for (const t of data.tests) tests[t.id] = { min: null, max: null, scaled: emptyScaled(), outOfBounds: false, ok: false };
  return { age, supported: false, bandId: null, tests, sums: zeroSums(), indicesShown: false, indices: emptyIndices() };
}

export function scoreCase(data: RefData, input: CaseInput): Snapshot {
  const age = dayCountAge(input.testDate, input.birthDate);
  if (!age || !isSupported(age)) return blocked(data, age);
  const band = selectBand(data, age);
  if (!band) return blocked(data, age);

  const tests: Record<string, TestSnapshot> = {};
  const sums = zeroSums();
  let allMandatoryOk = true;
  for (const t of data.tests) {
    const table = data.subtests[band.id][t.id];
    const raw = input.raw[t.id] ?? null;
    const scaled = emptyScaled();
    let outOfBounds = false;
    let ok = false;
    if (raw !== null) {
      if (raw < table.min || raw > table.max) outOfBounds = true;
      else {
        ok = true;
        const s = scaledFor(data, band.id, t.id, raw);
        t.columns.forEach((c) => {
          scaled[['verbal', 'realization', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'].indexOf(c)] = s;
        });
      }
    }
    tests[t.id] = { min: table.min, max: table.max, scaled, outOfBounds, ok };
    if (t.mandatory && !ok) allMandatoryOk = false;
    if (t.mandatory) {
      sums.verbal += scaled[0] ?? 0;
      sums.realization += scaled[1] ?? 0;
    }
    sums.verbalComprehension += scaled[2] ?? 0;
    sums.perceptiveOrganization += scaled[3] ?? 0;
    sums.processingVelocity += scaled[4] ?? 0;
  }
  sums.complete = sums.verbal + sums.realization;

  const indices = emptyIndices();
  if (allMandatoryOk) {
    const sumOf: Record<IndexName, number> = {
      verbal: sums.verbal,
      realization: sums.realization,
      completeScale: sums.complete,
      verbalComprehension: sums.verbalComprehension,
      perceptiveOrganization: sums.perceptiveOrganization,
      processingVelocity: sums.processingVelocity,
    };
    for (const n of INDEX_NAMES) indices[n] = { sum: sumOf[n], entry: lookupIndex(data, n, sumOf[n]) };
  }
  return { age, supported: true, bandId: band.id, tests, sums, indicesShown: allMandatoryOk, indices };
}

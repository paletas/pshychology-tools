import { INDEX_NAMES } from '../engine/types';
import type { RefData } from '../engine/types';

export const SCHEMA_VERSION = 1;
export const BAND_COUNT = 22;
export const TEST_COUNT = 13;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses and validates a reference-data bundle; throws Error with a short reason when it is not usable. */
export function parseBundle(text: string): RefData {
  const data = JSON.parse(text) as unknown;
  if (!isObject(data)) throw new Error('bundle is not an object');
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error('unsupported schemaVersion');
  if (typeof data.dataVersion !== 'string' || data.dataVersion === '') throw new Error('missing dataVersion');
  const { bands, tests, subtests, indices } = data;
  if (!Array.isArray(bands) || bands.length !== BAND_COUNT) throw new Error(`expected ${BAND_COUNT} bands`);
  if (!Array.isArray(tests) || tests.length !== TEST_COUNT) throw new Error(`expected ${TEST_COUNT} tests`);
  if (!isObject(subtests) || !isObject(indices)) throw new Error('missing subtests or indices');
  for (const band of bands) {
    if (!isObject(band) || typeof band.id !== 'string') throw new Error('invalid band');
    const perBand = subtests[band.id];
    if (!isObject(perBand)) throw new Error(`no subtests for band ${band.id}`);
    for (const test of tests) {
      if (!isObject(test) || typeof test.id !== 'string') throw new Error('invalid test');
      if (!isObject(perBand[test.id])) throw new Error(`band ${band.id} lacks ${test.id}`);
    }
  }
  if (Object.keys(indices).length !== INDEX_NAMES.length) throw new Error(`expected ${INDEX_NAMES.length} indices`);
  for (const name of INDEX_NAMES) {
    if (!isObject(indices[name])) throw new Error(`missing index ${name}`);
  }
  return data as unknown as RefData;
}

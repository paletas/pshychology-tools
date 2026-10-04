import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error plain .mjs without types
import { buildBundle } from '../../scripts/canonical.mjs';
import { dayNumber, fromDayNumber } from '../../src/engine/age';
import type { Age, RefData } from '../../src/engine/types';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '../../..');
export const goldenDir = resolve(repoRoot, 'tools/Wisc3.Oracle/golden');
/** Frozen pre-fix golden of the old tables (REV-11): the original values the approved corrections were derived from. */
export const goldenOriginalDir = resolve(repoRoot, 'tools/Wisc3.Oracle/golden-original');
export const dataDir = resolve(repoRoot, 'data/wisc3-pt');

export function loadData(): RefData {
  return JSON.parse((buildBundle(dataDir) as Buffer).toString('utf8')) as RefData;
}

export function loadGolden<T = any>(name: string): T {
  return JSON.parse(readFileSync(resolve(goldenDir, name), 'utf8')) as T;
}

export function loadGoldenOriginal<T = any>(name: string): T {
  return JSON.parse(readFileSync(resolve(goldenOriginalDir, name), 'utf8')) as T;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** birth date such that the day-count age at testIso is exactly age (null if that age is not reachable). */
export function birthFor(testIso: string, age: Age): string {
  const [ty, tm, td] = testIso.split('-').map(Number);
  const n = dayNumber(1 + age[0], 1 + age[1], 1 + age[2]);
  const [y, m, d] = fromDayNumber(dayNumber(ty, tm, td) - n);
  return iso(y, m, d);
}

// Seeded case generator for the old-vs-new comparison. Output: tests/e2e/.tmp/cases.json (200 cases).
// Run from tests/e2e: npx tsx scripts/generate-cases.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dayNumber, fromDayNumber } from '../../../web/src/engine/age';
import { selectBand } from '../../../web/src/engine/bands';
import type { Age, RefData } from '../../../web/src/engine/types';
import { loadData } from '../../../web/test/shared/load';
import { e2eDir } from '../specs/helpers/paths';

const SEED = 20261003;

export interface CaseRecord {
  id: string;
  kind: string;
  testDate: string;
  birthDate: string;
  raw: Record<string, number | null>;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const isoToDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return dayNumber(y, m, d);
};
const dayToIso = (n: number) => iso(...fromDayNumber(n));

/** (1+y)-(1+m)-(1+d) must be a real calendar date, otherwise the day-count age y/m/d does not exist. */
function reachable(y: number, m: number, d: number): boolean {
  const [yy, mm, dd] = [1 + y, 1 + m, 1 + d];
  if (mm < 1 || mm > 12 || dd < 1) return false;
  const back = fromDayNumber(dayNumber(yy, mm, dd));
  return back[0] === yy && back[1] === mm && back[2] === dd;
}

/** birth = test - N days, N = days from 0001-01-01 to (1+y)-(m+1)-(d+1). */
function birthFor(testIso: string, age: Age): string {
  return dayToIso(isoToDay(testIso) - dayNumber(1 + age[0], 1 + age[1], 1 + age[2]));
}

const TEST_FROM = isoToDay('2019-01-01');
const TEST_TO = isoToDay('2026-09-30');
const randomTestDate = () => dayToIso(randInt(TEST_FROM, TEST_TO));

const data: RefData = loadData();
const mandatory = new Set(data.tests.filter((t) => t.mandatory).map((t) => t.id));
const optional = data.tests.filter((t) => !t.mandatory).map((t) => t.id);

type RawMode = 'uniform' | 'max' | 'min';
function rawsFor(bandId: string, mode: RawMode = 'uniform', omitOptionalP = 0): Record<string, number | null> {
  const raw: Record<string, number | null> = {};
  for (const t of data.tests) {
    const table = data.subtests[bandId][t.id];
    let v = mode === 'max' ? table.max : mode === 'min' ? table.min : randInt(table.min, table.max);
    raw[t.id] = !mandatory.has(t.id) && omitOptionalP > 0 && rand() < omitOptionalP ? null : v;
  }
  return raw;
}

const cases: CaseRecord[] = [];
const add = (id: string, kind: string, testDate: string, age: Age | null, raw: Record<string, number | null>, birthDate?: string) => {
  cases.push({ id, kind, testDate, birthDate: birthDate ?? birthFor(testDate, age!), raw });
};

// 176 stratified: 8 per band
for (const band of data.bands) {
  for (let i = 1; i <= 8; i++) {
    let age: Age;
    do {
      age = [band.from[0], randInt(band.from[1], band.to[1]), randInt(0, 30)];
    } while (!reachable(...age) || selectBand(data, age)?.id !== band.id);
    add(`strat-${band.id}-${i}`, 'stratified', randomTestDate(), age, rawsFor(band.id, 'uniform', 0.25));
  }
}

// 24 edge cases
const D0 = '2026-03-15';
const GATE_BAND = '06y06m';
const MID_BAND = '10y00m';
const MID_AGE: Age = [10, 2, 0];
add('edge-gate-low-5y10m0d', 'edge-gate-low', D0, [5, 10, 0], rawsFor(GATE_BAND));
add('edge-gate-low-5y11m30d', 'edge-gate-low', D0, [5, 11, 30], rawsFor(GATE_BAND));
add('edge-gate-high-throw-17y0m0d', 'edge-gate-high-throw', D0, [17, 0, 0], rawsFor(GATE_BAND));
add('edge-gate-high-throw-17y2m30d', 'edge-gate-high-throw', D0, [17, 2, 30], rawsFor(GATE_BAND));
add('edge-blocked-5y9m30d', 'edge-blocked', D0, [5, 9, 30], rawsFor(GATE_BAND));
add('edge-blocked-17y3m0d', 'edge-blocked', D0, [17, 3, 0], rawsFor(GATE_BAND));
for (const [y, m, d] of [[6, 0, 0], [16, 11, 30], [6, 5, 29], [6, 6, 0], [11, 5, 29], [11, 6, 0], [16, 5, 29], [16, 6, 0]] as Age[]) {
  const band = selectBand(data, [y, m, d])!;
  add(`edge-boundary-${y}y${m}m${d}d`, 'edge-boundary', D0, [y, m, d], rawsFor(band.id));
}
add('edge-all-max', 'edge-all-max', D0, MID_AGE, rawsFor(MID_BAND, 'max'));
add('edge-all-min', 'edge-all-min', D0, MID_AGE, rawsFor(MID_BAND, 'min'));
{
  const raw = rawsFor(MID_BAND);
  raw.Information = data.subtests[MID_BAND].Information.max + 1;
  add('edge-raw-max-plus-one', 'edge-raw-max-plus-one', D0, MID_AGE, raw);
}
add('edge-test-equals-birth', 'edge-test-equals-birth', '2024-05-05', null, rawsFor(MID_BAND), '2024-05-05');
add('edge-test-before-birth', 'edge-test-before-birth', '2024-05-01', null, rawsFor(MID_BAND), '2024-06-01');
add('edge-birth-leap-day', 'edge-birth-leap-day', '2023-02-28', null, rawsFor(MID_BAND), '2016-02-29');
{
  const raw = rawsFor(MID_BAND);
  for (const id of optional) raw[id] = null;
  add('edge-optionals-omitted', 'edge-optionals-omitted', D0, MID_AGE, raw);
}
{
  // Symbol Search omitted with Coding scaled >= 2 (Coding raw = band max, which is scaled >= 2)
  const raw = rawsFor(MID_BAND);
  raw.Code = data.subtests[MID_BAND].Code.max;
  raw.SymbolSearch = null;
  add('edge-symbolsearch-omitted', 'edge-symbolsearch-omitted', D0, MID_AGE, raw);
}
add('edge-manual-correction', 'edge-manual-correction', D0, [11, 8, 15], { ...rawsFor('11y06m'), ImageDisposition: 38 });
{
  // first band (in order) with a Coding raw whose scaled value is 1; Symbol Search omitted
  let found: { band: string; raw: number } | null = null;
  for (const band of data.bands) {
    const range = data.subtests[band.id].Code.scaled['1'];
    if (range) {
      found = { band: band.id, raw: range[0] };
      break;
    }
  }
  if (!found) {
    console.error('index-missing-key: no band has a Coding raw with scaled 1');
    process.exit(1);
  }
  const band = data.bands.find((b) => b.id === found!.band)!;
  const raw = rawsFor(band.id);
  raw.Code = found.raw;
  raw.SymbolSearch = null;
  add('edge-index-missing-key', 'edge-index-missing-key', D0, [band.from[0], band.from[1] + 1, 0], raw);
}

const stratified = cases.filter((c) => c.kind === 'stratified').length;
const edge = cases.length - stratified;
if (new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error('duplicate case ids');

const out = join(e2eDir, '.tmp/cases.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(cases, null, 1) + '\n');
console.log(`cases=${cases.length} stratified=${stratified} edge=${edge}`);

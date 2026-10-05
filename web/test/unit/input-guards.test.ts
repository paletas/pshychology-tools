import { describe, expect, it } from 'vitest';
import { dayCountAge } from '../../src/engine/age';
import { isSupported } from '../../src/engine/gate';
import type { Snapshot } from '../../src/engine/types';
import { dateGuard, guardText, parseRaw, resultsReason } from '../../src/ui/guards/inputGuards';

const today = '2026-10-03';
const g = (birth: string, test: string, extra: { birthBad?: boolean; testBad?: boolean } = {}) => dateGuard({ birth, test, today, ...extra });
/** The first test date whose engine day-count age from `birth` is exactly `age` (the engine's age is not calendar age). */
function testAt(birth: string, age: [number, number, number]): string {
  const [by, bm, bd] = birth.split('-').map(Number);
  for (let i = 1; i < 9000; i++) {
    const t = new Date(Date.UTC(by + age[0], bm - 1 + age[1], bd - 3 + i));
    const iso = t.toISOString().slice(0, 10);
    const a = dayCountAge(iso, birth);
    if (a && a[0] === age[0] && a[1] === age[1] && a[2] === age[2]) return iso;
  }
  throw new Error('no date for age');
}
const keys = (r: ReturnType<typeof dateGuard>) => r.messages.map((m) => m.key);

describe('dateGuard (rows 1-13)', () => {
  it('1 both empty', () => {
    const r = g('', '');
    expect(r.state).toBe('dates-missing');
    expect(keys(r)).toEqual(['date.missing.both']);
  });
  it('2 birth only', () => {
    const r = g('2015-01-01', '');
    expect(r.state).toBe('dates-missing');
    expect(r.messages[0]).toMatchObject({ key: 'date.missing.test', field: 'test' });
  });
  it('3 test only', () => {
    const r = g('', '2026-01-01');
    expect(r.messages[0]).toMatchObject({ key: 'date.missing.birth', field: 'birth' });
  });
  it('4 birthBad', () => {
    const r = g('', '2026-01-01', { birthBad: true });
    expect(r.state).toBe('dates-invalid');
    expect(r.messages[0]).toMatchObject({ key: 'date.invalid.birth', field: 'birth', level: 'error' });
  });
  it('5 testBad', () => {
    const r = g('2015-01-01', '', { testBad: true });
    expect(r.state).toBe('dates-invalid');
    expect(r.messages[0]).toMatchObject({ key: 'date.invalid.test', field: 'test' });
  });
  it('6 test == birth', () => {
    const r = g('2020-05-05', '2020-05-05');
    expect(r.state).toBe('dates-invalid');
    expect(keys(r)).toEqual(['date.same']);
  });
  it('7 test < birth', () => {
    const r = g('2020-05-05', '2020-05-04');
    expect(r.state).toBe('dates-invalid');
    expect(keys(r)).toEqual(['date.before']);
  });
  it('8 age 5y11m30d', () => {
    const r = g('2020-10-01', testAt('2020-10-01', [5, 11, 30]));
    expect(r.age).toEqual([5, 11, 30]);
    expect(r.state).toBe('age-out');
    expect(r.messages[0].key).toBe('age.tooYoung');
    expect(guardText(r.messages[0].key, r.messages[0].params)).toContain('5 anos, 11 meses e 30 dias');
  });
  it('9 age 6y0m0d', () => {
    const r = g('2010-10-03', testAt('2010-10-03', [6, 0, 0]));
    expect(r.age).toEqual([6, 0, 0]);
    expect(r.state).toBe('ok');
    expect(r.messages).toEqual([]);
  });
  it('10 age 16y11m30d', () => {
    const r = g('2010-01-01', testAt('2010-01-01', [16, 11, 30]));
    expect(r.age).toEqual([16, 11, 30]);
    expect(r.state).toBe('ok');
  });
  it('11 age 17y0m0d', () => {
    const r = g('2009-10-03', testAt('2009-10-03', [17, 0, 0]));
    expect(r.age).toEqual([17, 0, 0]);
    expect(r.state).toBe('age-out');
    expect(keys(r)).toEqual(['age.tooOld']);
  });
  it('12 birth 1890-01-01', () => {
    const r = g('1890-01-01', '2026-10-03');
    expect(r.state).toBe('age-out');
    expect(keys(r)).toEqual(['age.implausible']);
  });
  it('13 future test date with a supported age', () => {
    const r = g('2015-01-01', '2027-01-10');
    expect(r.state).toBe('ok');
    expect(r.messages).toMatchObject([{ key: 'date.future', level: 'warn', field: 'test' }]);
  });
});

describe('parseRaw (rows 14-21)', () => {
  it.each([
    [14, '', { value: null, error: null }],
    [15, '12', { value: 12, error: null }],
    [16, '12.5', { value: null, error: 'raw.invalid' }],
    [17, '-3', { value: null, error: 'raw.invalid' }],
    [18, '1e2', { value: null, error: 'raw.invalid' }],
    [19, ' 7 ', { value: 7, error: null }],
    [20, 'abc', { value: null, error: 'raw.invalid' }],
  ])('%i %j', (_n, text, expected) => {
    expect(parseRaw(text as string)).toEqual(expected);
  });
  it('21 badInput', () => {
    expect(parseRaw('', true)).toEqual({ value: null, error: 'raw.invalid' });
  });
});

describe('resultsReason (rows 22-26)', () => {
  const tests = [
    { id: 'A', name: 'Alfa', mandatory: true },
    { id: 'B', name: 'Beta', mandatory: true },
    { id: 'C', name: 'Gama', mandatory: true },
    { id: 'D', name: 'Delta', mandatory: false },
  ];
  const snap = (ok: Record<string, boolean>, oob: Record<string, boolean> = {}) =>
    ({ tests: Object.fromEntries(tests.map((t) => [t.id, { ok: !!ok[t.id], outOfBounds: !!oob[t.id] }])) }) as unknown as Snapshot;
  const all = { A: true, B: true, C: true };
  it('22 dates invalid', () => {
    expect(resultsReason('dates-invalid', snap(all), {}, tests)?.key).toBe('results.empty.dates');
    expect(resultsReason('dates-missing', snap(all), {}, tests)?.key).toBe('results.empty.dates');
  });
  it('23 age out of range', () => {
    expect(resultsReason('age-out', snap(all), {}, tests)?.key).toBe('results.empty.age');
  });
  it('24 one mandatory raw invalid', () => {
    const r = resultsReason('ok', snap({ B: true, C: true }), { A: 'raw.invalid' }, tests);
    expect(r?.key).toBe('results.empty.invalidRaw');
    expect(r?.params.names).toBe('Alfa');
    expect(resultsReason('ok', snap(all, { B: true }), {}, tests)?.params.names).toBe('Beta');
  });
  it('25 three mandatory raws missing', () => {
    const r = resultsReason('ok', snap({}), {}, tests);
    expect(r?.key).toBe('results.empty.mandatory');
    expect(r?.params.n).toBe('3');
    expect(r?.params.names).toBe('Alfa, Beta, Gama');
  });
  it('26 valid case', () => {
    expect(resultsReason('ok', snap(all), {}, tests)).toBeNull();
  });
});

describe('grid agreement with the engine age gate', () => {
  it('dateGuard verdict equals isSupported for every age 0..24y 0..11m 0..30d', () => {
    const birth = '2000-01-01';
    let checked = 0;
    for (let y = 0; y <= 24; y++)
      for (let m = 0; m <= 11; m++)
        for (let d = 0; d <= 30; d++) {
          // a test date near birth + y/m/d; the engine's own day-count age is the reference
          const dt = new Date(Date.UTC(2000 + y, m, 1 + d));
          const test = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
          const age = dayCountAge(test, birth);
          if (!age) continue;
          expect(g(birth, test).state === 'ok', `${test} ${age}`).toBe(isSupported(age));
          checked++;
        }
    expect(checked).toBeGreaterThan(1000);
  });
});

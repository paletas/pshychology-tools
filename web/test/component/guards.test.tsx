import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { installDebug } from '../../src/debug';
import { dayCountAge } from '../../src/engine/age';
import { scoreCase } from '../../src/engine/scoring';
import type { RefData } from '../../src/engine/types';
import { parseBundle } from '../../src/refdata/schema';

vi.mock('../../src/refdata/client', () => ({
  initReferenceData: async () => ({
    current: { data: parseBundle(readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8')), sha: 'test-sha' },
    onPending: () => {},
    updated: Promise.resolve(),
  }),
  takePending: () => null,
}));

const data: RefData = parseBundle(readFileSync(resolve(__dirname, '../../public/reference/baseline.json'), 'utf8'));
const NOW = new Date('2026-10-03T10:00:00');
const TODAY = '2026-10-03';

/** A birth date for which the engine's day-count age at `test` is exactly `age`. */
function birthFor(test: string, age: [number, number, number]): string {
  const [ty, tm, td] = test.split('-').map(Number);
  for (let i = 0; i < 9000; i++) {
    const d = new Date(Date.UTC(ty - age[0] - 1, tm - 1 - age[1], td - 40 + i));
    const iso = d.toISOString().slice(0, 10);
    const a = dayCountAge(test, iso);
    if (a && a[0] === age[0] && a[1] === age[1] && a[2] === age[2]) return iso;
  }
  throw new Error('no birth date');
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  installDebug();
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  errorSpy = vi.spyOn(console, 'error');
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderApp() {
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-ready')).toBe('true'));
}
const birthEl = () => document.getElementById('subjectBirthday') as HTMLInputElement;
const testEl = () => document.getElementById('testDate') as HTMLInputElement;
const setBirth = (v: string) => fireEvent.change(birthEl(), { target: { value: v } });
const setTest = (v: string) => fireEvent.change(testEl(), { target: { value: v } });
const setRaw = (id: string, v: string) => fireEvent.change(screen.getByTestId(`raw-${id}`), { target: { value: v } });
const msg = (field: string) => screen.getByTestId(`date-msg-${field}`);
const count = (selector: string) => document.querySelectorAll(selector).length;

function midRaws(birth: string, test: string): Record<string, number> {
  const snap = scoreCase(data, { testDate: test, birthDate: birth, raw: {} });
  const out: Record<string, number> = {};
  for (const t of data.tests) {
    const s = snap.tests[t.id];
    if (s.min !== null && s.max !== null) out[t.id] = Math.floor((s.min + s.max) / 2);
  }
  return out;
}

const expectEmpty = (reason: string) => {
  expect(screen.getByTestId('results-empty').getAttribute('data-reason')).toBe(reason);
  expect(count('[data-testid^="index-row-"]')).toBe(0);
  expect(count('[data-testid^="chart-empty-"]')).toBe(3);
  for (const el of document.querySelectorAll('[data-testid^="chart-empty-"]')) expect(el.getAttribute('data-marks')).toBe('0');
  expect(document.getElementById('glance')!.textContent!.match(/—/g)).toHaveLength(3);
};

describe('date guards (cases 1-13)', () => {
  it('1 both empty', async () => {
    await renderApp();
    expect(msg('both').getAttribute('data-key')).toBe('date.missing.both');
    expect(msg('both').getAttribute('role')).toBe('status');
    expectEmpty('results.empty.dates');
  });
  it('2 birth only, 3 test only', async () => {
    await renderApp();
    setBirth('2015-01-01');
    expect(msg('test').getAttribute('data-key')).toBe('date.missing.test');
    setBirth('');
    setTest('2026-01-01');
    expect(msg('birth').getAttribute('data-key')).toBe('date.missing.birth');
    expectEmpty('results.empty.dates');
  });
  it('4, 5 a partial date (badInput) is invalid, with an alert', async () => {
    await renderApp();
    Object.defineProperty(birthEl(), 'validity', { value: { badInput: true }, configurable: true });
    fireEvent.input(birthEl(), { target: { value: '' } });
    expect(msg('birth').getAttribute('data-key')).toBe('date.invalid.birth');
    expect(msg('birth').getAttribute('role')).toBe('alert');
    expect(birthEl().getAttribute('aria-invalid')).toBe('true');
    expect(birthEl().getAttribute('aria-describedby')).toBe('date-msg-birth');
    Object.defineProperty(testEl(), 'validity', { value: { badInput: true }, configurable: true });
    fireEvent.blur(testEl());
    expect(msg('test').getAttribute('data-key')).toBe('date.invalid.test');
    expectEmpty('results.empty.dates');
  });
  it('6 test == birth, 7 test < birth', async () => {
    await renderApp();
    setBirth('2020-05-05');
    setTest('2020-05-05');
    expect(msg('test').getAttribute('data-key')).toBe('date.same');
    expect(msg('test').getAttribute('role')).toBe('alert');
    setTest('2020-05-04');
    expect(msg('test').getAttribute('data-key')).toBe('date.before');
    expectEmpty('results.empty.dates');
  });
  it('8 age 5y11m30d shows the age sentence and no norm band', async () => {
    await renderApp();
    setTest(TODAY);
    setBirth(birthFor(TODAY, [5, 11, 30]));
    expect(msg('birth').getAttribute('data-key')).toBe('age.tooYoung');
    expect(msg('birth').textContent).toContain('5 anos, 11 meses e 30 dias');
    expect(screen.getByTestId('age').textContent).toContain('5 anos, 11 meses e 30 dias');
    expect(screen.queryByTestId('norm-band')).toBeNull();
    expectEmpty('results.empty.age');
  });
  it('9 6y0m0d and 10 16y11m30d are ok with no message', async () => {
    await renderApp();
    setTest(TODAY);
    for (const age of [[6, 0, 0], [16, 11, 30]] as [number, number, number][]) {
      setBirth(birthFor(TODAY, age));
      expect(count('[data-testid^="date-msg-"]')).toBe(0);
      expect(screen.getByTestId('norm-band')).toBeTruthy();
    }
  });
  it('11 17y0m0d too old, 12 birth 1890 implausible', async () => {
    await renderApp();
    setTest(TODAY);
    setBirth(birthFor(TODAY, [17, 0, 0]));
    expect(msg('birth').getAttribute('data-key')).toBe('age.tooOld');
    setBirth('1890-01-01');
    expect(msg('birth').getAttribute('data-key')).toBe('age.implausible');
    expectEmpty('results.empty.age');
  });
  it('13 a future test date warns and still scores', async () => {
    await renderApp();
    const test = '2027-01-10';
    const birth = birthFor(test, [9, 3, 12]);
    setTest(test);
    setBirth(birth);
    expect(msg('test').getAttribute('data-key')).toBe('date.future');
    expect(msg('test').getAttribute('data-level')).toBe('warn');
    expect(msg('test').getAttribute('role')).toBe('status');
    for (const [id, v] of Object.entries(midRaws(birth, test))) setRaw(id, String(v));
    expect(count('[data-testid^="index-row-"]')).toBe(6);
  });
});

describe('raw score guards', () => {
  const birth = birthFor(TODAY, [9, 3, 12]);

  it('typing 12.5 shows raw-msg and leaves the scaled value empty', async () => {
    await renderApp();
    setTest(TODAY);
    setBirth(birth);
    setRaw('Information', '12.5');
    expect(screen.getByTestId('raw-msg-Information').getAttribute('data-key')).toBe('raw.invalid');
    expect(screen.getByTestId('raw-Information').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('scaled-Information').textContent).toBe('');
    setRaw('Information', '12');
    expect(screen.queryByTestId('raw-msg-Information')).toBeNull();
  });

  it('one mandatory raw invalid in a valid case empties results, glance and charts', async () => {
    await renderApp();
    setTest(TODAY);
    setBirth(birth);
    for (const [id, v] of Object.entries(midRaws(birth, TODAY))) setRaw(id, String(v));
    expect(count('[data-testid^="index-row-"]')).toBe(6);
    setRaw('Information', 'abc');
    expectEmpty('results.empty.invalidRaw');
  });

  it('a full valid case shows the engine values', async () => {
    await renderApp();
    setTest(TODAY);
    setBirth(birth);
    const raws = midRaws(birth, TODAY);
    for (const [id, v] of Object.entries(raws)) setRaw(id, String(v));
    const snap = scoreCase(data, { testDate: TODAY, birthDate: birth, raw: raws });
    for (const name of ['verbal', 'realization', 'completeScale'] as const) {
      const e = snap.indices[name]!.entry;
      expect(screen.getByTestId(`index-iq-${name}`).textContent).toBe(e === 'unavailable' ? '—' : String(e!.iq));
    }
    expect(count('[data-testid^="chart-empty-"]')).toBe(0);
  });

  it('the key filter blocks minus, plus and exponent keys', async () => {
    await renderApp();
    const el = screen.getByTestId('raw-Information');
    for (const key of ['-', 'e', 'E', '+']) expect(fireEvent.keyDown(el, { key })).toBe(false);
    expect(fireEvent.keyDown(el, { key: '3' })).toBe(true);
    expect(fireEvent.keyDown(el, { key: '.' })).toBe(true);
  });
});

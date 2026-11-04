import { describe, expect, it } from 'vitest';
import {
  EVENT_BUILDERS,
  buildCalcStarted,
  buildCiChanged,
  buildClientError,
  buildLegacyClicked,
  buildLookupOpened,
  buildOfflineSession,
  buildAppInstalled,
  buildPrint,
  buildRefdataFailed,
  buildResultsShown,
  buildSheetLeft,
  buildSheetReset,
  buildUpdate,
} from '../../src/analytics/events';
import type { BuiltEvent } from '../../src/analytics/events';

// Recognisable sheet values that must never reach an event.
const sheet = {
  dates: ['2014-03-07', '2024-11-19'],
  age: [10, 8, 12],
  raw: ['23', '17', '31'],
  scaled: [7, 9, 11],
  iq: 104,
  error: 'secret failure 12345',
};

// Declared enum sets per data key.
const ENUMS: Record<string, string[]> = {
  duration_bucket: ['<1m', '1-3m', '3-10m', '10-30m', '>30m'],
  outcome: ['results', 'blocked', 'partial'],
  blocked_by: ['none', 'dates', 'age', 'invalid_raw', 'mandatory', 'other'],
  via: ['button', 'beforeprint'],
  level: ['90', '95', '99', 'other'],
  kind: ['error', 'unhandledrejection', 'react'],
  name: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'DOMException', 'AggregateError', 'other'],
};
const OPTIONAL_OK = new Set(['SymbolSearch', 'DigitMemory', 'Labyrinth', 'other']);
const WHERE_OK = /^([A-Za-z0-9._-]+:\d+|external)$/;

const hostile: unknown[] = [...sheet.dates, ...sheet.age, ...sheet.raw, ...sheet.scaled, sheet.iq, sheet.error, 104, 23, null, undefined, {}, [], new Error(sheet.error)];

// Representative and hostile outputs for every builder.
function samples(): Record<string, BuiltEvent[]> {
  const out: Record<string, BuiltEvent[]> = {};
  const h = hostile;
  out.buildCalcStarted = [buildCalcStarted()];
  out.buildResultsShown = [
    buildResultsShown(30_000, []),
    buildResultsShown(120_000, ['DigitMemory', 'Labyrinth', 'DigitMemory']),
    buildResultsShown(sheet.iq * 1000, h),
    buildResultsShown(Number.NaN, h as unknown[]),
    buildResultsShown(40 * 60_000, ['SymbolSearch']),
  ];
  out.buildSheetLeft = [
    buildSheetLeft('results'),
    buildSheetLeft('partial', 'results.empty.dates'),
    buildSheetLeft('blocked', 'results.empty.invalidRaw'),
    ...h.map((x) => buildSheetLeft('blocked', x)),
    ...h.map((x) => buildSheetLeft(x as never, x)),
  ];
  out.buildPrint = [buildPrint('button', true), buildPrint('beforeprint', false), buildPrint(sheet.error as never, sheet.iq as never)];
  out.buildLookupOpened = [buildLookupOpened()];
  out.buildCiChanged = [buildCiChanged(90), buildCiChanged('95'), buildCiChanged(99), ...h.map(buildCiChanged), buildCiChanged(97.5)];
  out.buildLegacyClicked = [buildLegacyClicked()];
  out.buildSheetReset = [buildSheetReset()];
  out.buildAppInstalled = [buildAppInstalled()];
  out.buildOfflineSession = [buildOfflineSession()];
  out.buildRefdataFailed = [buildRefdataFailed()];
  out.buildUpdate = [buildUpdate('available'), buildUpdate('applied')];
  out.buildClientError = [
    buildClientError('error', new TypeError(sheet.error), 'app.js:12'),
    buildClientError('react', 'RangeError', 'chunk-abc.js:9'),
    buildClientError('unhandledrejection', sheet.error, 'https://evil.example/x.js:1'),
    ...h.map((x) => buildClientError(x as never, x, String(x))),
  ];
  return out;
}

function assertEnumOnly(e: BuiltEvent) {
  const json = JSON.stringify(e);
  for (const bad of [...sheet.dates, '104', '23', '17', '31', 'secret failure', '12345']) {
    expect(json, `leaked ${bad}`).not.toContain(bad);
  }
  for (const [k, v] of Object.entries(e.data)) {
    if (typeof v === 'boolean') continue;
    expect(typeof v).toBe('string');
    if (k === 'optional') {
      expect(v === 'none' || v.split(',').every((id) => OPTIONAL_OK.has(id))).toBe(true);
    } else if (k === 'where') {
      expect(v).toMatch(WHERE_OK);
    } else {
      expect(ENUMS[k], `unexpected key ${k}`).toBeDefined();
      expect(ENUMS[k]).toContain(v);
    }
  }
}

const all = samples();

describe('analytics privacy', () => {
  it('has a builder entry per builder under test', () => {
    expect(Object.keys(EVENT_BUILDERS).sort()).toEqual(Object.keys(all).sort());
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(13);
  });

  const cases: [string, string][] = [
    ['calc_started', 'buildCalcStarted'],
    ['results_shown', 'buildResultsShown'],
    ['sheet_left', 'buildSheetLeft'],
    ['print', 'buildPrint'],
    ['lookup_opened', 'buildLookupOpened'],
    ['ci_changed', 'buildCiChanged'],
    ['legacy_clicked', 'buildLegacyClicked'],
    ['sheet_reset', 'buildSheetReset'],
    ['app_installed', 'buildAppInstalled'],
    ['offline_session', 'buildOfflineSession'],
    ['refdata_failed', 'buildRefdataFailed'],
    ['update (available/applied)', 'buildUpdate'],
    ['client_error', 'buildClientError'],
  ];
  for (const [label, fn] of cases) {
    it(`${label} builder is enum-only`, () => {
      expect(all[fn].length).toBeGreaterThan(0);
      for (const e of all[fn]) assertEnumOnly(e);
    });
  }

  it('hostile values collapse to other / none / external', () => {
    expect(buildCiChanged(97.5).data).toEqual({ level: 'other' });
    expect(buildSheetLeft('blocked', 'results.empty.dates').data).toEqual({ outcome: 'blocked', blocked_by: 'dates' });
    expect(buildSheetLeft('results', 'results.empty.dates').data.blocked_by).toBe('none');
    expect(buildSheetLeft('blocked', sheet.error).data.blocked_by).toBe('other');
    expect(buildResultsShown(1000, ['2014-03-07', 104]).data.optional).toBe('other');
    expect(buildResultsShown(1000, ['Labyrinth', 'DigitMemory', 'Labyrinth']).data.optional).toBe('DigitMemory,Labyrinth');
    expect(buildResultsShown(1000, []).data.optional).toBe('none');
  });

  it('client_error keeps only allow-listed names and safe locations', () => {
    const ok = buildClientError('error', new Error('secret failure'), 'app.js:12');
    expect(ok.data.name).toBe('Error');
    expect(ok.data.where).toBe('app.js:12');
    expect(JSON.stringify(ok)).not.toContain('secret');
    const ext = buildClientError('error', new Error('x'), 'https://evil.example/x.js:1');
    expect(ext.data.where).toBe('external');
    expect(buildClientError('error', 'MyCustomError', 'a.js:1').data.name).toBe('other');
  });
});

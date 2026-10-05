import { describe, expect, it } from 'vitest';
import { dayCountAge } from '../../src/engine/age';
import { selectBand, scaledFor } from '../../src/engine/bands';
import { comparisonBand, formatCi, formatPercentile } from '../../src/engine/format';
import { isSupported } from '../../src/engine/gate';
import { lookupIndex, scoreCase } from '../../src/engine/scoring';
import type { CaseInput } from '../../src/engine/types';
import { birthFor, loadData } from '../shared/load';

const data = loadData();
const TEST_DATE = '2024-06-15';

function rawsMid(bandId: string, omit: string[] = []): Record<string, number | null> {
  const raw: Record<string, number | null> = {};
  for (const t of data.tests) {
    const e = data.subtests[bandId][t.id];
    raw[t.id] = omit.includes(t.id) ? null : Math.floor((e.min + e.max) / 2);
  }
  return raw;
}

function caseAt(age: [number, number, number], raw: Record<string, number | null>): CaseInput {
  return { testDate: TEST_DATE, birthDate: birthFor(TEST_DATE, age), raw };
}

describe('gate', () => {
  it('strict edges', () => {
    expect(isSupported([5, 11, 30])).toBe(false);
    expect(isSupported([6, 0, 0])).toBe(true);
    expect(isSupported([16, 11, 30])).toBe(true);
    expect(isSupported([17, 0, 0])).toBe(false);
  });
});

describe('bands', () => {
  it('band edges', () => {
    expect(selectBand(data, [6, 5, 29])?.id).toBe('06y00m');
    expect(selectBand(data, [6, 6, 0])?.id).toBe('06y06m');
  });
  it('band 11y06m ImageDisposition raw 38 -> scaled 13 (C1)', () => {
    expect(scaledFor(data, '11y06m', 'ImageDisposition', 38)).toBe(13);
  });
  it('out of range raw -> null', () => {
    const e = data.subtests['10y00m'].Information;
    expect(scaledFor(data, '10y00m', 'Information', e.min - 1)).toBeNull();
    expect(scaledFor(data, '10y00m', 'Information', e.max + 1)).toBeNull();
  });
});

describe('age', () => {
  it('test date <= birth date -> null', () => {
    expect(dayCountAge('2020-01-01', '2020-01-01')).toBeNull();
    expect(dayCountAge('2019-12-31', '2020-01-01')).toBeNull();
  });
  it('round trips through birthFor', () => {
    expect(dayCountAge(TEST_DATE, birthFor(TEST_DATE, [10, 3, 7]))).toEqual([10, 3, 7]);
  });
});

describe('index lookup', () => {
  it('missing key -> unavailable', () => {
    expect(lookupIndex(data, 'verbal', 0)).toBe('unavailable');
    expect(lookupIndex(data, 'verbal', 65)).not.toBe('unavailable');
  });
});

describe('scoreCase', () => {
  it('V/R sums use mandatory tests only', () => {
    const base = scoreCase(data, caseAt([10, 2, 0], rawsMid('10y00m', ['DigitMemory'])));
    const withDm = scoreCase(data, caseAt([10, 2, 0], rawsMid('10y00m')));
    expect(withDm.tests.DigitMemory.scaled[0]).not.toBeNull();
    expect(withDm.sums.verbal).toBe(base.sums.verbal);
    expect(withDm.sums.complete).toBe(base.sums.complete);
  });

  it('PV is computed from Coding alone when Symbol Search is omitted', () => {
    const s = scoreCase(data, caseAt([10, 2, 0], rawsMid('10y00m', ['SymbolSearch'])));
    expect(s.indicesShown).toBe(true);
    expect(s.sums.processingVelocity).toBe(s.tests.Code.scaled[4]);
    expect(s.indices.processingVelocity?.sum).toBe(s.sums.processingVelocity);
  });

  it('an out-of-bounds raw gives no indices', () => {
    const raw = rawsMid('10y00m');
    raw.Information = data.subtests['10y00m'].Information.max + 1;
    const s = scoreCase(data, caseAt([10, 2, 0], raw));
    expect(s.tests.Information.outOfBounds).toBe(true);
    expect(s.indicesShown).toBe(false);
    expect(Object.values(s.indices).every((v) => v === null)).toBe(true);
  });

  it('blocked age keeps the age and shows nothing', () => {
    const s = scoreCase(data, caseAt([5, 10, 0], rawsMid('06y00m')));
    expect(s.age).toEqual([5, 10, 0]);
    expect(s.supported).toBe(false);
    expect(s.bandId).toBeNull();
    expect(s.sums).toEqual({ verbal: 0, realization: 0, verbalComprehension: 0, perceptiveOrganization: 0, processingVelocity: 0, complete: 0 });
    expect(s.indicesShown).toBe(false);
    expect(Object.values(s.tests).every((t) => t.min === null && t.scaled.every((v) => v === null))).toBe(true);
  });

  it('age 17y0m0d is blocked, 16y11m30d is scored', () => {
    expect(scoreCase(data, caseAt([17, 0, 0], rawsMid('16y06m'))).supported).toBe(false);
    expect(scoreCase(data, caseAt([16, 11, 30], rawsMid('16y06m'))).supported).toBe(true);
  });

  it('test date <= birth date -> age null, blocked', () => {
    const s = scoreCase(data, { testDate: '2020-01-01', birthDate: '2020-01-01', raw: rawsMid('10y00m') });
    expect(s.age).toBeNull();
    expect(s.supported).toBe(false);
  });

  it('11y06m ImageDisposition raw 38 -> scaled 13 in both columns (C1)', () => {
    const raw = rawsMid('11y06m');
    raw.ImageDisposition = 38;
    const s = scoreCase(data, caseAt([11, 8, 0], raw));
    expect(s.bandId).toBe('11y06m');
    expect(s.tests.ImageDisposition.scaled).toEqual([null, 13, null, 13, null]);
    expect(s.indicesShown).toBe(true);
  });
});

describe('format', () => {
  it('percentile and ci', () => {
    expect(formatPercentile(0.1, 'pt-PT')).toBe('0,1');
    expect(formatPercentile(88, 'en-US')).toBe('88');
    expect(formatCi([98, 111])).toBe('98 - 111');
    expect(formatCi(null)).toBe(' - ');
  });
  it('classification bands', () => {
    expect([69, 70, 89, 90, 109, 110, 129, 130, 999].map(comparisonBand)).toEqual([
      'ExtremelyBelow', 'FarBelow', 'Below', 'OnAverage', 'OnAverage', 'Above', 'FarAbove', 'ExtremelyAbove', 'ExtremelyAbove',
    ]);
  });
});

import type { Age } from './types';

const DAYS_TO_MONTH_365 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const DAYS_TO_MONTH_366 = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);

/** Day number of a proleptic Gregorian date: 0 = 0001-01-01. Mirrors .NET DateTime ticks / day. */
export function dayNumber(y: number, m: number, d: number): number {
  const t = isLeap(y) ? DAYS_TO_MONTH_366 : DAYS_TO_MONTH_365;
  const py = y - 1;
  return py * 365 + Math.floor(py / 4) - Math.floor(py / 100) + Math.floor(py / 400) + t[m - 1] + d - 1;
}

/** Inverse of dayNumber (same algorithm as .NET DateTime.GetDatePart). */
export function fromDayNumber(days: number): [number, number, number] {
  let n = days;
  const y400 = Math.floor(n / 146097);
  n -= y400 * 146097;
  let y100 = Math.floor(n / 36524);
  if (y100 === 4) y100 = 3;
  n -= y100 * 36524;
  const y4 = Math.floor(n / 1461);
  n -= y4 * 1461;
  let y1 = Math.floor(n / 365);
  if (y1 === 4) y1 = 3;
  n -= y1 * 365;
  const year = y400 * 400 + y100 * 100 + y4 * 4 + y1 + 1;
  const t = y1 === 3 && (y4 !== 24 || y100 === 3) ? DAYS_TO_MONTH_366 : DAYS_TO_MONTH_365;
  let m = (n >> 5) + 1;
  while (n >= t[m]) m++;
  return [year, m, n - t[m - 1] + 1];
}

function parseIso(iso: string): [number, number, number] | null {
  const m = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Port of DetermineAgeFrom (WISC3.razor.cs:131-143): the day span added to 0001-01-01. */
export function dayCountAge(testIso: string, birthIso: string): Age | null {
  const t = parseIso(testIso);
  const b = parseIso(birthIso);
  if (!t || !b) return null;
  const td = dayNumber(t[0], t[1], t[2]);
  const bd = dayNumber(b[0], b[1], b[2]);
  if (td <= bd) return null;
  const [y, m, d] = fromDayNumber(td - bd);
  return [y - 1, m - 1, d - 1];
}

import type { Age } from './types';

/** lexicographic compare on y,m,d of the day-count age */
export function compareAge(a: Age, b: Age): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/** Strict gate: [6,0,0] <= age < [17,0,0] */
export function isSupported(age: Age | null): boolean {
  if (!age) return false;
  return compareAge(age, [6, 0, 0]) >= 0 && compareAge(age, [17, 0, 0]) < 0;
}

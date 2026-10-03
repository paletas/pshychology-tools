import { describe, expect, it } from 'vitest';
import { dayCountAge } from '../../src/engine/age';
import { loadGolden } from '../shared/load';

describe('day-count age vs golden', () => {
  it('all pairs equal', () => {
    const pairs = loadGolden<{ test: string; birth: string; age: number[] | null }[]>('day-count-age.json');
    let bad = 0;
    for (const p of pairs) {
      const got = dayCountAge(p.test, p.birth);
      if (JSON.stringify(got) !== JSON.stringify(p.age)) {
        bad++;
        if (bad < 5) console.log('age mismatch', p, got);
      }
    }
    console.log(`age.golden pairs=${pairs.length} mismatches=${bad}`);
    expect(pairs.length).toBeGreaterThanOrEqual(3000);
    expect(bad).toBe(0);
  });
});

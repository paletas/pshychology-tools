import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import { canonical } from '../../scripts/canonical.mjs';

describe('canonical', () => {
  it('sorts keys by UTF-16 code units, arrays keep order', () => {
    expect(canonical({ '5': 1, '10': 2, b: [1, { a: 0.1 }] })).toBe('{"10":2,"5":1,"b":[1,{"a":0.1}]}');
  });
});

import { describe, expect, it } from 'vitest';
import { pt } from '../../src/i18n/pt';
import { ptNew } from '../../src/i18n/pt-new';

describe('ptNew (REV-9/10 strings, pending approval)', () => {
  it('has the required shell and lookup keys', () => {
    for (const k of ['theme', 'theme.aria', 'legacy', 'legacy.offline']) expect(ptNew[k], k).toBeTruthy();
    expect(Object.keys(ptNew).filter((k) => k.startsWith('lookup.')).length).toBeGreaterThan(0);
  });

  it('never redefines an existing pt key', () => {
    for (const k of Object.keys(ptNew)) expect(pt[k], k).toBeUndefined();
  });

  it('no value is empty', () => {
    for (const [k, v] of Object.entries(ptNew)) expect(v.trim(), k).not.toBe('');
  });
});

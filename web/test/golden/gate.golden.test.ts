import { describe, expect, it } from 'vitest';
import { selectBand } from '../../src/engine/bands';
import { isSupported } from '../../src/engine/gate';
import { loadData, loadGolden } from '../shared/load';

const data = loadData();

describe('age gate vs golden grid', () => {
  it('strict gate, band index equality, 62 low + 93 high', () => {
    const grid = loadGolden<{ age: [number, number, number]; oldSupported: boolean; oldBandIndex: number | null; oldThrows: boolean }[]>('age-gate.json');
    let low = 0;
    let high = 0;
    let newPassOldBlock = 0;
    for (const g of grid) {
      const strict = g.age[0] >= 6 && g.age[0] <= 16; // 6y0m0d .. 16y11m30d inclusive
      expect(isSupported(g.age), `strict ${g.age}`).toBe(strict);
      const oldPass = g.oldSupported && !g.oldThrows;
      if (strict) {
        const idx = data.bands.indexOf(selectBand(data, g.age)!);
        expect(idx, `band index ${g.age}`).toBe(g.oldBandIndex);
        if (!oldPass) newPassOldBlock++;
      } else if (g.oldSupported && g.oldThrows) high++;
      else if (g.oldSupported) low++;
    }
    console.log(`gate.golden cells=${grid.length} oldPassNewBlockLow=${low} oldPassNewBlockHigh=${high}`);
    expect(low).toBe(62);
    expect(high).toBe(93);
    expect(newPassOldBlock).toBe(0);
  });
});

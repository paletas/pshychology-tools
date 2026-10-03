import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { pt } from '../../src/i18n/pt';
import { repoRoot } from '../shared/load';

const base = resolve(repoRoot, 'src/Silvestre.Psychology.Tools.WISC3.WebComponent');
const files = ['Pages/WISC3.pt.resx', 'Components/WISC3LookupTableVisualizer.pt.resx'];
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false });

describe('pt strings', () => {
  for (const f of files) {
    it(`every key/value of ${f} is present verbatim`, () => {
      const x = parser.parse(readFileSync(resolve(base, f), 'utf8'));
      const list = Array.isArray(x.root.data) ? x.root.data : [x.root.data];
      let n = 0;
      for (const e of list) {
        if (e['@_type'] || e['@_mimetype']) continue;
        const v = typeof e.value === 'object' ? (e.value['#text'] ?? '') : e.value;
        expect(pt[e['@_name']], e['@_name']).toBe(v);
        n++;
      }
      expect(n).toBeGreaterThan(10);
    });
  }

  it('has literal.<n> keys and the known classification text', () => {
    expect(Object.keys(pt).filter((k) => k.startsWith('literal.')).length).toBeGreaterThanOrEqual(5);
    expect(pt['QI.AverageComparison.FarBelow']).toBe('Inferior à médio');
  });
});

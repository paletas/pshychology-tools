import { readFileSync, writeFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const base = '../src/Silvestre.Psychology.Tools.WISC3.WebComponent/';
const files = ['Pages/WISC3.pt.resx', 'Components/WISC3LookupTableVisualizer.pt.resx'];
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false });
const out = {};
for (const f of files) {
  const x = parser.parse(readFileSync(base + f, 'utf8'));
  let d = x.root.data;
  if (!Array.isArray(d)) d = [d];
  for (const e of d) {
    if (e['@_type'] || e['@_mimetype']) continue;
    const name = e['@_name'];
    const v = typeof e.value === 'object' ? e.value['#text'] ?? '' : e.value;
    if (name in out && out[name] !== v) console.error('dup key differs', name);
    out[name] = v ?? '';
  }
}
console.log(Object.keys(out).length, 'keys');
const lit = {
  'literal.1': 'WISC-III',
  'literal.2': '90%',
  'literal.3': '95%',
  'literal.4': '??? - ???',
  'literal.5': ' - ',
};
const all = { ...out, ...lit };
const lines = Object.entries(all).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
writeFileSync(
  'src/i18n/pt.ts',
  "// Portuguese strings, verbatim from WISC3.pt.resx and WISC3LookupTableVisualizer.pt.resx,\n// plus the literal visible texts of WISC3.razor / WISC3LookupTableVisualizer.razor (literal.<n>).\nexport const pt: Record<string, string> = {\n" +
    lines.join('\n') +
    '\n};\n',
);

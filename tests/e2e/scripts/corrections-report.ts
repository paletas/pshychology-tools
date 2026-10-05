// Generates docs/wisc3/corrections-report.md (English, for the psychologist's double-check) from
// data/corrections/wisc3-pt.json, the frozen oracle golden of the ORIGINAL old tables (golden-original), the oracle golden of the old app
// after the REV-11 table fix (golden) and the emitted data/wisc3-pt/**.
// Run from tests/e2e: npm run report:corrections            (writes the file; a hand-edited "Page references" section is kept)
//                     npm run report:corrections -- --check (exits 1 if the file differs, ignoring the "Page references" section)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { INDEX_NAMES } from '../../../web/src/engine/types';
import { repoRoot } from '../specs/helpers/paths';

const readJson = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const golden = join(repoRoot, 'tools/Wisc3.Oracle/golden-original'); // the original (pre-fix) tables, frozen
const goldenFixedDir = join(repoRoot, 'tools/Wisc3.Oracle/golden'); // the old app after the table fix (live reflection)
const dataDir = join(repoRoot, 'data/wisc3-pt');
const outFile = join(repoRoot, 'docs/wisc3/corrections-report.md');
const check = process.argv.includes('--check');

const corrections: any[] = readJson(join(repoRoot, 'data/corrections/wisc3-pt.json')).corrections;
const goldenCorr: any[] = readJson(join(golden, 'corrections.json'));
const goldenSub: { bands: { id: string; tests: Record<string, { rows: (number | null)[][] }> }[] } = readJson(join(golden, 'subtests.json'));
const goldenIdx: Record<string, { sum: number; inTable: boolean; iq: number; percentile: string; ci90: number[]; ci95: number[] }[]> = readJson(join(golden, 'indices.json'));
const fixedSub: { bands: { id: string; tests: Record<string, { rows: (number | null)[][]; gaps?: number[] }> }[] } = readJson(join(goldenFixedDir, 'subtests.json'));
const fixedIdx: typeof goldenIdx = readJson(join(goldenFixedDir, 'indices.json'));
const testDefs: { id: string; columns: string[] }[] = readJson(join(dataDir, 'tests.json'));
const bandIds: string[] = readJson(join(dataDir, 'bands.json')).map((b: any) => b.id);

const ids = corrections.map((c) => c.id as string);
const scaledKey = (band: string, test: string, raw: number) => `${band}|${test}|${raw}`;
const indexKey = (index: string, sum: number, field: string) => `${index}|${sum}|${field}`;

// ---- data lookups
const subCache = new Map<string, any>();
const dataSub = (band: string) => {
  if (!subCache.has(band)) subCache.set(band, readJson(join(dataDir, `subtests/${band}.json`)));
  return subCache.get(band);
};
/** [scaled, [first, last]] of the data range containing the raw, or null. */
function dataScaledFor(band: string, test: string, raw: number): [string, number[]] | null {
  const e = Object.entries(dataSub(band)[test].scaled as Record<string, number[]>).find(([, r]) => raw >= r[0] && raw <= r[1]);
  return e ? [e[0], e[1]] : null;
}
const idxCache = new Map<string, any>();
const dataIdx = (index: string) => {
  if (!idxCache.has(index)) idxCache.set(index, readJson(join(dataDir, `indices/${index}.json`)));
  return idxCache.get(index);
};

// ---- computed diff, data vs golden old tables
const scaledDiff = new Set<string>();
for (const gb of goldenSub.bands) {
  if (!bandIds.includes(gb.id)) throw new Error(`band ${gb.id} missing in data`);
  for (const def of testDefs) {
    const table = dataSub(gb.id)[def.id];
    const rows = new Map(gb.tests[def.id].rows.map((r) => [r[0] as number, r]));
    for (let raw = table.min; raw <= table.max; raw++) {
      const found = rows.get(raw);
      const row = found && found.slice(1).some((v) => v !== null) ? found : undefined; // an all-null row is a gap: the old app throws
      const now = dataScaledFor(gb.id, def.id, raw);
      if (!row) {
        if (now) scaledDiff.add(scaledKey(gb.id, def.id, raw)); // old throws, data has a value
        continue;
      }
      if (!now || row.slice(1).some((v) => v !== null && String(v) !== now[0])) scaledDiff.add(scaledKey(gb.id, def.id, raw));
    }
  }
}
const FIELDS = ['iq', 'percentile', 'ci95Lower', 'ci95Upper', 'ci90Lower', 'ci90Upper'] as const;
const oldField = (r: (typeof goldenIdx)['verbal'][number], f: (typeof FIELDS)[number]): number =>
  f === 'iq' ? r.iq : f === 'percentile' ? Number(r.percentile) : f === 'ci95Lower' ? r.ci95[0] : f === 'ci95Upper' ? r.ci95[1] : f === 'ci90Lower' ? r.ci90[0] : r.ci90[1];
const newField = (e: any, f: (typeof FIELDS)[number]): number =>
  f === 'iq' ? e.iq : f === 'percentile' ? e.percentile : f === 'ci95Lower' ? e.ci95[0] : f === 'ci95Upper' ? e.ci95[1] : f === 'ci90Lower' ? e.ci90[0] : e.ci90[1];
const indexDiff = new Set<string>();
for (const index of INDEX_NAMES) {
  const d = dataIdx(index);
  const keys = goldenIdx[index].filter((r) => r.inTable).map((r) => String(r.sum));
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(d).sort((a, b) => Number(a) - Number(b)))) throw new Error(`${index}: data keys differ from golden inTable keys`);
  for (const r of goldenIdx[index].filter((x) => x.inTable))
    for (const f of FIELDS) if (oldField(r, f) !== newField(d[r.sum], f)) indexDiff.add(indexKey(index, r.sum, f));
}

// ---- attribute the diff to correction ids
const scaledOwner = new Map<string, string>();
const indexOwner = new Map<string, string>();
for (const c of corrections)
  for (const cell of c.cells) {
    if (c.kind === 'scaled') scaledOwner.set(scaledKey(c.band, c.test, cell.raw), c.id);
    else indexOwner.set(indexKey(c.index, cell.sum, c.field), c.id);
  }
const perId = (diff: Set<string>, owner: Map<string, string>) => {
  const out: Record<string, number> = {};
  let other = 0;
  for (const k of diff) {
    const id = owner.get(k);
    if (id) out[id] = (out[id] ?? 0) + 1;
    else other++;
  }
  const unapplied = [...owner.keys()].filter((k) => !diff.has(k)).length;
  return { out, other, unapplied };
};
// ---- the old app after the fix (live golden) must equal data/ cell for cell
let fixedVsDataScaled = 0;
for (const gb of fixedSub.bands)
  for (const def of testDefs) {
    const g = gb.tests[def.id];
    for (const row of g.rows) {
      const now = dataScaledFor(gb.id, def.id, row[0] as number);
      if (!now || row.slice(1).some((v) => v === null ? false : String(v) !== now[0]) || row.slice(1).every((v) => v === null)) fixedVsDataScaled++;
    }
  }
let fixedVsDataIndex = 0;
for (const index of INDEX_NAMES)
  for (const r of fixedIdx[index].filter((x) => x.inTable))
    for (const f of FIELDS) if (oldField(r, f) !== newField(dataIdx(index)[r.sum], f)) fixedVsDataIndex++;
const sc = perId(scaledDiff, scaledOwner);
const ix = perId(indexDiff, indexOwner);
const idsOf = (kind: string) => corrections.filter((c) => c.kind === kind).map((c) => c.id as string);
const fmt = (r: Record<string, number>, which: string[]) => which.map((id) => `${id} ${r[id] ?? 0}`).join(', ');
const scaledTotal = scaledDiff.size - sc.other;
const indexTotal = indexDiff.size - ix.other;
const otherTotal = sc.other + ix.other + sc.unapplied + ix.unapplied;

// ---- text helpers
const cellText = (v: unknown) => String(v ?? '').replace(/\|/g, '/');
const ranges = (xs: number[]): string => {
  const out: string[] = [];
  for (let i = 0; i < xs.length; ) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    out.push(i === j ? `${xs[i]}` : `${xs[i]}-${xs[j]}`);
    i = j + 1;
  }
  return out.join(', ') || 'none';
};

const md: string[] = [];
md.push('# WISC-III next: corrections report', '');
md.push('Generated by `npm run report:corrections` (tests/e2e) from `data/corrections/wisc3-pt.json`, the frozen oracle golden of the ORIGINAL old tables (`tools/Wisc3.Oracle/golden-original`), the oracle golden of the old app after the table fix (`tools/Wisc3.Oracle/golden`) and the emitted data (`data/wisc3-pt`). Do not edit by hand, except the "Page references" section.', '');
md.push('Approval (user, 2026-10-03): "Fix all of them but I want a report at the end to double check everything, and then proceed". C1 was confirmed from the manual earlier the same day.', '');
md.push('Rule (REV-11, user decision 2026-10-03): the same 9 scaled + 42 index cells were also fixed in the old Blazor app (7 table files under `src/`, nothing else), so both apps show the same numbers while they run side by side. The logic bugs of the old app (age-gate leak, missing-key clamp, crashes) are NOT fixed. The live psy. site is not touched. "old (app)" below is the ORIGINAL value; the "old app after fix" columns show the fixed old app.', '');

md.push('## Summary', '');
md.push(`- scaled cells changed: ${scaledTotal} (${fmt(sc.out, idsOf('scaled'))})`);
md.push(`- index cells changed: ${indexTotal} (${fmt(ix.out, idsOf('index'))})`);
md.push(`- other cells changed: ${otherTotal}`);
md.push(`- old app after the fix vs data/: scaled cells differing ${fixedVsDataScaled}, index cells differing ${fixedVsDataIndex} (both must be 0)`, '');

md.push('## Scaled-score cells', '');
md.push('| id | manual table | band | test | raw | old (app) | new | manual source | approval | golden-original evidence | old app after fix | data evidence |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
let scaledRows = 0;
for (const c of corrections.filter((x) => x.kind === 'scaled'))
  for (const cell of c.cells) {
    const gb = goldenSub.bands.find((b) => b.id === c.band)!;
    const found = gb.tests[c.test].rows.find((r) => r[0] === cell.raw);
    const row = found && found.slice(1).some((v) => v !== null) ? found : undefined; // all-null row = old app throws
    const ev = dataScaledFor(c.band, c.test, cell.raw);
    const fixedRow = fixedSub.bands.find((b) => b.id === c.band)!.tests[c.test].rows.find((r) => r[0] === cell.raw);
    md.push(
      `| ${c.id} | ${c.table} | ${c.band} | ${c.test} | ${cell.raw} | ${cell.old} | ${cell.new} | ${cellText(c.source)} | ${cellText(c.approval)} | ${row ? JSON.stringify(row) : 'throws'} | ${fixedRow ? JSON.stringify(fixedRow) : 'throws'} | ${ev ? `"${ev[0]}":${JSON.stringify(ev[1])}` : 'none'} |`,
    );
    scaledRows++;
  }
md.push('');

md.push('## Index cells', '');
md.push('| id | manual table | index | sum | field | old (app) | new | manual source | approval | golden-original evidence (original row iq/pct/ci90/ci95) | old app after fix (row) | data evidence (new row) |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
const rowText = (iq: number, pct: number | string, ci90: number[], ci95: number[]) => `iq=${iq} pct=${pct} ci90=${ci90.join('-')} ci95=${ci95.join('-')}`;
let indexRows = 0;
for (const c of corrections.filter((x) => x.kind === 'index'))
  for (const cell of c.cells) {
    const g = goldenIdx[c.index].find((r) => r.sum === cell.sum)!;
    const d = dataIdx(c.index)[cell.sum];
    const fx = fixedIdx[c.index].find((r) => r.sum === cell.sum)!;
    md.push(
      `| ${c.id} | ${c.table} | ${c.index} | ${cell.sum} | ${c.field} | ${cell.old} | ${cell.new} | ${cellText(c.source)} | ${cellText(c.approval)} | ${rowText(g.iq, g.percentile, g.ci90, g.ci95)} | ${rowText(fx.iq, fx.percentile, fx.ci90, fx.ci95)} | ${rowText(d.iq, d.percentile, d.ci90, d.ci95)} |`,
    );
    indexRows++;
  }
md.push('');

md.push('## Display-only differences NOT changed', '');
md.push('User decision 2026-10-03: the printed manual shows `< 0.1`, `> 99.9` and `> 160` where the old app shows 0, 100 and IQ 999; the new app keeps the old display. All sums below are computed from `data/wisc3-pt`.', '');
md.push('| Index | Sums with percentile 0 (manual: < 0.1) | Sums with percentile 100 (manual: > 99.9) |', '|---|---|---|');
for (const index of INDEX_NAMES) {
  const e = Object.entries(dataIdx(index) as Record<string, { percentile: number }>).map(([s, v]) => [Number(s), v.percentile] as [number, number]);
  md.push(`| ${index} | ${ranges(e.filter((x) => x[1] === 0).map((x) => x[0]))} | ${ranges(e.filter((x) => x[1] === 100).map((x) => x[0]))} |`);
}
const iq999 = Object.entries(dataIdx('completeScale') as Record<string, { iq: number }>).filter(([, v]) => v.iq === 999).map(([s]) => Number(s));
md.push('', `Complete Scale sums with IQ 999 (manual prints \`> 160\`): ${ranges(iq999)}.`, '');

const PAGES_HEADING = '## Page references';
const pagesDefault = [PAGES_HEADING, '', 'Page numbers in the printed manual are not recorded here. Add them by hand below (this section is kept on regeneration and ignored by `--check`).', '', ...ids.map((id) => `- ${id}: page: to be added by the user`), ''].join('\n');
let pages = pagesDefault;
if (existsSync(outFile)) {
  const old = readFileSync(outFile, 'utf8');
  const a = old.indexOf(PAGES_HEADING);
  if (a >= 0) {
    const b = old.indexOf('\n## ', a + 1);
    pages = (b < 0 ? old.slice(a) : old.slice(a, b + 1)).replace(/\s*$/, '\n');
  }
}
const reproduce = [
  '## Reproduce',
  '',
  '```',
  '# from tools/',
  'dotnet run --project Wisc3.Oracle -c Release -- golden --out Wisc3.Oracle/golden',
  'dotnet run --project Wisc3.Oracle -c Release -- emit-data --out ../data/wisc3-pt',
  '# from web/',
  'npm run data:format -- ../data/wisc3-pt',
  'npm run data:check',
  'npm test',
  '# from tests/e2e/',
  'npm run report:corrections',
  '```',
  '',
].join('\n');
const body = md.join('\n') + '\n';
const full = body + pages + '\n' + reproduce;

const strip = (t: string) => {
  const a = t.indexOf(PAGES_HEADING);
  if (a < 0) return t;
  const b = t.indexOf('\n## ', a + 1);
  return t.slice(0, a) + (b < 0 ? '' : t.slice(b + 1));
};

const ok = fixedVsDataScaled === 0 && fixedVsDataIndex === 0 && scaledTotal === 9 && indexTotal === 42 && otherTotal === 0 && scaledRows === 9 && indexRows === 42 && ids.length === 9;
console.log(`corrections-report: scaled=${scaledTotal} index=${indexTotal} other=${otherTotal} scaledRows=${scaledRows} indexRows=${indexRows} ids=${ids.length}`);
if (!ok) {
  console.error('corrections-report: counts differ from 9/42/0');
  process.exit(1);
}
if (check) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  if (strip(current) !== strip(full)) {
    console.error(`corrections-report: ${outFile} is out of date (run npm run report:corrections)`);
    process.exit(1);
  }
  console.log('corrections-report: --check OK');
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, full);
  console.log(`corrections-report: wrote ${outFile}`);
}

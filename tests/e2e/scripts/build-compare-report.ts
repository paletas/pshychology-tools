// Builds reports/compare-report.{json,md} from reports/compare/cases/*.json. Exit 1 on any regression/mismatch/harness failure/untagged diff/ad response, unclassified or missing old console error, new-app console error, or a tag with 0 hits.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { e2eDir, repoRoot, reportsDir } from '../specs/helpers/paths';

const TAGS = ['gate-low', 'gate-high-throw', 'index-missing-key', 'manual-correction'] as const;

interface CaseFile {
  id: string;
  kind: string;
  age?: number[] | null;
  tags: string[];
  correctionIds?: string[];
  verdict: string;
  error?: string;
  uncovered?: unknown[];
  oldVsNew?: { field: string; a: string; b: string }[];
  blankCharts?: { old: boolean; new: boolean };
  ads?: { blocked: number; responses: number };
  oldConsole?: { predicted: string[]; observed: string[]; unclassified: string[] };
  consoleErrors?: { old: string[]; new: string[] };
  [k: string]: unknown;
}

const dir = join(reportsDir, 'compare/cases');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
const cases: CaseFile[] = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const count = (v: string) => cases.filter((c) => c.verdict === v).length;
const tagHits = Object.fromEntries(TAGS.map((t) => [t, cases.filter((c) => c.tags?.includes(t)).length])) as Record<(typeof TAGS)[number], number>;
const CORRECTION_IDS = ['C1', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const;
const correctionHits = Object.fromEntries(CORRECTION_IDS.map((id) => [id, cases.filter((c) => c.correctionIds?.includes(id)).length])) as Record<(typeof CORRECTION_IDS)[number], number>;
const OLD_KINDS = ['age-throw', 'raw-throw', 'visualizer-raw-throw', 'visualizer-index-throw'] as const;
const casesOfKind = (k: string) => cases.filter((c) => c.oldConsole?.observed.includes(k));
const oldConsoleKinds = Object.fromEntries(OLD_KINDS.map((k) => [k, casesOfKind(k).length])) as Record<(typeof OLD_KINDS)[number], number>;
const summary = {
  total: cases.length,
  pass: count('pass'),
  expectedDiff: count('expected-diff'),
  regression: count('regression'),
  oldModelMismatch: count('old-model-mismatch'),
  harnessFailure: count('harness-failure'),
  untaggedDiffs: cases.filter((c) => (c.uncovered?.length ?? 0) > 0).length,
  adResponses: cases.reduce((n, c) => n + (c.ads?.responses ?? 0), 0),
  adBlockedAttempts: cases.reduce((n, c) => n + (c.ads?.blocked ?? 0), 0),
  blankCharts: {
    old: cases.filter((c) => c.blankCharts?.old).length,
    new: cases.filter((c) => c.blankCharts?.new).length,
  },
  tagHits,
  correctionHits,
  oldConsoleKinds,
  unclassifiedOldConsole: cases.reduce((n, c) => n + (c.oldConsole?.unclassified.length ?? 0), 0),
  oldConsoleMissing: cases.filter((c) => c.oldConsole?.predicted.some((k) => !c.oldConsole!.observed.includes(k))).length,
  newConsoleErrors: cases.reduce((n, c) => n + (c.consoleErrors?.new.length ?? 0), 0),
};
writeFileSync(join(reportsDir, 'compare-report.json'), JSON.stringify(summary, null, 2) + '\n');

const correctionsFile = join(repoRoot, 'data/corrections/wisc3-pt.json');
const corrections: { id: string; kind: string; table: string; source: string; approval: string; band?: string; test?: string; index?: string; field?: string }[] = existsSync(correctionsFile)
  ? JSON.parse(readFileSync(correctionsFile, 'utf8')).corrections ?? []
  : [];
const idList = corrections
  .map((c) => `${c.id} (Table ${c.table}, ${c.kind === 'scaled' ? `${c.band} ${c.test}` : `${c.index} ${c.field}`}; ${c.source}; ${c.approval})`)
  .join('; ');

const catalogue: Record<(typeof TAGS)[number], string> = {
  'gate-low':
    'The day-count age is not strictly supported, and the old prediction has supported:true, throws:false. With the old gate this happens only for 5y10m0d..5y11m30d. Old app: passes the gate and is scored with band 06y06m. New app: blocked (same display as a correctly blocked age).',
  'gate-high-throw':
    'The day-count age is not strictly supported, and the old prediction has throws:true, throwStage:"age" (exactly the ages 17y0m0d..17y2m30d, where the old gate leaks and the band lookup throws). Old app: throws at date entry (age-throw console exception). New app: blocked. Ages from 17y3m0d up are blocked by both apps and get no tag.',
  'index-missing-key':
    'The age is strictly supported, indices are shown, and an index sum is not in its golden key set. Old app: the max-key entry. New app: that index row shows unavailable (IQ, percentile and CI show the dash, no classification arrow, null slot in the QI chart).',
  'manual-correction': `The oracle scenario output has a non-empty correctionsHit: a raw lands on a corrected scaled cell (C1, D1-D3), or a shown index has a sum with a corrected cell (D4-D8). Old app: the old table values (C1: band 11y06m, ImageDisposition raw 38 throws, raw-throw console exception). New app: the corrected values. Scaled ids cover the whole case; index ids cover that index row and its QI-chart entry. The case record lists the ids. Corrections (9 ids, only these cells change): ${idList}.`,
};

const age = (c: CaseFile) => (c.age ? `${c.age[0]}y${c.age[1]}m${c.age[2]}d` : 'n/a');
const md: string[] = [];
md.push('# WISC-III old vs new comparison', '');
md.push('| Measure | Count |', '|---|---|');
md.push(`| Total cases | ${summary.total} |`, `| pass | ${summary.pass} |`, `| expected-diff | ${summary.expectedDiff} |`);
md.push(`| regression | ${summary.regression} |`, `| old-model-mismatch | ${summary.oldModelMismatch} |`, `| harness-failure | ${summary.harnessFailure} |`);
md.push(`| untagged diffs | ${summary.untaggedDiffs} |`, `| ad responses | ${summary.adResponses} |`, `| ad blocked attempts | ${summary.adBlockedAttempts} |`);
md.push(`| blank charts (old / new) | ${summary.blankCharts.old} / ${summary.blankCharts.new} |`);
md.push(`| unclassified old console records | ${summary.unclassifiedOldConsole} |`, `| old console missing (predicted, not seen) | ${summary.oldConsoleMissing} |`, `| new-app console errors | ${summary.newConsoleErrors} |`, '');
md.push('Out of scope: test date on or before the birth date (old app logs an error; new app behaviour not asserted).', '');
md.push('## Old-app console errors (predicted by the oracle; old-app bugs, not in the new app)', '');
md.push('The oracle predicts, per case, which console exceptions the old app logs; presence is compared in both directions. An unclassified record is a regression, a predicted kind that is not observed is an old-model-mismatch. The new app has zero tolerance.', '');
const KIND_CAUSE: Record<(typeof OLD_KINDS)[number], string> = {
  'age-throw': 'Setting SubjectAge throws "Age provided is outside of supported range" (LookupStandardizer.cs:66), ages 17y0m0d..17y2m30d.',
  'raw-throw': 'Setting a raw result throws "is outside of the supported values" (C1: band 11y06m, ImageDisposition raw 38, a gap in the old table).',
  'visualizer-raw-throw': 'The lookup visualizer enumerates every raw of every test and hits the gap at band 11y06m, ImageDisposition raw 38 (WISC3LookupTableVisualizer.razor:83-127).',
  'visualizer-index-throw': 'The lookup visualizer indexes its scaled array out of range (WISC3LookupTableVisualizer.razor:109-121).',
};
md.push('| Kind | Cause | Cases | Case ids |', '|---|---|---|---|');
for (const k of OLD_KINDS) md.push(`| ${k} | ${KIND_CAUSE[k]} | ${oldConsoleKinds[k]} | ${casesOfKind(k).map((c) => c.id).join(', ') || '-'} |`);
md.push('');
md.push('## Tag catalogue', '', '| Tag | Definition | Hits |', '|---|---|---|');
for (const t of TAGS) md.push(`| ${t} | ${catalogue[t].replace(/\|/g, '/')} | ${tagHits[t]} |`);
md.push('', '## Correction hits', '', '| Id | Cases |', '|---|---|');
for (const id of CORRECTION_IDS) md.push(`| ${id} | ${correctionHits[id]} |`);
md.push('', '## Expected-diff cases', '');
const expectedDiffs = cases.filter((c) => c.verdict === 'expected-diff');
if (expectedDiffs.length === 0) md.push('None.', '');
for (const c of expectedDiffs) {
  md.push(`### ${c.id} (age ${age(c)}; tags: ${c.tags.join(', ')}${c.correctionIds?.length ? `; ids: ${c.correctionIds.join(', ')}` : ''})`, '');
  for (const d of c.oldVsNew ?? []) md.push(`- ${d.field}: ${d.a} -> ${d.b}`);
  md.push('');
}
md.push('## QI chart y-axis (review cases)', '', 'The min is asserted equal; the max is recorded only (tick generation differs between Chart.js 2 and the new SVG axis).', '', '| Case | old min/max | new min/max |', '|---|---|---|');for (const c of cases.filter((x) => (x as any).qiAxis)) {  const a = (c as any).qiAxis as { old: { min: number; max: number } | null; new: { min: number; max: number } | null };  md.push(`| ${c.id} | ${a.old ? `${a.old.min} / ${a.old.max}` : 'n/a'} | ${a.new ? `${a.new.min} / ${a.new.max}` : 'n/a'} |`);}md.push('');
md.push('## Failing cases', '');
const failing = cases.filter((c) => !['pass', 'expected-diff'].includes(c.verdict));
if (failing.length === 0) md.push('None.', '');
for (const c of failing) {
  md.push(`### ${c.id}: ${c.verdict} (age ${age(c)}; tags: ${c.tags.join(', ') || 'none'})`, '', '```json', JSON.stringify(c, null, 1), '```', '');
}
writeFileSync(join(reportsDir, 'compare-report.md'), md.join('\n'));

const bad =
  summary.regression + summary.oldModelMismatch + summary.harnessFailure + summary.untaggedDiffs + summary.adResponses + summary.unclassifiedOldConsole + summary.oldConsoleMissing + summary.newConsoleErrors > 0 ||
  TAGS.some((t) => tagHits[t] === 0) ||
  CORRECTION_IDS.some((id) => correctionHits[id] === 0) ||
  summary.total === 0;
console.log(
  `compare: total=${summary.total} pass=${summary.pass} expectedDiff=${summary.expectedDiff} regression=${summary.regression} oldModelMismatch=${summary.oldModelMismatch} harnessFailure=${summary.harnessFailure} untaggedDiffs=${summary.untaggedDiffs} adResponses=${summary.adResponses} unclassifiedOldConsole=${summary.unclassifiedOldConsole} oldConsoleMissing=${summary.oldConsoleMissing} newConsoleErrors=${summary.newConsoleErrors} oldConsoleKinds=${JSON.stringify(oldConsoleKinds)} (${e2eDir})`,
);
process.exit(bad ? 1 : 0);

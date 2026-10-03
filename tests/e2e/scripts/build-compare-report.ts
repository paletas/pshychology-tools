// Builds reports/compare-report.{json,md} from reports/compare/cases/*.json. Exit 1 on any regression/mismatch/harness failure/untagged diff/ad response or a tag with 0 hits.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { e2eDir, repoRoot, reportsDir } from '../specs/helpers/paths';

const TAGS = ['gate-low', 'gate-high-throw', 'index-missing-key', 'manual-correction'] as const;

interface CaseFile {
  id: string;
  kind: string;
  age?: number[] | null;
  tags: string[];
  verdict: string;
  error?: string;
  uncovered?: unknown[];
  oldVsNew?: { field: string; a: string; b: string }[];
  blankCharts?: { old: boolean; new: boolean };
  ads?: { blocked: number; responses: number };
  [k: string]: unknown;
}

const dir = join(reportsDir, 'compare/cases');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
const cases: CaseFile[] = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const count = (v: string) => cases.filter((c) => c.verdict === v).length;
const tagHits = Object.fromEntries(TAGS.map((t) => [t, cases.filter((c) => c.tags?.includes(t)).length])) as Record<(typeof TAGS)[number], number>;
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
};
writeFileSync(join(reportsDir, 'compare-report.json'), JSON.stringify(summary, null, 2) + '\n');

const correctionsFile = join(repoRoot, 'data/corrections/wisc3-pt.json');
const c1 = existsSync(correctionsFile) ? (JSON.parse(readFileSync(correctionsFile, 'utf8')).corrections ?? [])[0] : null;
const c1Cite = c1 ? `${c1.source}; confirmed by ${c1.confirmedBy} on ${c1.confirmedOn} (${c1.id})` : 'C1 (corrections file not found)';

const catalogue: Record<(typeof TAGS)[number], string> = {
  'gate-low':
    'The day-count age is not strictly supported, and the old prediction has supported:true, throws:false. With the old gate this happens only for 5y10m0d..5y11m30d. Old app: passes the gate and is scored with band 06y06m. New app: blocked (same display as a correctly blocked age).',
  'gate-high-throw':
    'The day-count age is not strictly supported, and the old prediction has throws:true, throwStage:"age" (exactly the ages 17y0m0d..17y2m30d, where the old gate leaks and the band lookup throws). Old app: throws, #blazor-error-ui visible. New app: blocked. Ages from 17y3m0d up are blocked by both apps and get no tag.',
  'index-missing-key':
    'The age is strictly supported, indices are shown, and an index sum is not in its golden key set. Old app: the max-key entry. New app: that index row shows unavailable (IQ, percentile and CI show the dash, no classification arrow, null slot in the QI chart).',
  'manual-correction': `The age is strictly supported, the old prediction has throwStage:"raw", and throwAt matches a golden correction. Old app: band 11y06m, ImageDisposition raw 38 throws when entered (#blazor-error-ui, the page is dead). New app: scaled 13 in the realization and perceptiveOrganization columns; everything else equals the old app's outcome with raw 39. Source: ${c1Cite}.`,
};

const age = (c: CaseFile) => (c.age ? `${c.age[0]}y${c.age[1]}m${c.age[2]}d` : 'n/a');
const md: string[] = [];
md.push('# WISC-III old vs new comparison', '');
md.push('| Measure | Count |', '|---|---|');
md.push(`| Total cases | ${summary.total} |`, `| pass | ${summary.pass} |`, `| expected-diff | ${summary.expectedDiff} |`);
md.push(`| regression | ${summary.regression} |`, `| old-model-mismatch | ${summary.oldModelMismatch} |`, `| harness-failure | ${summary.harnessFailure} |`);
md.push(`| untagged diffs | ${summary.untaggedDiffs} |`, `| ad responses | ${summary.adResponses} |`, `| ad blocked attempts | ${summary.adBlockedAttempts} |`);
md.push(`| blank charts (old / new) | ${summary.blankCharts.old} / ${summary.blankCharts.new} |`, '');
md.push('## Tag catalogue', '', '| Tag | Definition | Hits |', '|---|---|---|');
for (const t of TAGS) md.push(`| ${t} | ${catalogue[t].replace(/\|/g, '/')} | ${tagHits[t]} |`);
md.push('', '## Expected-diff cases', '');
const expectedDiffs = cases.filter((c) => c.verdict === 'expected-diff');
if (expectedDiffs.length === 0) md.push('None.', '');
for (const c of expectedDiffs) {
  md.push(`### ${c.id} (age ${age(c)}; tags: ${c.tags.join(', ')})`, '');
  for (const d of c.oldVsNew ?? []) md.push(`- ${d.field}: ${d.a} -> ${d.b}`);
  md.push('');
}
md.push('## Failing cases', '');
const failing = cases.filter((c) => !['pass', 'expected-diff'].includes(c.verdict));
if (failing.length === 0) md.push('None.', '');
for (const c of failing) {
  md.push(`### ${c.id}: ${c.verdict} (age ${age(c)}; tags: ${c.tags.join(', ') || 'none'})`, '', '```json', JSON.stringify(c, null, 1), '```', '');
}
writeFileSync(join(reportsDir, 'compare-report.md'), md.join('\n'));

const bad =
  summary.regression + summary.oldModelMismatch + summary.harnessFailure + summary.untaggedDiffs + summary.adResponses > 0 ||
  TAGS.some((t) => tagHits[t] === 0) ||
  summary.total === 0;
console.log(
  `compare: total=${summary.total} pass=${summary.pass} expectedDiff=${summary.expectedDiff} regression=${summary.regression} oldModelMismatch=${summary.oldModelMismatch} harnessFailure=${summary.harnessFailure} untaggedDiffs=${summary.untaggedDiffs} adResponses=${summary.adResponses} (${e2eDir})`,
);
process.exit(bad ? 1 : 0);

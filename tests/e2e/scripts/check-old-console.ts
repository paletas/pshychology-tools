// Calibrates the old-console classifier (specs/helpers/old-console.ts) over the recorded cases in reports/compare/cases.
// Run from tests/e2e: npx tsx scripts/check-old-console.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyOld, evaluateOldConsole } from '../specs/helpers/old-console';
import type { PredictedOldConsole } from '../specs/helpers/old-console';
import { e2eDir, reportsDir } from '../specs/helpers/paths';

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: e2eDir, stdio: 'inherit', shell: process.platform === 'win32' });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
};

// 1. the current generator + oracle must accept every generated case
run('npx', ['tsx', 'scripts/generate-cases.ts']);
run('node', ['scripts/predict-old.mjs']);

// 2. predictions for the RECORDED case inputs (the recorded file holds testDate/birthDate/raw per case)
const dir = join(reportsDir, 'compare/cases');
const recorded = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((r) => r.testDate > r.birthDate); // skips the two recorded out-of-scope cases (test date on or before birth date)
const tmp = join(e2eDir, '.tmp');
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'cases-recorded.json'), JSON.stringify(recorded.map((r) => ({ id: r.id, testDate: r.testDate, birthDate: r.birthDate, raw: r.raw }))));
run('node', ['scripts/predict-old.mjs', join(tmp, 'cases-recorded.json'), join(tmp, 'predictions-recorded.json')]);
const preds = new Map<string, { old: { throws: boolean }; oldConsole: PredictedOldConsole[] }>(
  JSON.parse(readFileSync(join(tmp, 'predictions-recorded.json'), 'utf8')).map((p: { id: string }) => [p.id, p]),
);

let unclassified = 0;
let mismatched = 0;
let unrecorded = 0;
console.log('case | observed | predicted | unclassified');
for (const r of recorded) {
  const p = preds.get(r.id)!;
  const ctx = { oldConsole: p.oldConsole };
  const records: string[] = r.consoleErrors?.old ?? [];
  const ev = evaluateOldConsole(records.map((text, i) => ({ t: i, text })), ctx);
  const extra = ev.observed.filter((k) => !ev.predicted.includes(k));
  const missing = ev.predicted.filter((k) => !ev.observed.includes(k));
  // Crash cases were recorded under the retired allowlist (b), which swallowed their console exceptions: not observable from the record.
  const swallowed = p.old.throws && missing.length > 0 && !r.consoleErrors;
  const swallowedByAllowlist = p.old.throws && r.consoleErrors?.old.length === 0;
  if (ev.unclassified.length > 0) unclassified += ev.unclassified.length;
  if (extra.length > 0 || (missing.length > 0 && !swallowed && !swallowedByAllowlist)) mismatched++;
  if (missing.length > 0 && (swallowed || swallowedByAllowlist)) unrecorded++;
  if (ev.observed.length || ev.predicted.length || ev.unclassified.length)
    console.log(`${r.id} | ${ev.observed.join(',') || '-'} | ${ev.predicted.join(',') || '-'} | ${ev.unclassified.length}${swallowed || swallowedByAllowlist ? ' (crash case recorded under retired allowlist b: not observable)' : ''}`);
}
void classifyOld;
console.log(`cases=${recorded.length} unrecorded=${unrecorded} unclassified=${unclassified} mismatched=${mismatched}`);
process.exit(unclassified === 0 && mismatched === 0 ? 0 : 1);

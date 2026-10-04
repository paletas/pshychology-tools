// Runs generate-cases, predict-old and the compare project; always builds the report afterwards and exits with its code.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const e2e = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shell = process.platform === 'win32';
const run = (cmd, args) => spawnSync(cmd, args, { cwd: e2e, stdio: 'inherit', shell });

// stale per-case files from an earlier run must not leak into this report
rmSync(resolve(e2e, 'reports/compare/cases'), { recursive: true, force: true });

let status = run('npx', ['tsx', 'scripts/generate-cases.ts']).status ?? 1;
if (status === 0) status = run('node', ['scripts/predict-old.mjs']).status ?? 1;
if (status === 0) status = run('npx', ['playwright', 'test', '-c', 'playwright.compare.config.ts', '--project=compare']).status ?? 1;
const report = run('npx', ['tsx', 'scripts/build-compare-report.ts']).status ?? 1;
process.exit(report !== 0 ? report : status === 0 ? 0 : status);

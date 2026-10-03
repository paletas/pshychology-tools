// Runs the oracle `scenarios` command on .tmp/cases.json -> .tmp/predictions-old.json (the old app's recorded outcome per case).
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const e2e = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(e2e, '../..');
const result = spawnSync(
  'dotnet',
  [
    'run', '--project', 'Wisc3.Oracle', '-c', 'Release', '--',
    'scenarios', '--in', resolve(e2e, '.tmp/cases.json'), '--out', resolve(e2e, '.tmp/predictions-old.json'),
  ],
  { cwd: resolve(repo, 'tools'), stdio: 'inherit' },
);
process.exit(result.status ?? 1);

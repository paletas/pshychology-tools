// Publishes the old Blazor app (non-AOT Release) into tests/e2e/.tmp/old-publish for the comparison harness.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2e = resolve(here, '..');
const tools = resolve(e2e, '../../tools');
const out = resolve(e2e, '.tmp/old-publish');

const r = spawnSync(
  'dotnet',
  [
    'publish',
    '../src/Silvestre.Psychology.Tools.WebApp/Silvestre.Psychology.Tools.WebApp.csproj',
    '-c',
    'Release',
    '-p:RunAOTCompilation=false',
    '-o',
    out,
  ],
  { cwd: tools, stdio: 'inherit' },
);
process.exit(r.status ?? 1);

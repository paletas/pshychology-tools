import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.json')) {
      const t = readFileSync(p, 'utf8');
      const f = JSON.stringify(JSON.parse(t), null, 2) + '\n';
      if (f !== t) writeFileSync(p, f);
    }
  }
}

const dir = process.argv[2];
if (!dir) {
  console.error('usage: format-data.mjs <dir>');
  process.exit(2);
}
walk(dir);

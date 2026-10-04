import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, sha256Hex } from './canonical.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../data/wisc3-pt');
const out = resolve(here, '../public/reference/baseline.json');
const buf = buildBundle(dataDir);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`baseline.json ${buf.length} bytes sha256=${sha256Hex(buf)}`);

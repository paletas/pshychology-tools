import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Canonical JSON: keys sorted by UTF-16 code units, no whitespace, built by hand
// (JSON.stringify on objects would order integer-like keys numerically).
export function canonical(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return '[' + v.map(canonical).join(',') + ']';
  }
  const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function readDir(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    out[f.slice(0, -'.json'.length)] = readJson(join(dir, f));
  }
  return out;
}

export function buildBundle(dataDir) {
  const version = readJson(join(dataDir, 'version.json'));
  const bundle = {
    schemaVersion: version.schemaVersion,
    dataVersion: version.dataVersion,
    bands: readJson(join(dataDir, 'bands.json')),
    tests: readJson(join(dataDir, 'tests.json')),
    subtests: readDir(join(dataDir, 'subtests')),
    indices: readDir(join(dataDir, 'indices')),
  };
  return Buffer.from(canonical(bundle), 'utf8');
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

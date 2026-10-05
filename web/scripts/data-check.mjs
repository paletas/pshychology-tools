import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../data/wisc3-pt');
const corrFile = resolve(here, '../../data/corrections/wisc3-pt.json');
const errors = [];
const err = (m) => errors.push(m);

const COLUMNS = ['verbal', 'realization', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'];
const INDEX_NAMES = ['verbal', 'realization', 'completeScale', 'verbalComprehension', 'perceptiveOrganization', 'processingVelocity'];
const ALLOWED = /^[A-Za-z0-9._-]+$/;

function walk(dir, fn) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, fn);
    else if (n.endsWith('.json')) fn(p);
  }
}

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

// formatting invariant + strings + numeric values only
walk(dataDir, (p) => {
  const t = readFileSync(p, 'utf8');
  const v = JSON.parse(t);
  if (JSON.stringify(v, null, 2) + '\n' !== t) err(`not formatted: ${p}`);
  const check = (x, path) => {
    if (typeof x === 'string') {
      if (!ALLOWED.test(x)) err(`disallowed string "${x}" in ${p} at ${path}`);
    } else if (Array.isArray(x)) x.forEach((e, i) => check(e, `${path}[${i}]`));
    else if (x !== null && typeof x === 'object') {
      for (const [k, e] of Object.entries(x)) {
        if (!ALLOWED.test(k)) err(`disallowed key "${k}" in ${p}`);
        check(e, `${path}.${k}`);
      }
    } else if (typeof x !== 'number' && typeof x !== 'boolean') err(`unexpected value in ${p} at ${path}`);
  };
  check(v, '$');
});

const version = json(join(dataDir, 'version.json'));
if (version.schemaVersion !== 1 || typeof version.dataVersion !== 'string') err('version.json invalid');

const bands = json(join(dataDir, 'bands.json'));
const tests = json(join(dataDir, 'tests.json'));
if (bands.length !== 22) err(`expected 22 bands, got ${bands.length}`);
bands.forEach((b, i) => {
  const y = 6 + Math.floor(i / 2);
  const second = i % 2 === 1;
  const from = [y, second ? 6 : 0, 0];
  const to = second ? [y, 11, 30] : [y, 5, 30];
  const id = `${String(y).padStart(2, '0')}y${second ? '06' : '00'}m`;
  if (b.id !== id) err(`band ${i} id ${b.id} != ${id}`);
  if (JSON.stringify(b.from) !== JSON.stringify(from)) err(`band ${b.id} from`);
  if (JSON.stringify(b.to) !== JSON.stringify(to)) err(`band ${b.id} to`);
});

if (tests.length !== 13) err(`expected 13 tests, got ${tests.length}`);
for (const t of tests) {
  if (typeof t.mandatory !== 'boolean') err(`test ${t.id} mandatory`);
  for (const c of t.columns) if (!COLUMNS.includes(c)) err(`test ${t.id} column ${c}`);
}

function scaledFor(band, test, raw) {
  const e = band[test];
  if (!e || raw < e.min || raw > e.max) return null;
  for (const [s, [lo, hi]] of Object.entries(e.scaled)) if (raw >= lo && raw <= hi) return Number(s);
  return null;
}

const subtests = {};
for (const b of bands) {
  const p = join(dataDir, 'subtests', `${b.id}.json`);
  if (!existsSync(p)) {
    err(`missing ${p}`);
    continue;
  }
  const s = json(p);
  subtests[b.id] = s;
  for (const t of tests) {
    const e = s[t.id];
    if (!e) {
      err(`${b.id} missing test ${t.id}`);
      continue;
    }
    const ranges = Object.entries(e.scaled)
      .map(([k, r]) => [Number(k), r[0], r[1]])
      .sort((a, c) => a[1] - c[1]);
    let next = e.min;
    for (const [k, lo, hi] of ranges) {
      if (lo !== next) err(`${b.id} ${t.id} scaled ${k}: range starts ${lo}, expected ${next}`);
      if (hi < lo) err(`${b.id} ${t.id} scaled ${k}: empty range`);
      next = hi + 1;
    }
    if (next !== e.max + 1) err(`${b.id} ${t.id}: ranges end at ${next - 1}, max ${e.max}`);
    let prev = 0;
    for (const [k] of ranges) {
      if (k < 1 || k > 19) err(`${b.id} ${t.id}: scaled ${k} outside 1..19`);
      if (k < prev) err(`${b.id} ${t.id}: scaled not non-decreasing`);
      prev = k;
    }
  }
  for (const k of Object.keys(s)) if (!tests.some((t) => t.id === k)) err(`${b.id} unknown test ${k}`);
}

for (const n of INDEX_NAMES) {
  const p = join(dataDir, 'indices', `${n}.json`);
  if (!existsSync(p)) {
    err(`missing index ${n}`);
    continue;
  }
  for (const [sum, e] of Object.entries(json(p))) {
    if (!/^\d+$/.test(sum)) err(`index ${n} key ${sum}`);
    if (!Number.isFinite(e.iq) || !Number.isFinite(e.percentile)) err(`index ${n}/${sum} values`);
    for (const c of ['ci90', 'ci95']) if (!Array.isArray(e[c]) || e[c].length !== 2) err(`index ${n}/${sum} ${c}`);
  }
}
const idxFiles = readdirSync(join(dataDir, 'indices')).filter((f) => f.endsWith('.json'));
if (idxFiles.length !== 6) err(`expected 6 index files, got ${idxFiles.length}`);

// corrections file (outside the bundle), schema v2
const IDX_FIELDS = ['iq', 'percentile', 'ci95Lower', 'ci95Upper'];
let corrSummary = 'corrections: not checked';
if (!existsSync(corrFile)) err(`missing corrections file ${corrFile}`);
else {
  const c = json(corrFile);
  if (c.schemaVersion !== 2) err('corrections: schemaVersion must be 2');
  if (!Array.isArray(c.corrections) || c.corrections.length === 0) err('corrections: empty');
  else {
    const ids = new Set();
    let scaledCells = 0;
    let indexCells = 0;
    const indicesData = {};
    for (const n of INDEX_NAMES) indicesData[n] = json(join(dataDir, 'indices', `${n}.json`));
    for (const x of c.corrections) {
      for (const f of ['id', 'kind', 'table', 'cells', 'oldSource', 'source', 'approval']) if (!(f in x)) err(`correction ${x.id}: missing ${f}`);
      if (ids.has(x.id)) err(`correction ${x.id}: duplicate id`);
      ids.add(x.id);
      if (!Array.isArray(x.cells) || x.cells.length === 0) {
        err(`correction ${x.id}: no cells`);
        continue;
      }
      if (x.kind === 'scaled') {
        for (const f of ['band', 'test']) if (!(f in x)) err(`correction ${x.id}: missing ${f}`);
        for (const cell of x.cells) {
          for (const f of ['raw', 'old', 'new']) if (!(f in cell)) err(`correction ${x.id}: cell missing ${f}`);
          const got = subtests[x.band] ? scaledFor(subtests[x.band], x.test, cell.raw) : null;
          if (got !== cell.new) err(`correction ${x.id}: data scaledFor(${x.band},${x.test},${cell.raw})=${got}, expected ${cell.new}`);
          scaledCells++;
        }
      } else if (x.kind === 'index') {
        if (!INDEX_NAMES.includes(x.index)) err(`correction ${x.id}: unknown index ${x.index}`);
        if (!IDX_FIELDS.includes(x.field)) err(`correction ${x.id}: unknown field ${x.field}`);
        for (const cell of x.cells) {
          for (const f of ['sum', 'old', 'new']) if (!(f in cell)) err(`correction ${x.id}: cell missing ${f}`);
          const e = indicesData[x.index]?.[String(cell.sum)];
          const got = !e ? undefined : x.field === 'iq' ? e.iq : x.field === 'percentile' ? e.percentile : x.field === 'ci95Lower' ? e.ci95[0] : e.ci95[1];
          if (got !== cell.new) err(`correction ${x.id}: data ${x.index}/${cell.sum}.${x.field}=${got}, expected ${cell.new}`);
          indexCells++;
        }
      } else err(`correction ${x.id}: unknown kind ${x.kind}`);
    }
    if (scaledCells !== 9 || indexCells !== 42 || ids.size !== 9) err(`corrections: expected scaled=9 index=42 ids=9, got scaled=${scaledCells} index=${indexCells} ids=${ids.size}`);
    corrSummary = `corrections: scaled=${scaledCells} index=${indexCells} ids=${ids.size}`;
  }
}

if (errors.length) {
  console.error(errors.slice(0, 50).join('\n'));
  console.error(`data-check FAILED (${errors.length} problems)`);
  process.exit(1);
}
console.log(corrSummary);
console.log('data-check OK');

// Resets tests/e2e/.tmp/spa and .tmp/data from web/dist and data/wisc3-pt (same as specs/helpers/tmp.ts).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2e = resolve(here, '..');
const repo = resolve(e2e, '../..');

function reset(src, dest) {
  if (!existsSync(src)) throw new Error(`missing ${src} (build web first)`);
  mkdirSync(dest, { recursive: true });
  // empty in place: the server holds the directory itself
  for (const name of readdirSync(dest)) rmSync(join(dest, name), { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

reset(resolve(repo, 'web/dist'), resolve(e2e, '.tmp/spa'));
reset(resolve(repo, 'data/wisc3-pt'), resolve(e2e, '.tmp/data'));

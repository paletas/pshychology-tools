import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, tmpData, tmpSpa, webDist } from './paths';

function reset(src: string, dest: string): void {
  if (!existsSync(src)) throw new Error(`missing ${src} (build web first)`);
  mkdirSync(dest, { recursive: true });
  // empty in place: the server holds the directory itself
  for (const name of readdirSync(dest)) rmSync(join(dest, name), { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

/** Empties and recopies web/dist -> .tmp/spa and data/wisc3-pt -> .tmp/data, in place. */
export function resetTmp(): void {
  reset(webDist, tmpSpa);
  reset(dataDir, tmpData);
}

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const repoRoot = resolve(e2eDir, '../..');
export const webDist = resolve(repoRoot, 'web/dist');
export const dataDir = resolve(repoRoot, 'data/wisc3-pt');
export const tmpSpa = resolve(e2eDir, '.tmp/spa');
export const tmpData = resolve(e2eDir, '.tmp/data');
export const oldPublish = resolve(e2eDir, '.tmp/old-publish');
export const reportsDir = resolve(e2eDir, 'reports');
export const fixturesDir = resolve(e2eDir, 'fixtures');

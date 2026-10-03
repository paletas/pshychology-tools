import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../shared/load';

const srcDir = resolve(repoRoot, 'web/src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]));
}

const files = walk(srcDir)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => ({ path: relative(srcDir, f).split(sep).join('/'), text: readFileSync(f, 'utf8') }));
const read = (p: string) => files.find((f) => f.path === p)!.text;

describe('static guards on web/src', () => {
  it('has the expected files to scan', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('never touches localStorage, sessionStorage or cookies', () => {
    for (const f of files) expect(f.text, f.path).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it('uses idb / indexedDB only under src/refdata/', () => {
    for (const f of files.filter((x) => !x.path.startsWith('refdata/'))) {
      expect(f.text, f.path).not.toMatch(/from 'idb'|from "idb"|indexedDB/);
    }
  });

  it('never imports from test/, tools/ or tests/', () => {
    for (const f of files) expect(f.text, f.path).not.toMatch(/from\s+['"][^'"]*\/(test|tools|tests)\//);
  });

  it('service worker has a same-origin guard and no respondWith outside workbox routes', () => {
    const sw = read('service-worker.ts');
    expect(sw).toMatch(/url\.origin === sw\.location\.origin/);
    expect(sw).not.toMatch(/respondWith/);
    for (const f of files.filter((x) => x.path !== 'service-worker.ts')) expect(f.text, f.path).not.toMatch(/respondWith/);
  });

  it('main.tsx uses no console.error', () => {
    expect(read('main.tsx')).not.toMatch(/console\.error/);
  });
});

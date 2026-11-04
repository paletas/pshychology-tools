import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../shared/load';
import { scan } from '../../../tests/e2e/scripts/ui-class-audit';

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

  // The guard protects user data from being persisted client-side. Narrow allow-list: analytics/client.ts
  // only READS localStorage for the 'umami.disabled' opt-out key; nothing else may use web storage.
  const STORAGE_ALLOWED = ['analytics/client.ts'];
  const IDB_ALLOWED_PREFIX = 'refdata/';
  // analytics/queue.ts stores only event names, counts and fixed categories (no user data).
  const IDB_ALLOWED_FILES = ['analytics/queue.ts'];

  it('never touches localStorage or sessionStorage (except the analytics opt-out read)', () => {
    for (const f of files.filter((x) => !STORAGE_ALLOWED.includes(x.path))) expect(f.text, f.path).not.toMatch(/localStorage|sessionStorage/);
    const c = read('analytics/client.ts');
    expect(c).not.toMatch(/sessionStorage|localStorage\.(setItem|removeItem|clear)/);
    expect(c.match(/localStorage/g)!.length).toBeGreaterThan(0);
    expect(c).toMatch(/umami\.disabled/);
  });

  it('allow-lists are exactly the two analytics paths', () => {
    expect(STORAGE_ALLOWED).toEqual(['analytics/client.ts']);
    expect(IDB_ALLOWED_FILES).toEqual(['analytics/queue.ts']);
  });

  it('uses document.cookie only in theme/themeCookie.ts, with the fixed name and values (REV-10)', () => {
    for (const f of files.filter((x) => x.path !== 'theme/themeCookie.ts')) expect(f.text, f.path).not.toMatch(/document\.cookie/);
    const t = read('theme/themeCookie.ts');
    expect(t.match(/document\.cookie/g)!.length).toBe(2);
    expect(t).toMatch(/THEME_COOKIE = 'wisc3-theme'/);
    expect(t).toMatch(/value === 'light' \|\| value === 'dark'/);
    expect(t).toMatch(/Path=\/; Max-Age=\$\{MAX_AGE_SECONDS\}; SameSite=Lax/);
    expect(t).not.toMatch(/domain=|HttpOnly/i);
    for (const f of files.filter((x) => x.path !== 'theme/themeCookie.ts')) expect(f.text, f.path).not.toMatch(/wisc3-theme/);
  });

  it('uses idb / indexedDB only under src/refdata/ (plus analytics/queue.ts)', () => {
    for (const f of files.filter((x) => !x.path.startsWith(IDB_ALLOWED_PREFIX) && !IDB_ALLOWED_FILES.includes(x.path))) {
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

describe('REV-8 UI guards', () => {
  it('has no http(s):// literal in web/src (the only external reference is the AdSense tag in index.html)', () => {
    for (const f of files) expect(f.text, f.path).not.toMatch(/https?:\/\//);
  });

  it('no className combines a display utility with an unprefixed hidden (static scan: hits=0)', () => {
    expect(scan(srcDir)).toEqual([]);
  });
});

// REV-8 step 53: static scan of every className in web/src/**/*.tsx. A hit is an element whose classes can combine
// a display utility with an unprefixed `hidden` (statically or through one branch of a conditional).
// Run: npx tsx scripts/ui-class-audit.ts   (prints hits=<n>, exit 1 when n > 0)
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Hit {
  file: string;
  line: number;
  classes: string;
}

const DISPLAY = /^(inline|inline-block|inline-flex|inline-grid|block|flex|grid|contents|flow-root|table(-[a-z-]+)?)$/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]));
}

const TERNARY = /\?\s*(['"`])([^'"`]*)\1\s*:\s*(['"`])([^'"`]*)\3/;

/** All class strings an attribute value can produce, choosing one branch per conditional. */
function variants(expr: string): string[] {
  const isTemplate = expr.startsWith('`');
  let parts: string[][] = [];
  if (isTemplate) {
    const body = expr.slice(1, -1);
    let last = 0;
    const re = /\$\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    parts = [];
    while ((m = re.exec(body))) {
      parts.push([body.slice(last, m.index)]);
      const t = TERNARY.exec(m[1]);
      parts.push(t ? [t[2], t[4]] : ['']);
      last = m.index + m[0].length;
    }
    parts.push([body.slice(last)]);
  } else {
    const t = TERNARY.exec(expr);
    if (t) parts = [[t[2], t[4]]];
    else {
      const lit = /^(['"])(.*)\1$/.exec(expr.trim());
      parts = [[lit ? lit[2] : '']];
    }
  }
  return parts.reduce<string[]>((acc, opts) => acc.flatMap((a) => opts.map((o) => `${a}${o}`)), ['']);
}

export function scan(srcDir: string): Hit[] {
  const hits: Hit[] = [];
  for (const f of walk(srcDir).filter((x) => x.endsWith('.tsx'))) {
    const text = readFileSync(f, 'utf8');
    const re = /className=(?:"([^"]*)"|\{(`[^`]*`|[^{}]*(?:\{[^}]*\}[^{}]*)*)\})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const expr = m[1] !== undefined ? `"${m[1]}"` : m[2].trim();
      for (const v of variants(expr)) {
        const tokens = v.split(/\s+/).filter(Boolean);
        if (tokens.includes('hidden') && tokens.some((t) => DISPLAY.test(t))) {
          hits.push({ file: relative(srcDir, f).split(sep).join('/'), line: text.slice(0, m.index).split('\n').length, classes: v.trim() });
          break;
        }
      }
    }
  }
  return hits;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../web/src');
  const hits = scan(srcDir);
  for (const h of hits) console.log(`${h.file}:${h.line}  ${h.classes}`);
  console.log(`hits=${hits.length}`);
  process.exit(hits.length ? 1 : 0);
}

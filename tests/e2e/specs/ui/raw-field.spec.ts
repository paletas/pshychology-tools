import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pt } from '../../../../web/src/i18n/pt';
import { ptNew } from '../../../../web/src/i18n/pt-new';
import { blockAds } from '../helpers/adblock';
import { fillCase, waitReady } from '../helpers/app';
import { midCase, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';
import { reportsDir } from '../helpers/paths';

// [REV-15] The raw-score inputs read as inputs: boxed with a border of at least 3:1 contrast, a dash placeholder,
// a "Resultados Brutos" column header and a focus ring; the scaled cell next to them stays unboxed.
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

interface Field {
  id: string; border: string[]; borderWidth: number; borderStyle: string; bg: string; around: string;
  placeholder: string | null; placeholderColor: string; height: number; width: number; left: number; right: number;
  empty: boolean; focused: boolean; outlineStyle: string; outlineWidth: number; outlineColor: string;
}
interface Read {
  fields: Field[]; scaled: { borderWidth: number; bgAlpha: number }[];
  head: { x: number; width: number } | null; scrollWidth: number;
}

function readField(page: Page): Promise<Read> {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const norm = (c: string) => { ctx.fillStyle = '#000000'; ctx.fillStyle = c; return ctx.fillStyle as string; };
    const alpha = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
    const fields = [...document.querySelectorAll<HTMLInputElement>('input[data-testid^="raw-"]')].map((el) => {
      const cs = getComputedStyle(el);
      let anc: Element | null = el.parentElement;
      while (anc && alpha(getComputedStyle(anc).backgroundColor) <= 0) anc = anc.parentElement;
      const box = el.getBoundingClientRect();
      const bgRaw = cs.backgroundColor;
      return {
        id: el.getAttribute('data-testid')!.slice(4),
        border: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(norm),
        borderWidth: parseFloat(cs.borderTopWidth), borderStyle: cs.borderTopStyle,
        bg: alpha(bgRaw) < 1 ? 'transparent' : norm(bgRaw),
        around: anc ? norm(getComputedStyle(anc).backgroundColor) : '#ffffff',
        placeholder: el.getAttribute('placeholder'),
        placeholderColor: norm(getComputedStyle(el, '::placeholder').color),
        height: box.height, width: box.width, left: box.left, right: box.right,
        empty: el.value === '', focused: document.activeElement === el,
        outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth), outlineColor: norm(cs.outlineColor),
      };
    });
    const scaled = [...document.querySelectorAll('[data-testid^="scaled-"]')].map((el) => {
      const cs = getComputedStyle(el);
      return { borderWidth: parseFloat(cs.borderTopWidth), bgAlpha: alpha(cs.backgroundColor) };
    });
    const h = document.querySelector('.tests-head .th-raw')?.getBoundingClientRect();
    return { fields, scaled, head: h ? { x: h.x + h.width / 2, width: h.width } : null, scrollWidth: document.documentElement.scrollWidth };
  });
}

async function open(browser: Browser, opts: Parameters<Browser['newContext']>[0]) {
  const context = await browser.newContext(opts);
  await blockAds(context);
  const page = await context.newPage();
  const log = collectErrors(page);
  await page.goto('wisc3');
  await waitReady(page);
  await fillCase(page, midCase(refData()).input);
  const optional = refData().tests.filter((t) => !t.mandatory).map((t) => t.id);
  for (const id of optional) await page.getByTestId(`raw-${id}`).fill('');
  await page.getByTestId(`raw-${optional[0]}`).focus();
  return { context, page, log };
}

function checkFields(r: Read, vw: number, w: number) {
  expect(r.fields).toHaveLength(13);
  for (const f of r.fields) {
    const why = `${f.id} @${w}`;
    expect(new Set(f.border).size, why).toBe(1);
    expect(f.borderStyle, why).toBe('solid');
    expect(f.borderWidth, why).toBeGreaterThanOrEqual(1);
    expect(contrast(f.border[0], f.around), `${why} border/around`).toBeGreaterThanOrEqual(3);
    expect(f.bg, why).not.toBe('transparent');
    if (!f.focused) expect(contrast(f.border[0], f.bg), `${why} border/bg`).toBeGreaterThanOrEqual(3);
    expect(f.placeholder, why).toBe('–');
    if (f.empty) expect(contrast(f.placeholderColor, f.bg), `${why} placeholder`).toBeGreaterThanOrEqual(3);
    expect(f.left, why).toBeGreaterThanOrEqual(0);
    expect(f.right, why).toBeLessThanOrEqual(vw);
    if (w < 1440) { expect(f.height, why).toBeGreaterThanOrEqual(44); expect(f.width, why).toBeGreaterThanOrEqual(44); }
    else expect(f.height, why).toBeGreaterThanOrEqual(24);
    if (f.focused) {
      expect(f.outlineStyle, why).toBe('solid');
      expect(f.outlineWidth, why).toBeGreaterThanOrEqual(2);
      expect(contrast(f.outlineColor, f.around), `${why} outline`).toBeGreaterThanOrEqual(3);
    }
  }
  expect(r.fields.filter((f) => f.focused)).toHaveLength(1);
}

const COMBOS = [
  { w: 390, h: 844, extra: { hasTouch: true, isMobile: true } },
  { w: 820, h: 1180, extra: { hasTouch: true } },
  { w: 1440, h: 900, extra: {} },
] as const;
const SHOTS = new Set(['390-light', '820-dark', '1440-light']);

for (const c of COMBOS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`[REV-15] raw fields read as inputs at ${c.w} ${scheme}`, async ({ browser }) => {
      const { context, page, log } = await open(browser, { viewport: { width: c.w, height: c.h }, colorScheme: scheme, ...c.extra });
      const r = await readField(page);
      checkFields(r, c.w, c.w);
      expect(r.scaled).toHaveLength(13);
      for (const s of r.scaled) { expect(s.borderWidth).toBe(0); expect(s.bgAlpha).toBe(0); }
      const head = page.getByTestId('tests-head');
      await expect(head).toBeVisible();
      await expect(head).toHaveText(pt['TestsRawResults']);
      expect(r.head!.x).toBeGreaterThan(r.fields[0].left);
      expect(r.head!.x).toBeLessThan(r.fields[0].right);
      for (const f of r.fields) {
        await expect(page.getByTestId(`raw-${f.id}`)).toHaveAccessibleName(ptNew['raw.aria'].replace('{0}', pt[`Test.${f.id}`]));
      }
      expect(r.scrollWidth).toBeLessThanOrEqual(c.w);
      if (SHOTS.has(`${c.w}-${scheme}`)) {
        mkdirSync(join(reportsDir, 'screens/rawfield'), { recursive: true });
        await page.locator('.sheet').first().screenshot({ path: join(reportsDir, `screens/rawfield/sheet-${c.w}-${scheme}.png`) });
      }
      expect(log.errors).toEqual([]);
      await context.close();
    });
  }
}

test('[REV-15] raw fields keep the contrast after the theme toggle', async ({ browser }) => {
  const { context, page, log } = await open(browser, { viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  for (let i = 0; i < 2 && (await page.locator('html[data-theme="dark"]').count()) === 0; i++) await page.click('[data-testid="theme-toggle"]');
  await expect(page.locator('html[data-theme="dark"]')).toHaveCount(1);
  await page.getByTestId(`raw-${refData().tests.find((t) => !t.mandatory)!.id}`).focus();
  checkFields(await readField(page), 1440, 1440);
  expect(log.errors).toEqual([]);
  await context.close();
});

test('[REV-15] negative control: the old line colour fails 3:1, the new one passes', () => {
  expect(contrast('#D5DCD6', '#FFFFFF')).toBeLessThan(3);
  expect(contrast('#2C3C3F', '#172528')).toBeLessThan(3);
  expect(contrast('#6F8083', '#FFFFFF')).toBeGreaterThanOrEqual(3);
  expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
});

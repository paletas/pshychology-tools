import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { blockAds } from '../helpers/adblock';
import { fillCase, waitReady } from '../helpers/app';
import { midCase, refData } from '../helpers/cases';
import { collectErrors } from '../helpers/console';
import { reportsDir } from '../helpers/paths';

// V22. The redesigned page at 7 widths (320, 375, 390 phones; 768, 820 tablets; 1100, 1440 laptops/desktop), light and dark:
// no horizontal overflow, the layout switches where the CSS says it does, 44 px touch targets (24 px only for links inside running
// text, WCAG 2.5.8), sticky behaviour (glance strip below 1100 px, results column from 1100 px), chart text >= 11 px as rendered,
// no clipped or off-screen text, axe (WCAG 2.2 A/AA incl. colour contrast), keyboard focus (visible, in order, not hidden under the
// sticky strip), screenshots; plus the print stylesheet (A4 and Letter paper, light and dark theme).
const WIDTHS = [
  { w: 320, h: 640 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 820, h: 1180 },
  { w: 1100, h: 800 },
  { w: 1440, h: 900 },
];
const SCHEMES = ['light', 'dark'] as const;
const MIN_TEXT = 11;

/** Interactive controls: 44 px both ways, except links inside running text (24 px). */
async function targetViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], summary';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest('svg') || el.closest('[hidden]') || el.closest('dialog:not([open])')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0) continue;
      const inline = el.tagName === 'A' && cs.display === 'inline' && !!el.closest('p, li, .foot');
      const min = inline ? 24 : 44;
      if (r.height < min - 0.5 || r.width < min - 0.5) out.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.className ?? el.id}] ${r.width.toFixed(1)}x${r.height.toFixed(1)} < ${min}`);
    }
    return out;
  });
}

/** Rendered chart text sizes (font-size x the svg scale) and text boxes that leave the viewport or their figure. */
async function chartText(page: Page, w: number): Promise<{ small: string[]; outside: string[]; count: number }> {
  return page.evaluate((vw) => {
    const small: string[] = [];
    const outside: string[] = [];
    let count = 0;
    for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-testid^="chart-"]')) {
      const fig = (svg.closest('figure') ?? svg).getBoundingClientRect();
      for (const t of svg.querySelectorAll<SVGTextElement>('text')) {
        if (!t.textContent?.trim()) continue;
        count++;
        const m = t.getScreenCTM(); const scale = m ? Math.hypot(m.a, m.b) : 1; // hypot: rotated labels
        const px = parseFloat(getComputedStyle(t).fontSize) * scale;
        const id = `${svg.getAttribute('data-testid')} "${t.textContent!.trim().slice(0, 18)}"`;
        if (px < 11 - 0.05) small.push(`${id} ${px.toFixed(2)}px`);
        const b = t.getBoundingClientRect();
        if (b.left < -0.5 || b.right > vw + 0.5 || b.left < fig.left - 0.5 || b.right > fig.right + 0.5) outside.push(`${id} [${b.left.toFixed(0)}, ${b.right.toFixed(0)}] fig [${fig.left.toFixed(0)}, ${fig.right.toFixed(0)}]`);
      }
    }
    return { small, outside, count };
  }, w);
}

/** Elements that clip their own content (overflow hidden/clip) and elements that run past the viewport. */
async function clipped(page: Page, w: number): Promise<string[]> {
  return page.evaluate((vw) => {
    const out: string[] = [];
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('dialog:not([open])')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const name = `${el.tagName.toLowerCase()}.${el.className && typeof el.className === 'string' ? el.className : ''}${el.getAttribute('data-testid') ? '[' + el.getAttribute('data-testid') + ']' : ''}`;
      if (['hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) out.push(`${name} clips x ${el.scrollWidth}>${el.clientWidth}`);
      if (['hidden', 'clip'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) out.push(`${name} clips y ${el.scrollHeight}>${el.clientHeight}`);
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`${name} ellipsis`);
      // a box wider than the viewport that is not inside a horizontal scroller
      if ((r.right > vw + 1 || r.left < -1) && !el.closest('.lk-chips, .lk-wide, .lk-narrow') && !el.closest('.sr-only') && !el.matches('.sr-only')) out.push(`${name} outside viewport [${r.left.toFixed(0)}, ${r.right.toFixed(0)}]`);
    }
    return out;
  }, w);
}

async function axeViolations(page: Page): Promise<string[]> {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '').slice(0, 90)).join(' | ')}`);
}

/** Tab through the page: every stop shows a focus indicator and is not covered; the dates and 13 raw inputs come in order. */
async function keyboardWalk(page: Page): Promise<{ problems: string[]; order: string[] }> {
  await page.evaluate(() => window.scrollTo(0, 0));
  // put the sequential-focus starting point at the very top of the document (blur() alone keeps the last position)
  await page.evaluate(() => {
    const s = document.createElement('span');
    s.tabIndex = -1;
    document.body.prepend(s);
    s.focus();
    s.remove();
  });
  const problems: string[] = [];
  const order: string[] = [];
  for (let i = 0; i < 250; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | SVGElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const isSvg = el instanceof SVGElement;
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
      const stroke = isSvg && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) >= 2;
      // the point to hit-test: the centre of the box clipped to the viewport
      const x = Math.min(Math.max((Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max((Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2, 0), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      const covered = !!top && !(el === top || el.contains(top) || top.contains(el)) && !(top.getRootNode() !== document);
      const visible = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      return {
        id: el.getAttribute('data-testid') ?? el.id ?? el.tagName.toLowerCase(),
        tag: el.tagName.toLowerCase(), outline, ol: `${cs.outlineStyle} ${cs.outlineWidth}`, stroke, covered, visible,
        coveredBy: covered && top ? `${top.tagName.toLowerCase()}.${(top as HTMLElement).className}` : '',
        dateInner: el instanceof HTMLInputElement && el.type === 'date' && !el.matches(':focus-visible'),
      };
    });
    if (!info) break; // focus left the document: one full cycle
    order.push(info.id);
    // a date input's 4th stop is Chrome's own calendar button inside the control (the host is then not :focus-visible; the browser draws that ring)
    if (!info.outline && !info.stroke && !(info.dateInner)) problems.push(`${info.id}: no focus indicator (outline ${info.ol})`);
    if (!info.visible) problems.push(`${info.id}: not in the viewport`);
    if (info.covered) problems.push(`${info.id}: covered by ${info.coveredBy}`);
  }
  return { problems, order };
}

for (const { w, h } of WIDTHS) {
  for (const scheme of SCHEMES) {
    test(`responsive at ${w} px, ${scheme}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, hasTouch: w < 1100 });
      await blockAds(context);
      const page = await context.newPage();
      const log = collectErrors(page);
      await page.goto('/wisc3');
      await waitReady(page);
      await fillCase(page, midCase(refData()).input);
      await expect(page.locator('[data-testid^="index-row-"]')).toHaveCount(6);
      await expect(page.locator('svg[data-testid^="chart-"]')).toHaveCount(3);
      await expect(page.locator('html')).toHaveCSS('color-scheme', /./); // page styled
      await page.evaluate(() => document.fonts.ready);

      // (1) no horizontal overflow
      expect(await page.evaluate(() => document.documentElement.scrollWidth), 'horizontal overflow').toBeLessThanOrEqual(w);
      expect(await page.evaluate(() => document.body.scrollWidth), 'body overflow').toBeLessThanOrEqual(w);

      // (2) layout switches: menu button <= 640, glance strip < 1100
      const menuBtn = page.locator('button.menu');
      if (w <= 640) {
        await expect(menuBtn).toBeVisible();
        await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
      } else await expect(menuBtn).toBeHidden();
      const strip = page.locator('#glance');
      if (w < 1100) await expect(strip).toBeVisible();
      else await expect(strip).toBeHidden();

      // (3) the 13 raw inputs: inside the viewport, 44 px tall (the touch target of the plan)
      const boxes = await page.locator('input[data-testid^="raw-"]').evaluateAll((els) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; }),
      );
      expect(boxes).toHaveLength(13);
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(w);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      // ... and every other control (with the 24 px exception for links inside running text)
      expect(await targetViolations(page), 'touch targets').toEqual([]);

      // (4) text in the charts is >= 11 px as rendered, and no text is clipped or off-screen
      const ct = await chartText(page, w);
      expect(ct.count, 'chart texts found').toBeGreaterThan(10);
      expect(ct.small, `chart text < ${MIN_TEXT}px`).toEqual([]);
      expect(ct.outside, 'chart text outside its figure or the viewport').toEqual([]);
      expect(await clipped(page, w), 'clipped or off-screen elements').toEqual([]);

      // (5) sticky behaviour after scrolling down the sheet
      // scroll to a point where the sticky element has room to travel (past the top of the grid row, inside its range)
      await page.evaluate(() => window.scrollTo(0, 0));
      const room = await page.evaluate(() => {
        const r = document.querySelector('.results')!.getBoundingClientRect();
        return { abs: r.top + scrollY, gap: document.querySelector('.sheet')!.getBoundingClientRect().height - r.height };
      });
      await page.evaluate((y) => window.scrollTo(0, y), w < 1100 ? 700 : Math.round(room.abs + Math.max(0, Math.min(150, room.gap / 2))));
      await page.waitForTimeout(100);
      if (w < 1100) {
        const top = await strip.evaluate((e) => e.getBoundingClientRect().top);
        expect(top, 'glance strip sticks to the top').toBeGreaterThanOrEqual(-0.5);
        expect(top).toBeLessThanOrEqual(1);
        await expect(page.locator('[data-testid^="glance-"]')).toHaveCount(3);
      } else {
        // position: sticky from 1100 px. It can only stick while the sheet column is taller than the results column (otherwise there is
        // nothing to travel along): then its top must sit at 1rem; when it does not fit, it must at least still be in the grid row.
        expect(await page.locator('.results').evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
        const m = await page.evaluate(() => {
          const r = document.querySelector('.results')!.getBoundingClientRect();
          return { top: r.top, height: r.height, sheet: document.querySelector('.sheet')!.getBoundingClientRect().height };
        });
        if (m.sheet > m.height + 40) {
          expect(m.top, 'results column sticks (top 1rem)').toBeGreaterThanOrEqual(0);
          expect(m.top).toBeLessThanOrEqual(17);
        }
      }
      await page.evaluate(() => window.scrollTo(0, 0));

      // (6) axe, WCAG 2.2 A/AA including colour contrast, in this scheme (and with the phone menu open)
      expect(await axeViolations(page), 'axe').toEqual([]);
      if (w <= 640) {
        await menuBtn.click();
        await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
        expect(await axeViolations(page), 'axe, menu open').toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), 'overflow, menu open').toBeLessThanOrEqual(w);
        await menuBtn.click();
      }

      // (7) keyboard focus: visible indicator, not covered, dates then the 13 raw inputs in order
      const walk = await keyboardWalk(page);
      expect(walk.problems, 'keyboard focus').toEqual([]);
      const tabbed = walk.order.filter((id) => /^raw-/.test(id));
      expect(tabbed).toHaveLength(13);
      // DOM order: birth date, test date, then the 13 raw inputs
      expect(walk.order.indexOf('subjectBirthday'), 'birth date is a stop').toBeGreaterThanOrEqual(0);
      expect(walk.order.indexOf('testDate')).toBeGreaterThan(walk.order.indexOf('subjectBirthday'));
      expect(walk.order.indexOf(tabbed[0])).toBeGreaterThan(walk.order.indexOf('testDate'));

      // (8) screenshots for the review
      mkdirSync(join(reportsDir, 'screens/responsive'), { recursive: true });
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.screenshot({ path: join(reportsDir, `screens/responsive/${w}-${scheme}.png`), fullPage: true });

      expect(log.errors).toEqual([]);
      await context.close();
    });
  }
}

// Print: paper is a fixed width, whatever the screen. Ink on white in both themes, chrome hidden, no overflow, the tooltip layer off.
const PAPER = [
  { name: 'A4', w: 794, h: 1123 },
  { name: 'Letter', w: 816, h: 1056 },
];
for (const { name, w, h } of PAPER) {
  for (const scheme of SCHEMES) {
    test(`print stylesheet on ${name} paper, ${scheme} theme`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
      await blockAds(context);
      const page = await context.newPage();
      const log = collectErrors(page);
      await page.goto('/wisc3');
      await waitReady(page);
      await fillCase(page, midCase(refData()).input);
      await expect(page.locator('svg[data-testid^="chart-"]')).toHaveCount(3);
      await page.emulateMedia({ media: 'print', colorScheme: scheme });
      await page.waitForTimeout(500); // let the screen colour transition (.scaled, .iq) finish

      for (const sel of ['.topbar', '#glance', '.actions', '.seg']) await expect(page.locator(sel).first(), sel).toBeHidden();
      await expect(page.locator('.chart-tip')).toHaveCount(0); // none rendered (and hidden by the print rule if one were)
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      expect(await page.locator('.results').evaluate((e) => getComputedStyle(e).position), 'results not sticky').toBe('static');
      expect(await page.evaluate(() => document.documentElement.scrollWidth), 'print overflow').toBeLessThanOrEqual(w);

      // printed text is dark enough on the white paper (the dark theme must not print light-on-white)
      const bad = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        const rgb = (c: string) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; const v = ctx.fillStyle as string; return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
        const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const out: string[] = [];
        const targets = document.querySelectorAll<HTMLElement>('h1, h2, .lede, .notice, .t-name b, .tests input, .scaled, .ix-top b, .iq, .sums b, .legend, .foot, svg text');
        for (const el of targets) {
          if (getComputedStyle(el).display === 'none') continue;
          const cs = getComputedStyle(el);
          const fg = el instanceof SVGElement ? cs.fill : cs.color;
          if (fg === 'none') continue;
          const L = lum(rgb(fg));
          const ratio = 1.05 / (L + 0.05);
          if (ratio < 3) out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className} ${fg} on white ${ratio.toFixed(2)}`);
        }
        return out;
      });
      expect(bad, 'print contrast on white').toEqual([]);

      mkdirSync(join(reportsDir, 'screens/responsive'), { recursive: true });
      await page.screenshot({ path: join(reportsDir, `screens/responsive/print-${name}-${scheme}.png`), fullPage: true });
      expect(log.errors).toEqual([]);
      await context.close();
    });
  }
}

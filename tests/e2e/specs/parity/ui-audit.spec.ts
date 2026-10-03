import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blockAds } from '../helpers/adblock';
import { waitReady } from '../helpers/app';
import { resetTmp } from '../helpers/tmp';
import { reportsDir } from '../helpers/paths';

// REV-8 step 53: computed display of every element whose class list contains `hidden` (plain, md:hidden, hidden md:*),
// before any input, at 375, 768 and 1280 px.
const WIDTHS = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1280, h: 900 },
];

interface Rec {
  el: string;
  width: number;
  display: string;
  expected: 'none' | 'not none';
  ok: boolean;
}

test('hidden utilities resolve to the expected display at every width', async ({ browser }) => {
  resetTmp();
  const rows: Rec[] = [];
  for (const { w, h } of WIDTHS) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await blockAds(context);
    const page = await context.newPage();
    await page.goto('/wisc3');
    await waitReady(page);
    const found = await page.evaluate((width) => {
      const out: { el: string; display: string; expected: 'none' | 'not none' }[] = [];
      for (const el of Array.from(document.querySelectorAll('[class]'))) {
        const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
        const plain = cls.includes('hidden');
        const mdHidden = cls.includes('md:hidden');
        const mdShow = cls.some((c) => /^md:(block|flex|inline|inline-block|inline-flex|grid)$/.test(c));
        if (!plain && !mdHidden) continue;
        let expected: 'none' | 'not none' | null = null;
        if (plain && mdShow) expected = width >= 768 ? 'not none' : 'none';
        else if (plain) expected = 'none';
        else if (mdHidden && width >= 768) expected = 'none';
        if (expected === null) continue; // md:hidden below 768 px: visible, not asserted
        const name = el.getAttribute('data-testid') ?? (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${cls.join('.')}`);
        out.push({ el: name, display: getComputedStyle(el).display, expected });
      }
      return out;
    }, w);
    for (const f of found) rows.push({ ...f, width: w, ok: f.expected === 'none' ? f.display === 'none' : f.display !== 'none' });
    await context.close();
  }

  const lines = [
    '# UI display audit (REV-8 step 53)',
    '',
    'Before any input. Elements with `hidden`, `md:hidden` (checked at >= 768 px) or `hidden md:*` (none below 768 px, shown from 768 px).',
    '',
    '| element | width | computed display | expected | ok |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.el.replace(/\|/g, '/')} | ${r.width} | ${r.display} | ${r.expected} | ${r.ok} |`),
  ];
  writeFileSync(resolve(reportsDir, 'ui-audit.md'), lines.join('\n') + '\n');

  expect(rows.length).toBeGreaterThan(30);
  expect(rows.filter((r) => !r.ok)).toEqual([]);
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockAds, isAdUrl } from '../helpers/adblock';
import { collectErrors } from '../helpers/console';
import { reportsDir } from '../helpers/paths';
import { NEW_URL } from '../helpers/read-new';
import { OLD_URL } from '../helpers/read-old';

// REV-8 V21: initial-state parity, old vs new, real browser, before any input.
const screensDir = join(reportsDir, 'screens/initial');
mkdirSync(screensDir, { recursive: true });

interface State {
  nav: boolean;
  burger: number;
  warningIcons: number;
  alert: string | null;
  labels: string[];
  footer: string;
  title: string;
  navLinks: string[];
}
type NewState = State & { nonLocalhost: string[]; consoleErrors: string[] };

/** In-page probe; `visible` = checkVisibility and a non-empty box. */
function probe(page: Page): Promise<State> {
  return page.evaluate(() => {
    const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (el as HTMLElement).checkVisibility({ visibilityProperty: true }) && r.width > 0 && r.height > 0;
    };
    const navs = Array.from(document.querySelectorAll('nav')).filter(visible);
    const links = navs.flatMap((n) => Array.from(n.querySelectorAll('a')).filter(visible));
    const alert = Array.from(document.querySelectorAll('[role=alert]')).find(visible);
    const labels = new Set<string>();
    for (const el of Array.from(document.querySelectorAll('h1, label, th, [role=alert] b'))) {
      if (el.closest('#LookupTableVisualizer') || !visible(el)) continue;
      const t = norm(el.textContent);
      if (t) labels.add(t);
    }
    return {
      nav: navs.length > 0 && links.some((a) => norm(a.textContent) === 'WISC-III'),
      burger: Array.from(document.querySelectorAll('.navbar-burger')).filter(visible).length,
      warningIcons: Array.from(document.querySelectorAll('table svg.text-red-900')).filter(visible).length,
      alert: alert ? norm(alert.textContent) : null,
      labels: Array.from(labels).sort(),
      footer: norm(document.querySelector('footer')?.textContent),
      title: document.title,
      navLinks: links.map((a) => norm(a.textContent)),
    };
  });
}

async function readOld(page: Page): Promise<State> {
  await page.goto(OLD_URL);
  await page.locator('#testDate').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForFunction(() => !!(window as any).Blazor, undefined, { timeout: 60_000 });
  await page.waitForTimeout(2000);
  return probe(page);
}

async function readNew(page: Page): Promise<NewState> {
  const hosts: string[] = [];
  page.on('request', (r) => {
    try {
      const u = new URL(r.url());
      // the AdSense tag in index.html is the one allowed external reference (its hosts are resolver-blocked)
      if (u.protocol.startsWith('http') && u.hostname !== 'localhost' && !isAdUrl(r.url())) hosts.push(r.url());
    } catch {
      /* not a URL */
    }
  });
  const log = collectErrors(page);
  await page.goto(NEW_URL);
  await expect(page.getByTestId('app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await page.waitForTimeout(500);
  return { ...(await probe(page)), nonLocalhost: hosts, consoleErrors: [...log.errors] };
}

function writeReport(): void {
  const widths = [1280, 768].filter((w) => existsSync(join(reportsDir, `initial-parity-${w}.json`)));
  const data = widths.map((w) => ({ w, ...JSON.parse(readFileSync(join(reportsDir, `initial-parity-${w}.json`), 'utf8')) }));
  const md: string[] = ['# Initial-state parity, old vs new (V21)', '', 'Real browser (chromium), before any input; ad hosts blocked.', ''];
  for (const d of data) {
    const o = d.old as State;
    const n = d.new as NewState;
    md.push(`## ${d.w} px`, '', '| Check | Old | New |', '|---|---|---|');
    md.push(`| nav visible with a WISC-III link | ${o.nav} | ${n.nav} |`);
    md.push(`| visible burger buttons | ${o.burger} | ${n.burger} |`);
    md.push(`| visible warning icons in the subtest table | ${o.warningIcons} | ${n.warningIcons} |`);
    md.push(`| alert text | ${o.alert} | ${n.alert} |`);
    md.push(`| alert text equal | ${o.alert === n.alert} | |`);
    md.push(`| headings and labels set (outside the visualizer) | ${o.labels.join('; ')} | ${n.labels.join('; ')} |`);
    md.push(`| headings and labels set equal | ${JSON.stringify(o.labels) === JSON.stringify(n.labels)} | |`);
    md.push(`| non-localhost requests | not asserted | ${n.nonLocalhost.length} |`);
    md.push(`| console errors | not asserted | ${n.consoleErrors.length} |`);
    md.push(`| footer text (not asserted) | ${o.footer} | ${n.footer} |`);
    md.push(`| document title (not asserted) | ${o.title} | ${n.title} |`, '');
  }
  md.push('Screenshots: `reports/screens/initial/{old,new}-{1280,768}.png`.', '');
  md.push('## Differences not fixed', '');
  const diffs = [
    'Logo appearance: the old app loads the Tailwind UI "workflow-mark" SVG from tailwindui.com; the new app draws a local indigo-500 (#6366f1) mark inline, because it must make no external request.',
    'Burger: the old burger (visible below 768 px) does nothing, because site.js is never loaded; the new burger toggles the mobile menu #main-nav. Neither is visible at the widths compared here.',
    'Culture selector: the new footer copy is static (Idioma: + one option Português); in the old app it is a live select, but pt-PT is its only culture, so choosing it changes nothing.',
    'Logo in the old screenshots: the old image does not load in this environment (alt text "Workflow" is shown; it is an external tailwindui.com request); the new mark is inline and always renders.',
    'Styling of form controls (seen at 1280 px; the 768 px pages use the same classes): the old date and age inputs are white boxed fields about 40 px high, the new ones are borderless underlined fields; the old subtest rows are about 44 px high, the new about 22 px; the old CI select and the Ver Tabela / Começar Novo buttons look lighter. Cause: the old compiled stylesheet and the new Tailwind 4 build resolve the same utility classes against different base styles; not asserted and no functional effect.',
    'Old h1 box: in the old app the WISC-III heading has a visible black outline box (old base style); the new heading has none.',
    'Alert and panel tint: the alert background is a slightly stronger yellow and the panels sit about 8 px further in at the sides in the new app (Tailwind 4 colour rendering and the px-2 wrapper); the wording is identical.',
  ];
  for (const d of data) {
    const o = d.old as State;
    const n = d.new as State;
    if (o.footer !== n.footer) diffs.push(`Footer text at ${d.w} px: the new footer also carries the line "Dados: <data version>" (reference-data version, used by the update flow); old footer: "${o.footer}".`);
    if (o.title !== n.title) diffs.push(`Document title at ${d.w} px: old "${o.title}", new "${n.title}".`);
  }
  md.push(...[...new Set(diffs)].map((x) => `- ${x}`), '');
  writeFileSync(join(reportsDir, 'initial-parity.md'), md.join('\n'));
}

for (const width of [1280, 768]) {
  test(`initial state parity at ${width}`, async ({ browser, viewport }, info) => {
    test.skip(info.project.name !== `parity-${width}`, 'width belongs to another project');
    const height = viewport?.height ?? 900;
    const mk = async () => {
      const ctx = await browser.newContext({ viewport: { width, height }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
      await blockAds(ctx);
      return ctx;
    };
    const oc = await mk();
    const op = await oc.newPage();
    const o = await readOld(op);
    await op.screenshot({ path: join(screensDir, `old-${width}.png`), fullPage: true });
    const nc = await mk();
    const np = await nc.newPage();
    const n = await readNew(np);
    await np.screenshot({ path: join(screensDir, `new-${width}.png`), fullPage: true });
    writeFileSync(join(reportsDir, `initial-parity-${width}.json`), JSON.stringify({ old: o, new: n }, null, 1));
    writeReport();
    await oc.close();
    await nc.close();

    expect(o.nav && n.nav, 'nav with WISC-III link').toBe(true);
    expect([o.burger, n.burger], 'visible burgers').toEqual([0, 0]);
    expect([o.warningIcons, n.warningIcons], 'visible warning icons').toEqual([0, 0]);
    expect(n.alert, 'alert text').toBe(o.alert);
    expect(n.labels, 'headings and labels').toEqual(o.labels);
    expect(n.nonLocalhost, 'new-app non-localhost requests').toEqual([]);
    expect(n.consoleErrors, 'new-app console errors').toEqual([]);
  });
}

test('new app at 375 px: burger shows the menu link, no warning icon', async ({ browser }, info) => {
  test.skip(info.project.name !== 'parity-1280', 'runs once');
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  await blockAds(ctx);
  const page = await ctx.newPage();
  await page.goto(NEW_URL);
  await expect(page.getByTestId('app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  const link = page.locator('#main-nav a', { hasText: 'WISC-III' });
  await expect(page.locator('.navbar-burger')).toBeVisible();
  await expect(link).toBeHidden();
  await page.locator('.navbar-burger').click();
  await expect(link).toBeVisible();
  expect((await probe(page)).warningIcons).toBe(0);
  await ctx.close();
});

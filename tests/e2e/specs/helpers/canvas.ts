import type { Locator, Page } from '@playwright/test';

export type NewChart = 'chart-qi' | 'chart-standard' | 'chart-factorial';
export const NEW_CHARTS: readonly NewChart[] = ['chart-qi', 'chart-standard', 'chart-factorial'];

/** Old app chart instances on the wisc3.js module object. */
export const OLD_CHART_INSTANCES = [
  '__qiResultsChartInstance',
  '__standardResulsChartInstance',
  '__standardFactorialIndicesChartInstance',
] as const;

function inkRatio(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) ink++;
  return ink / (canvas.width * canvas.height);
}

/** New app (SVG charts): the figure's data-marks count, 0 when the figure is absent. */
export async function svgMarks(locator: Locator): Promise<number> {
  if ((await locator.count()) === 0) return 0;
  return Number((await locator.getAttribute('data-marks')) ?? 0);
}

/** New app: true when the figure has an SVG with marks (data-marks > 0) and drawn children. */
export function svgHasInk(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => el.tagName.toLowerCase() === 'svg' && Number(el.getAttribute('data-marks')) > 0 && el.querySelectorAll('path, line, circle, rect').length > 0);
}

/** Same for an old-app chart, via the wisc3 module's chart instance. */
export function oldCanvasInkRatio(page: Page, instance: (typeof OLD_CHART_INSTANCES)[number]): Promise<number> {
  return page.evaluate(
    ([name, fn]) => {
      const canvas = (window as any).wisc3?.[name]?.canvas as HTMLCanvasElement | undefined;
      if (!canvas) return 0;
      return (new Function(`return (${fn})`)() as (c: HTMLCanvasElement) => number)(canvas);
    },
    [instance, inkRatio.toString()] as const,
  );
}

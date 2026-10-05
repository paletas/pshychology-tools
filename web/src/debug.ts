import type { ChartsDerived } from './charts/derived';
import type { ChartPayloads } from './engine/charts';
import type { Snapshot } from './engine/types';

export interface DebugState {
  snapshot: Snapshot | null;
  charts: ChartPayloads | null;
  /** display-only values (factor group means); not part of the chart payloads */
  chartsDerived: ChartsDerived | null;
  dataVersion: string | null;
  dataSha: string | null;
}

declare global {
  interface Window {
    __wisc3Debug: { snapshot(): DebugState; chartAxis(testId: string): { min: number; max: number } | null };
  }
}

// Memory only: the latest state published by the app, read back through window.__wisc3Debug.snapshot().
let latest: DebugState = { snapshot: null, charts: null, chartsDerived: null, dataVersion: null, dataSha: null };

export function publishDebug(state: DebugState): void {
  latest = state;
}

export function installDebug(): void {
  window.__wisc3Debug = {
    snapshot: () => latest,
    // y-axis range of a rendered chart, read from the SVG's data attributes (read-only, for the parity checks)
    chartAxis: (testId) => {
      const svg = document.querySelector<SVGSVGElement>(`svg[data-testid="${testId}"]`);
      const min = Number(svg?.getAttribute('data-y-min'));
      const max = Number(svg?.getAttribute('data-y-max'));
      return svg && Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
    },
  };
}

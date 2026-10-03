import { Chart } from 'chart.js';
import type { ChartPayloads } from './engine/charts';
import type { Snapshot } from './engine/types';

export interface DebugState {
  snapshot: Snapshot | null;
  charts: ChartPayloads | null;
  dataVersion: string | null;
  dataSha: string | null;
}

declare global {
  interface Window {
    __wisc3Debug: { snapshot(): DebugState; chartAxis(testId: string): { min: number; max: number } | null };
  }
}

// Memory only: the latest state published by the app, read back through window.__wisc3Debug.snapshot().
let latest: DebugState = { snapshot: null, charts: null, dataVersion: null, dataSha: null };

export function publishDebug(state: DebugState): void {
  latest = state;
}

export function installDebug(): void {
  window.__wisc3Debug = {
    snapshot: () => latest,
    // y-axis range of a rendered chart (read-only, for the parity checks)
    chartAxis: (testId) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-testid="${testId}"]`);
      const y = canvas ? Chart.getChart(canvas)?.scales.y : undefined;
      return y ? { min: y.min, max: y.max } : null;
    },
  };
}

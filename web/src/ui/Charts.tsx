import { useEffect, useRef } from 'react';
import { BoxAndWiskers, BoxPlotController } from '@sgratzl/chartjs-chart-boxplot';
import { Chart, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import datalabels from 'chartjs-plugin-datalabels';
import type { ChartPayloads } from '../engine/charts';

Chart.register(...registerables, BoxPlotController, BoxAndWiskers, annotationPlugin, datalabels);

// Options ported from WA/wwwroot/wisc3.js (Chart.js 2 -> 4).
const originLine = (value: number, len: number) => Array<number>(len).fill(value);

const datalabelsOptions = {
  backgroundColor: (context: any) => context.dataset.backgroundColor,
  borderRadius: 4,
  color: 'white',
  font: { weight: 'bold' },
};

const grid = { drawTicks: true, drawBorder: true, drawOnChartArea: false, offset: true };

const originDataset = (len: number) => ({
  label: 'Origin',
  data: originLine(10, len),
  fill: false,
  pointBackgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  borderColor: 'rgba(0, 0, 0, 0)',
  hoverBackgroundColor: 'rgba(0, 0, 0, 0)',
  hoverBorderColor: 'rgba(0, 0, 0, 0)',
  datalabels: { display: false },
});

const lineDataset = (label: string, data: (number | null)[], color: string, fill: number) => ({
  label,
  data,
  xAxisID: 'testAxis',
  borderColor: `rgba(${color}, 1)`,
  backgroundColor: `rgba(${color}, 0.3)`,
  pointBorderColor: 'black',
  pointBackgroundColor: 'black',
  fill,
});

function lineOptions(yPosition: 'left' | 'right') {
  return {
    maintainAspectRatio: true,
    responsive: true,
    scales: {
      testAxis: { type: 'category', position: 'top', grid, ticks: { padding: 5 } },
      y: { position: yPosition, grid, min: 1, max: 19, ticks: { stepSize: 1, padding: 5 } },
    },
    layout: { padding: { top: 60 } },
    plugins: {
      tooltip: { filter: (tooltip: any) => tooltip.datasetIndex !== 0 },
      annotation: {
        drawTime: 'afterDraw',
        annotations: {
          origin: {
            type: 'box',
            xScaleID: 'testAxis',
            yScaleID: 'y',
            yMin: 9.5,
            yMax: 10.5,
            borderColor: 'rgba(0, 0, 0, 0.1)',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
          },
        },
      },
      datalabels: datalabelsOptions,
    },
  };
}

function standardResultsConfig(p: ChartPayloads['standardResults']): any {
  return {
    type: 'line',
    data: {
      labels: p.Labels,
      datasets: [
        originDataset(p.Labels.length),
        lineDataset('Verbal', p.Verbal, '0, 0, 255', 0),
        lineDataset('Realização', p.Realization, '65, 105, 225', 0),
      ],
    },
    options: lineOptions('left'),
  };
}

function factorialConfig(p: ChartPayloads['factorial']): any {
  return {
    type: 'line',
    data: {
      labels: p.Labels,
      datasets: [
        originDataset(p.Labels.length),
        lineDataset('Compreensão Verbal', p.VerbalComprehension, '0, 100, 0', 0),
        lineDataset('Organização Perceptiva', p.PerceptiveOrganization, '0, 128, 0', 0),
        lineDataset('Velocidade Processamento', p.ProcessingVelocity, '107, 142, 35', 0),
      ],
    },
    options: lineOptions('right'),
  };
}

export function qiConfig(p: ChartPayloads['qi']): any {
  // an unavailable index has all-null values: leave its slot empty
  const slot = (e: ChartPayloads['qi']['QI'][number]) => (e.median === null ? null : { ...e });
  const box = (backgroundColor: string, borderColor: string, label: string, data: unknown[]) => ({
    label,
    backgroundColor,
    borderColor,
    borderWidth: 1,
    outlierColor: '#999999',
    padding: 10,
    itemRadius: 2,
    itemStyle: 'circle',
    itemBackgroundColor: '#000',
    data,
    datalabels: { anchor: 'end', align: 'top' },
  });
  return {
    type: 'boxplot',
    data: {
      labels: p.QI.map((q) => q.label).concat(p.Indices.map((i) => i.label)),
      datasets: [
        box('rgba(255,0,0,0.2)', 'red', 'QI', [...p.QI.map(slot), ...new Array(p.Indices.length).fill(null)]),
        box('rgba(0,0,255,0.2)', 'blue', 'Indices', [...new Array(p.QI.length).fill(null), ...p.Indices.map(slot)]),
      ],
    },
    options: {
      maintainAspectRatio: true,
      responsive: true,
      scales: {
        x: { ticks: { display: false } },
        y: {
          suggestedMax: 195,
          ticks: {
            stepSize: 5,
            callback: (value: number | string, index: number, values: unknown[]) =>
              index === values.length || Number(value) % 10 === 0 ? value : null,
            autoSkip: false,
          },
        },
      },
      plugins: {
        annotation: {
          drawTime: 'afterDraw',
          annotations: {
            average: {
              type: 'box',
              xScaleID: 'x',
              yScaleID: 'y',
              yMin: 99.5,
              yMax: 100.5,
              borderColor: 'rgba(0, 0, 0, 0.1)',
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
            },
          },
        },
        datalabels: datalabelsOptions,
      },
    },
  };
}

function useChart(config: any | null) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = config ? canvas.current?.getContext('2d') : null;
    if (!ctx) return;
    const chart = new Chart(ctx, config);
    return () => chart.destroy();
  }, [config]);
  return canvas;
}

/** Wide chart under the index table (box plots of IQ / indices). */
export function QiChart({ payload }: { payload: ChartPayloads | null }) {
  const config = payload ? qiConfig(payload.qi) : null;
  const ref = useChart(useStable(config, payload?.qi));
  return <canvas className="w-full object-contain" ref={ref} data-testid="chart-qi" />;
}

export function StandardResultsChart({ payload }: { payload: ChartPayloads | null }) {
  const ref = useChart(useStable(payload ? standardResultsConfig(payload.standardResults) : null, payload?.standardResults));
  return <canvas className="object-contain" ref={ref} data-testid="chart-standard" />;
}

export function FactorialChart({ payload }: { payload: ChartPayloads | null }) {
  const ref = useChart(useStable(payload ? factorialConfig(payload.factorial) : null, payload?.factorial));
  return <canvas className="object-contain" ref={ref} data-testid="chart-factorial" />;
}

/** Keeps the config object stable while the payload content is unchanged (avoids recreating the chart on every render). */
function useStable(config: any | null, key: unknown) {
  const last = useRef<{ key: string; config: any | null }>({ key: 'null', config: null });
  const k = JSON.stringify(key ?? null);
  if (last.current.key !== k) last.current = { key: k, config };
  return last.current.config;
}

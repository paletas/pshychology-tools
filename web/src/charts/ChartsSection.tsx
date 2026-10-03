import type { ChartPayloads } from '../engine/charts';
import { ptNew } from '../i18n/pt-new';
import type { ChartsDerived } from './derived';
import { FactorChart } from './FactorChart';
import { IqChart, type IqCi } from './IqChart';
import { ProfileChart } from './ProfileChart';

/** The "Gráficos" section: scaled scores by test, factor groups and QI / indices. */
export function ChartsSection({ payload, derived, ci, optional }: { payload: ChartPayloads | null; derived: ChartsDerived | null; ci: IqCi; optional: Record<string, boolean> }) {
  return (
    <section className="charts" aria-labelledby="h-charts">
      <h2 id="h-charts">{ptNew['charts.title']}</h2>
      <div className="fig-grid">
        <ProfileChart payload={payload} optional={optional} />
        <FactorChart payload={payload} derived={derived} optional={optional} />
        <IqChart payload={payload} ci={ci} />
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { publishDebug } from './debug';
import { chartPayloads } from './engine/charts';
import { scoreCase } from './engine/scoring';
import type { Age } from './engine/types';
import { pt } from './i18n/pt';
import { ptNew } from './i18n/pt-new';
import { initReferenceData, takePending } from './refdata/client';
import type { Loaded } from './refdata/client';
import { FactorialChart, QiChart, StandardResultsChart } from './ui/Charts';
import { DataUnavailableBanner, DataUpdatedBanner, UpdateBanner } from './ui/Banners';
import { DatesPanel } from './ui/DatesPanel';
import { GlanceStrip, IndexTable } from './ui/IndexTable';
import type { CiChoice } from './ui/IndexTable';
import { Layout } from './ui/Layout';
import { LegacyLink } from './ui/LegacyLink';
import { LookupTableVisualizer } from './ui/LookupTableVisualizer';
import { SheetActions } from './ui/SheetActions';
import { SubtestTable } from './ui/SubtestTable';
import { ThemeToggle } from './ui/ThemeToggle';

/** Bridge to the service worker registration done in main.tsx. */
export interface SwUpdate {
  subscribe(cb: () => void): void;
  apply(): void;
}

const sameAge = (a: Age | null, b: Age | null) => JSON.stringify(a) === JSON.stringify(b);

export function App({ swUpdate }: { swUpdate?: SwUpdate }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dataPending, setDataPending] = useState(false);
  const [swWaiting, setSwWaiting] = useState(false);

  const [testDate, setTestDate] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [raw, setRaw] = useState<Record<string, number | null>>({});
  const [ci, setCi] = useState<CiChoice>('Percentil95');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let alive = true;
    initReferenceData().then((h) => {
      if (!alive) return;
      setLoaded(h.current);
      setLoadFailed(h.current === null);
      setReady(true);
      h.onPending(() => alive && setDataPending(true));
    });
    swUpdate?.subscribe(() => alive && setSwWaiting(true));
    return () => {
      alive = false;
    };
  }, [swUpdate]);

  const data = loaded?.data ?? null;
  const snapshot = useMemo(() => (data ? scoreCase(data, { testDate, birthDate, raw }) : null), [data, testDate, birthDate, raw]);
  const charts = useMemo(() => (snapshot ? chartPayloads(snapshot, pt) : null), [snapshot]);

  useEffect(() => {
    publishDebug({ snapshot, charts, dataVersion: data?.dataVersion ?? null, dataSha: loaded?.sha ?? null });
  }, [snapshot, charts, data, loaded]);

  const setDates = (t: string, b: string) => {
    if (data) {
      // as in WISC3TestViewModel: when the age changes, a raw outside the new bounds is cleared
      const next = scoreCase(data, { testDate: t, birthDate: b, raw });
      if (!sameAge(next.age, snapshot?.age ?? null)) {
        const kept: Record<string, number | null> = {};
        for (const [id, v] of Object.entries(raw)) kept[id] = next.tests[id]?.outOfBounds ? null : v;
        setRaw(kept);
      }
    }
    setTestDate(t);
    setBirthDate(b);
  };

  const startFresh = () => {
    setTestDate('');
    setBirthDate('');
    setRaw({});
    const p = takePending();
    if (p) {
      setLoaded(p);
      setDataPending(false);
    }
  };

  if (!ready || !data || !snapshot) {
    return (
      <Layout legacySlot={<LegacyLink />} themeSlot={<ThemeToggle />}>
        <div data-testid="app" data-ready="false">
          {ready && loadFailed && <DataUnavailableBanner />}
        </div>
      </Layout>
    );
  }

  const datesSet = testDate !== '' && birthDate !== '';
  const band = snapshot.bandId ? (data.bands.find((b) => b.id === snapshot.bandId) ?? null) : null;

  return (
    <Layout dataVersion={data.dataVersion} glance={<GlanceStrip snapshot={snapshot} />} legacySlot={<LegacyLink />} themeSlot={<ThemeToggle />}>
      <div data-testid="app" data-ready="true">
        {swWaiting && <UpdateBanner onUpdate={() => swUpdate?.apply()} />}
        {dataPending && <DataUpdatedBanner />}

        <p className="lede">{ptNew['lede']}</p>
        <p className="notice" role="alert">
          <b>{pt['Warning']}</b> {pt['WarningDetails']}
        </p>

        <div className="layout">
          <section className="sheet" aria-labelledby="h-sheet">
            <h2 id="h-sheet">{ptNew['sheet.title']}</h2>
            <DatesPanel
              testDate={testDate}
              birthDate={birthDate}
              age={snapshot.age}
              band={band}
              onTestDate={(v) => setDates(v, birthDate)}
              onBirthDate={(v) => setDates(testDate, v)}
            />
            <SubtestTable data={data} snapshot={snapshot} raw={raw} onRaw={(id, v) => setRaw((r) => ({ ...r, [id]: v }))} />
            <SheetActions onShowTable={() => setShowTable((s) => !s)} onPrint={() => window.print()} onStartFresh={startFresh} />

            {datesSet && (
              <div className={showTable ? '' : 'hidden'} id="LookupTableVisualizer">
                <div className="card card-body overflow-x-auto">
                  <LookupTableVisualizer data={data} bandId={snapshot.bandId} />
                </div>
              </div>
            )}
          </section>

          <section className="results" aria-labelledby="h-res">
            <IndexTable snapshot={snapshot} ci={ci} onCi={setCi} />
          </section>
        </div>

        {/* Chart.js canvases until the SVG charts replace them (batch 11). */}
        <section className="charts">
          <div className="fig-grid">
            <div className="fig wide"><QiChart payload={charts} /></div>
            <div className="fig"><StandardResultsChart payload={charts} /></div>
            <div className="fig"><FactorialChart payload={charts} /></div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

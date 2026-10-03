import { useEffect, useMemo, useState } from 'react';
import { publishDebug } from './debug';
import { chartPayloads } from './engine/charts';
import { scoreCase } from './engine/scoring';
import type { Age } from './engine/types';
import { pt } from './i18n/pt';
import { initReferenceData, takePending } from './refdata/client';
import type { Loaded } from './refdata/client';
import { FactorialChart, QiChart, StandardResultsChart } from './ui/Charts';
import { DataUnavailableBanner, DataUpdatedBanner, UpdateBanner } from './ui/Banners';
import { DatesPanel } from './ui/DatesPanel';
import { IndexTable } from './ui/IndexTable';
import type { CiChoice } from './ui/IndexTable';
import { Layout } from './ui/Layout';
import { LookupTableVisualizer } from './ui/LookupTableVisualizer';
import { SubtestTable } from './ui/SubtestTable';

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
      <Layout>
        <div className="flex flex-col space-y-4 mt-2" data-testid="app" data-ready="false">
          {ready && loadFailed && <DataUnavailableBanner />}
        </div>
      </Layout>
    );
  }

  const datesSet = testDate !== '' && birthDate !== '';

  return (
    <Layout dataVersion={data.dataVersion}>
    <div className="flex flex-col space-y-4 mt-2 px-2" data-testid="app" data-ready="true">
      {swWaiting && <UpdateBanner onUpdate={() => swUpdate?.apply()} />}
      {dataPending && <DataUpdatedBanner />}

      <p className="notice" role="alert">
        <b>{pt['Warning']}</b> {pt['WarningDetails']}
      </p>

      <div className="flex-initial flex flex-col bg-gray-100 rounded-xl shadow-md items-left p-2 space-y-5">
        <DatesPanel
          testDate={testDate}
          birthDate={birthDate}
          age={snapshot.age}
          onTestDate={(v) => setDates(v, birthDate)}
          onBirthDate={(v) => setDates(testDate, v)}
          onShowTable={() => setShowTable((s) => !s)}
          onStartFresh={startFresh}
        />

        <div>
          {datesSet && (
            <div className={showTable ? '' : 'hidden'} id="LookupTableVisualizer">
              <div className="card card-body overflow-x-auto">
                <LookupTableVisualizer data={data} bandId={snapshot.bandId} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 xl:space-y-0 xl:space-x-4 flex xl:flex-row flex-col text-sm">
        <SubtestTable data={data} snapshot={snapshot} raw={raw} onRaw={(id, v) => setRaw((r) => ({ ...r, [id]: v }))} />

        <div className="flex-1 bg-gray-100 rounded-xl shadow-md justify-items-center p-2 divide-y-2 focus-within:border-2 focus-within:border-gray-600 overflow-x-auto">
          <IndexTable snapshot={snapshot} ci={ci} onCi={setCi} />

          <div className="mt-4 w-full justify-items-center focus-within:border-2 focus-within:border-gray-600">
            <div className="w-full">
              <QiChart payload={charts} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-auto flex flex-col xl:flex-row bg-gray-100 rounded-xl shadow-md justify-items-center">
        <div className="flex-1">
          <StandardResultsChart payload={charts} />
        </div>
        <div className="flex-1 pb-2">
          <FactorialChart payload={charts} />
        </div>
      </div>
    </div>
    </Layout>
  );
}

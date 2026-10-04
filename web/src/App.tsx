import { useEffect, useMemo, useState } from 'react';
import { publishDebug } from './debug';
import { chartPayloads } from './engine/charts';
import { scoreCase } from './engine/scoring';
import type { Age } from './engine/types';
import { pt } from './i18n/pt';
import { ptNew } from './i18n/pt-new';
import { initReferenceData, takePending } from './refdata/client';
import type { Loaded } from './refdata/client';
import { ChartsSection } from './charts/ChartsSection';
import { chartsDerived } from './charts/derived';
import { DataUnavailableBanner, DataUpdatedBanner, UpdateBanner } from './ui/Banners';
import { DatesPanel } from './ui/DatesPanel';
import { GlanceStrip, IndexTable } from './ui/IndexTable';
import type { CiChoice } from './ui/IndexTable';
import { Layout } from './ui/Layout';
import { LegacyLink } from './ui/LegacyLink';
import { LookupDialog } from './ui/LookupDialog';
import { SheetActions } from './ui/SheetActions';
import { dateGuard, localToday, parseRaw, resultsReason } from './ui/guards/inputGuards';
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
  const [birthBad, setBirthBad] = useState(false);
  const [testBad, setTestBad] = useState(false);
  const [rawText, setRawText] = useState<Record<string, string>>({});
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
  // REV-12: the guards sit in front of the engine; only parsed whole numbers >= 0 reach it.
  const { raw, rawErrors } = useMemo(() => {
    const raw: Record<string, number | null> = {};
    const rawErrors: Record<string, string | null> = {};
    for (const [id, text] of Object.entries(rawText)) {
      const p = parseRaw(text);
      raw[id] = p.value;
      rawErrors[id] = p.error;
    }
    return { raw, rawErrors };
  }, [rawText]);
  const today = useMemo(() => localToday(), []);
  const guard = useMemo(() => dateGuard({ birth: birthDate, test: testDate, birthBad, testBad, today }), [birthDate, testDate, birthBad, testBad, today]);
  const snapshot = useMemo(() => (data ? scoreCase(data, { testDate, birthDate, raw }) : null), [data, testDate, birthDate, raw]);
  const reason = useMemo(
    () => (data && snapshot ? resultsReason(guard.state, snapshot, rawErrors, data.tests.map((t) => ({ id: t.id, name: pt[`Test.${t.id}`], mandatory: t.mandatory }))) : null),
    [data, snapshot, guard, rawErrors],
  );
  const shown = !!snapshot?.indicesShown && !reason;
  const charts = useMemo(() => (snapshot && shown ? chartPayloads(snapshot, pt) : null), [snapshot, shown]);
  const derived = useMemo(() => chartsDerived(charts), [charts]);
  const optional = useMemo(() => Object.fromEntries((data?.tests ?? []).map((t) => [t.id, !t.mandatory])), [data]);

  useEffect(() => {
    publishDebug({ snapshot, charts, chartsDerived: derived, dataVersion: data?.dataVersion ?? null, dataSha: loaded?.sha ?? null });
  }, [snapshot, charts, derived, data, loaded]);

  const setDates = (t: string, b: string, tBad = false, bBad = false) => {
    if (data) {
      // as in WISC3TestViewModel: when the age changes, a raw outside the new bounds is cleared
      const next = scoreCase(data, { testDate: t, birthDate: b, raw });
      if (!sameAge(next.age, snapshot?.age ?? null)) {
        const kept: Record<string, string> = {};
        for (const [id, text] of Object.entries(rawText)) kept[id] = next.tests[id]?.outOfBounds ? '' : text;
        setRawText(kept);
      }
    }
    setTestDate(t);
    setBirthDate(b);
    setTestBad(tBad);
    setBirthBad(bBad);
  };

  const startFresh = () => {
    setTestDate('');
    setBirthDate('');
    setTestBad(false);
    setBirthBad(false);
    setRawText({});
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

  const band = snapshot.bandId ? (data.bands.find((b) => b.id === snapshot.bandId) ?? null) : null;

  return (
    <Layout dataVersion={data.dataVersion} glance={<GlanceStrip snapshot={snapshot} shown={shown} />} legacySlot={<LegacyLink />} themeSlot={<ThemeToggle />}>
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
              age={guard.age}
              band={band}
              messages={guard.messages}
              onTestDate={(v, bad) => setDates(v, birthDate, bad, birthBad)}
              onBirthDate={(v, bad) => setDates(testDate, v, testBad, bad)}
            />
            <SubtestTable data={data} snapshot={snapshot} rawText={rawText} rawErrors={rawErrors} onRawText={(id, text) => setRawText((r) => ({ ...r, [id]: text }))} />
            <SheetActions onShowTable={() => setShowTable(true)} onPrint={() => window.print()} onStartFresh={startFresh} />
          </section>

          <section className="results" aria-labelledby="h-res">
            <IndexTable snapshot={snapshot} reason={reason} ci={ci} onCi={setCi} />
          </section>
        </div>

        <LookupDialog open={showTable} onClose={() => setShowTable(false)} data={data} band={band} guardOk={guard.state === 'ok'} raw={raw} />

        <ChartsSection payload={charts} derived={derived} ci={ci} optional={optional} />
      </div>
    </Layout>
  );
}

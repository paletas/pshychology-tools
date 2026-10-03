# pshychology-tools
Automating some gruesome test evaluations still done by hand

## WISC-III next (offline PWA)

A rewrite of the WISC-III calculator as an offline-capable PWA, built next to the old Blazor app (which is untouched).

### Layout
- `web/`: Vite + React + TypeScript PWA (the product), with the scoring engine in `web/src/engine`.
- `server/`: ASP.NET host (`Silvestre.Psychology.Wisc3.Server`) that serves the PWA and the versioned reference data, plus its xUnit tests.
- `data/wisc3-pt/`: reference data (norm tables), the source of truth that the server bundles. `data/corrections/` holds hand-written, manual-confirmed corrections (not bundled).
- `tools/Wisc3.Oracle/`: console oracle that runs the old code; its `golden/` output is the test reference.
- `tests/e2e/`: Playwright harness (behaviour, flow, old-vs-new comparison, startup timing) and report scripts.
- `docs/wisc3/flagged-issues.md`: generated list of open questions for the psychologist (`cd tests/e2e && npm run report:flagged`).

### Prerequisites
Node 26 and .NET SDK 10.0.401, pinned by `server/global.json` and `tools/global.json` (run every `dotnet` command from `server` or `tools` so the pin applies).

### Running the new app
```
cd web && npm ci && npm run build
cd ../server
# set absolute paths (example for bash), then:
export Spa__Root=<absolute path to>/web/dist
export ReferenceData__Path=<absolute path to>/data/wisc3-pt
dotnet run --project Silvestre.Psychology.Wisc3.Server --urls http://localhost:5200
```
Quick check: `curl -I http://localhost:5200/wisc3` (HEAD is supported). Open http://localhost:5200/wisc3.

### Running the old app
```
cd tests/e2e && npm run old:publish
cd .tmp/old-publish && dotnet Silvestre.Psychology.Tools.WebApp.dll --urls http://localhost:5100
```

### Tests
- Web: `cd web && npm test` (also `npm run typecheck`).
- Server: `cd server && dotnet test`.
- Oracle and golden files: `cd tools && dotnet run --project Wisc3.Oracle -- golden --out Wisc3.Oracle/golden` (and `emit-data --out ../data/wisc3-pt`).
- End to end (`cd tests/e2e`; first `npx playwright install chromium`): `npm run test:behaviour` (offline, update and memory-only behaviour, flow), `npm run test:compare` (200 seeded cases, old vs new, writes `reports/compare-report.md`), `npm run test:timing` (startup timing, writes `reports/startup-timing.md`), `npm run typecheck`.

### Editing the reference data
Edit files under `data/wisc3-pt/`, then run `cd web && npm run data:format && npm run data:check`, and bump `dataVersion` in `data/wisc3-pt/version.json`. The server picks up changed files without a restart, and the client updates on its next start.

### Line endings
`.gitattributes` keeps `data/` and the oracle `golden/` files LF, because `data:check` and the bundle hash are byte-exact.

### Manual-correction workflow
Only corrections the psychologist has confirmed or approved against the printed manual may be added, and only in the data layer: the old Blazor `src/` stays unmodified. `data/corrections/wisc3-pt.json` is schema v2: each entry has an `id`, a `kind` (`scaled`: band, test and raw cells with `old` and `new`; or `index`: index, field and sum cells with `old` and `new`), the manual `table`, `oldSource`, `source` and an `approval` (required). To add one, edit that file, then rerun the oracle `golden` and `emit-data` commands (cwd `tools`), `npm run data:format` and `npm run data:check` (cwd `web`). `emit-data` asserts that the diff between the old tables and the emitted data is exactly the corrections set (now `scaledDiffCells=9 indexDiffCells=42`) and exits 1 otherwise. Discrepancies found but not yet approved go to `data/corrections/manual-discrepancies.json` (reported, never applied). `npm run report:corrections` (cwd `tests/e2e`) writes `docs/wisc3/corrections-report.md` for double-checking (every corrected cell with old, new, source, approval and evidence; `-- --check` verifies it is current). Display-only differences are kept as in the old app (the manual's `< 0.1`, `> 99.9` and `> 160` show as 0, 100 and IQ 999); they are listed in the report.

### Comparison tags
The comparison harness expects exactly these differences between the old and the new app (anything else is a regression):
- `gate-low`: the day-count age is not strictly supported and the old prediction has `supported:true, throws:false` (only 5y10m0d..5y11m30d). Old app scores it with band 06y06m; the new app blocks it like any unsupported age.
- `gate-high-throw`: the day-count age is not strictly supported and the old prediction has `throws:true, throwStage:"age"` (exactly 17y0m0d..17y2m30d). The old app crashes; the new app blocks it. Ages from 17y3m0d up are blocked by both and get no tag.
- `index-missing-key`: the age is supported, indices are shown, and an index sum is not in its key set. The old app shows the max-key entry; the new app shows that index as unavailable (dash, no arrow, empty slot in the QI chart).
- `manual-correction`: the oracle scenario output has a non-empty `correctionsHit`, that is a raw lands on a corrected scaled cell (C1, D1-D3) or a shown index has a sum with a corrected cell (D4-D8). The case record lists the ids as `correctionIds`, and `compare-report.json` counts `correctionHits` per id. Scaled ids cover the whole case; index ids cover that index row and its QI-chart entry. The old app shows the old table values (C1: crash); the new app shows the corrected values.

### Old-app console errors
The old app has no `#blazor-error-ui`, so an old crash is a console exception classified by stack frame (`tests/e2e/specs/helpers/old-console.ts`). The oracle predicts, per case, which console exceptions the old app logs (`oldConsole`), in 4 kinds: `age-throw` (setting the age throws), `raw-throw` (setting a raw throws), `visualizer-raw-throw` (the lookup visualizer hits the old table gap at band 11y06m, ImageDisposition raw 38) and `visualizer-index-throw`. The comparison checks both directions: a classified kind that was not predicted, or any unclassified record, is a `regression`; a predicted kind that is not observed is an `old-model-mismatch`. Presence is compared, not count. The new app has zero tolerance: any console or page error is a regression (only ad `net::ERR_*` is allowed). `compare-report.json` carries `oldConsoleKinds`, `unclassifiedOldConsole`, `oldConsoleMissing` and `newConsoleErrors`; `npx tsx scripts/check-old-console.ts` (cwd `tests/e2e`) calibrates the classifier over the recorded cases.

Out of scope: test date on or before the birth date (old app logs an error; new app behaviour not asserted). The oracle and the case generator reject such cases.

### Intentional UI differences
Responsive layout (no separate small-screen notice), the culture selector is omitted (it had one option), new banners (update available, reference data updated or unavailable, data version footer), and the charts are ported to Chart.js 4.

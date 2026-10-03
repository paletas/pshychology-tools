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
Only corrections the psychologist has confirmed against the printed manual may be added. Add an entry to `data/corrections/wisc3-pt.json` with its `source` and confirmation (`confirmedBy`, `confirmedOn`), then rerun the oracle `golden` and `emit-data` commands and `npm run data:check`. Discrepancies that are found but not yet confirmed go to `data/corrections/manual-discrepancies.json` (reported, never applied).

### Comparison tags
The comparison harness expects exactly these differences between the old and the new app (anything else is a regression):
- `gate-low`: the day-count age is not strictly supported and the old prediction has `supported:true, throws:false` (only 5y10m0d..5y11m30d). Old app scores it with band 06y06m; the new app blocks it like any unsupported age.
- `gate-high-throw`: the day-count age is not strictly supported and the old prediction has `throws:true, throwStage:"age"` (exactly 17y0m0d..17y2m30d). The old app crashes; the new app blocks it. Ages from 17y3m0d up are blocked by both and get no tag.
- `index-missing-key`: the age is supported, indices are shown, and an index sum is not in its key set. The old app shows the max-key entry; the new app shows that index as unavailable (dash, no arrow, empty slot in the QI chart).
- `manual-correction`: the age is supported, the old prediction has `throwStage:"raw"` and `throwAt` matches a golden correction (C1: band 11y06m, ImageDisposition raw 38). The old app crashes; the new app uses the corrected scaled value 13.

### Intentional UI differences
Responsive layout (no separate small-screen notice), the culture selector is omitted (it had one option), new banners (update available, reference data updated or unavailable, data version footer), and the charts are ported to Chart.js 4.

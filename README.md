# pshychology-tools
Automating some gruesome test evaluations still done by hand

## WISC-III next (offline PWA)

A rewrite of the WISC-III calculator as an offline-capable PWA, built next to the old Blazor app (changed only by the new-version banner, see Deploy).

### Layout
- `web/`: Vite + React + TypeScript PWA (the product), with the scoring engine in `web/src/engine`.
- `server/`: ASP.NET host (`Silvestre.Psychology.Wisc3.Server`) that serves the PWA and the versioned reference data, plus its xUnit tests.
- `data/wisc3-pt/`: reference data (norm tables), the source of truth that the server bundles. `data/corrections/` holds hand-written, manual-confirmed corrections (not bundled).
- `tools/Wisc3.Oracle/`: console oracle that runs the old code; its `golden/` output is the test reference. `golden-original/` is the frozen output of the old tables from before the table fix below (never regenerate it).
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

### Deploy (production)
- Image: `ghcr.io/paletas/pshychology-tools-wisc3`. The new app (2.x) is built by `.github/workflows/wisc3-next-image.yml` from `server/Silvestre.Psychology.Wisc3.Server/Dockerfile` (tags `X.Y.Z`, `X.Y`, `sha-<short>`; `-dev` suffix from `dev`). The old app (1.x) keeps its existing workflow. The `tag guard` job in `pr-check` requires old major = 1 and new major >= 2.
- Env of the new image: `Spa__Root`, `ReferenceData__Path`, `Legacy__Url` (link back to the old app), port 8080, runs non-root.
- Phase 1 on `psy.`: the new app is served at `/new` behind Traefik (stripprefix, plus a redirect of bare `/new` to `/new/wisc3`); the old app stays at `/` and shows a banner linking to the new one when `NewApp__Url` is set.
- Local checks: `npm run test:prefix` (the build under `/new/` behind `prefix-proxy.mjs`), `npm run test:pair` (old and new app side by side, switching both ways), `npm run test:prod` (read-only, against production). All run in `tests/e2e`.

#### Switch (phase 2)
- The new app is served at the root (Traefik router `psytoolsroot`, priority 30) and still at `/new` (alias, `psytoolsnext`, priority 100).
- The old app (1.3.0) is served at `/legacy` with env `PathBase=/legacy` (opt-in: unset = served at `/` exactly as before). `Program.cs` calls `UsePathBase` and then an explicit `UseRouting`; `App.razor` takes its `<base href>` from the request PathBase.
- A bare `/legacy` redirects to `/legacy/wisc3` (Traefik `psytoolslegacy`, priority 200, no strip).
- "Versão anterior" in the new app is `Legacy__Url` (HomeLab host_var `htz_psychology_legacy_url`).
- Tests: `SWITCH_PHASE=post npm run test:pair`, `SWITCH_PHASE=post npm run test:prod`, `npx tsx scripts/flip-profile.ts prepare|check`.

##### Retiring the /new install (2.1.0)
- Traefik router `psytoolsretire` (priority 110; HomeLab `psychology-next.compose.yml.j2`, mirrored in `.github/smoke/traefik-next.yml`) serves `web/public/retire-service-worker.js` (marker `// wisc3-retire`) at exactly `/new/service-worker.js`. The root `/service-worker.js` is the normal worker.
- A browser with the phase-1 `/new` worker picks it up on its next `/new` visit: it takes over at once, deletes the `/new/` caches, unregisters and moves open `/new` windows to `/wisc3`. A fresh `/new/wisc3` visit loads, then bounces to `/wisc3`. At any other scope the file does nothing.
- Installed `/new` PWAs cannot be migrated: users reinstall from the root.
- Later (deferred): a Traefik redirect `/new/*` -> `/`. It must never cover `/new/service-worker.js` (a service worker update that meets a redirect fails, so unchecked `/new` installs would stay on 2.0.0 for good): `psytoolsretire` keeps priority 110, above the redirect, indefinitely.
- Tests: `npm run test:prefix` (`specs/prefix/retire.spec.ts`), `npx tsx scripts/flip-profile.ts prepare-new|check-new|bounce-new|check-root` (production).

### Tests
- Web: `cd web && npm test` (also `npm run typecheck`).
- Server: `cd server && dotnet test`.
- Oracle and golden files: `cd tools && dotnet run --project Wisc3.Oracle -- golden --out Wisc3.Oracle/golden` (and `emit-data --out ../data/wisc3-pt`).
- End to end (`cd tests/e2e`; first `npx playwright install chromium`): `npm run test:behaviour` (offline, update and memory-only behaviour, flow), `npm run test:compare` (200 seeded cases, old vs new, writes `reports/compare-report.md`), `npm run test:timing` (startup timing, writes `reports/startup-timing.md`), `npm run typecheck`.

### Editing the reference data
Edit files under `data/wisc3-pt/`, then run `cd web && npm run data:format && npm run data:check`, and bump `dataVersion` in `data/wisc3-pt/version.json`. The server picks up changed files without a restart, and the client updates on its next start.

### Line endings
`.gitattributes` keeps `data/` and the oracle `golden/` and `golden-original/` files LF, because `data:check` and the bundle hash are byte-exact.

### Manual-correction workflow
Only corrections the psychologist has confirmed or approved against the printed manual may be added. The approved set (C1 and D1-D8: 9 scaled and 42 index cells) is applied in the data layer and, since the old/new side-by-side decision of 2026-10-03, also to the old Blazor app: exactly those cells in the 7 table files under `src/` (`SixYear`, `TenYearSixMonth`, `ElevenYearSixMonth` and `TwelveYearSixMonth` lookup tables; `Verbal`, `Realization` and `PerceptiveOrganization` subscales). The old app's logic bugs (age-gate leak, missing-key clamp, crashes) are not fixed. `data/corrections/wisc3-pt.json` is schema v2: each entry has an `id`, a `kind` (`scaled`: band, test and raw cells with `old` and `new`; or `index`: index, field and sum cells with `old` and `new`), the manual `table`, `oldSource`, `source` and an `approval` (required). To add one, edit that file, then rerun the oracle `golden` and `emit-data` commands (cwd `tools`), `npm run data:format` and `npm run data:check` (cwd `web`). Since `src/` now holds the fixed tables, the oracle reads the original values from `tools/Wisc3.Oracle/golden-original` (`OriginalTables.cs`): `golden` prints `fixedVsOriginal scaledCells=9 indexCells=42 other=0` and `fixedVsData scaled=0 index=0` and exits 1 otherwise, and `emit-data` asserts that the diff between the original tables and the emitted data is exactly the corrections set (`scaledDiffCells=9 indexDiffCells=42`). Discrepancies found but not yet approved go to `data/corrections/manual-discrepancies.json` (reported, never applied). `npm run report:corrections` (cwd `tests/e2e`) writes `docs/wisc3/corrections-report.md` for double-checking (every corrected cell with old, new, source, approval and evidence; `-- --check` verifies it is current). Display-only differences are kept as in the old app (the manual's `< 0.1`, `> 99.9` and `> 160` show as 0, 100 and IQ 999); they are listed in the report.

### Comparison tags
The comparison harness expects exactly these differences between the old and the new app (anything else is a regression):
- `gate-low`: the day-count age is not strictly supported and the old prediction has `supported:true, throws:false` (only 5y10m0d..5y11m30d). Old app scores it with band 06y06m; the new app blocks it like any unsupported age.
- `gate-high-throw`: the day-count age is not strictly supported and the old prediction has `throws:true, throwStage:"age"` (exactly 17y0m0d..17y2m30d). The old app crashes; the new app blocks it. Ages from 17y3m0d up are blocked by both and get no tag.
- `index-missing-key`: the age is supported, indices are shown, and an index sum is not in its key set. The old app shows the max-key entry; the new app shows that index as unavailable (dash, no arrow, empty slot in the QI chart).
There is no `manual-correction` tag any more: the old app shows the corrected table cells too (REV-11), so both apps agree on them. The oracle records the corrections a case lands on as `correctionsTouched` (a raw on a corrected scaled cell, or a shown index with a corrected sum); the case record lists them and `compare-report.json` counts `correctionsTouched` per id (every id must be at least 1) and requires `manualCorrection` = 0.

### Old-app console errors
The old app shows no error banner when it crashes; crashes are detected from classified console messages (exception text plus stack frame). The oracle predicts, per case, which console exceptions the old app logs (`oldConsole`), in 4 kinds: `age-throw` (setting the age throws), `raw-throw` (setting a raw throws; no longer predicted), `visualizer-raw-throw` (the lookup visualizer hits a gap in an old table) and `visualizer-index-throw`. After the table fix the old tables have no gap, so `raw-throw` and `visualizer-raw-throw` are 0 and the comparison requires it. The comparison checks both directions: a classified kind that was not predicted, or any unclassified record, is a `regression`; a predicted kind that is not observed is an `old-model-mismatch`. Presence is compared, not count. The new app has zero tolerance: any console or page error is a regression (only ad `net::ERR_*` is allowed). `compare-report.json` carries `oldConsoleKinds`, `unclassifiedOldConsole`, `oldConsoleMissing` and `newConsoleErrors`; `npx tsx scripts/check-old-console.ts` (cwd `tests/e2e`) calibrates the classifier over the recorded cases.

Test date on or before the birth date: the new app blocks it with a message; the old app is not compared there (it logs an error), so the comparison harness rejects such cases.

### Input guards
The new app checks its inputs in the UI layer, in front of the unchanged engine (`web/src/ui/guards/inputGuards.ts`). Dates: missing, partly typed, invalid, test date equal to or before the birth date, and an age outside 6y0m0d to 16y11m30d (the computed age is shown); a test date in the future or a birth year before 1900 are reported too. Raw scores accept whole numbers of 0 or more only (the keys `-`, `+`, `e` are blocked, anything else typed or pasted is reported next to the field, and the existing maximum message stays). While a guard fails, the results area names the reason (`results-empty[data-reason]`), the index strips are not rendered, the charts show their empty state and the glance strip shows dashes. Valid inputs score exactly as before. `npx tsx scripts/generate-cases.ts --self-test-reject` (cwd `tests/e2e`) injects one case with test date equal to the birth date and must exit 1. The guard texts are pending approval in `new-strings.md`.

### UI (redesign)
The new app has its own look, not a port of the old one: a top bar with the menu, theme toggle and the optional "Versão anterior" link, a glance strip with the three main indices on small screens, the subtests as a list in administration order (raw input and scaled score per row, sums below), the index rows with 90/95% interval strips, three hand-written SVG charts (profile, factorial indices, QI; no chart library) and a "Ver tabela" lookup dialog (wide table, or one test at a time with chips on phones). Layout breakpoints: menu button up to 640 px, glance strip below 1100 px, two columns from 1100 px.
- Themes: light and dark, following the system until chosen. The choice is stored in one cookie, `wisc3-theme` (`light` or `dark`, Path=/, SameSite=Lax, 180 days), read only by the page; it is the single exception to "nothing is stored" (case data stays in memory).
- Back to the old version: set `Legacy__Url` on the server (for example `http://127.0.0.1:5300/wisc3`); the page reads it from `/config.json` without a rebuild. Unset or invalid means no link; offline the link is disabled with a note. The comparison run leaves it unset.
- Test ids the e2e readers rely on: `scaled-<Id>` (one value, `data-columns` lists the old columns it stands for), `age-years/months/days`, `oob-<Id>`, `raw-msg-<Id>`, `date-msg-<field>`, `index-row-<name>` (absent while `results-empty` explains why), `chart-standard/factorial/qi` (`data-marks`, QI also `data-y-min/max`), `chart-empty-<kind>`, `ci-select [data-ci]`, `lk-*` in the lookup dialog.
- Charts: hovering, focusing (Tab, then the arrow keys) or tapping a point or bar shows its values in a tooltip, as the old app's charts did; the QI/index tooltip shows the result and both the 90% and 95% intervals.
- Raw-score fields: boxed inputs (border contrast at least 3:1 in light and dark), a dash placeholder, a "Resultados Brutos" column header and the focus ring; the scaled score next to them stays unboxed and read-only.
- Browser specs for it live in `tests/e2e/specs/ui` (initial state, input guards, out-of-bounds message, responsive, lookup, theme, legacy link) and run in the behaviour project.

### Intentional UI differences
Responsive layout (no separate small-screen notice), the culture selector is omitted (it had one option), new banners (update available, reference data updated or unavailable, data version footer), and the charts are redrawn as SVG without a chart library (the old app uses Chart.js 2).

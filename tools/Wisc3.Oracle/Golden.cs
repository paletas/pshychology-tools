using System.Globalization;
using System.Reflection;
using System.Text;
using Silvestre.Psychology.Tools.WISC3;

namespace Wisc3.Oracle;

public static class Golden
{
    static void Write(string dir, string file, object value)
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, file), Json.Serialize(value), new UTF8Encoding(false));
    }

    public static int Run(string outDir)
    {
        CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;

        // ---- subtests.json (+ assertions)
        var bands = Catalog.Bands;
        int distinct = bands.Select(b => b.Fingerprint).Distinct().Count();
        int outOfRange = 0, nonMonotonic = 0;
        foreach (var band in bands)
            foreach (var tb in band.Tests.Values)
                for (int c = 1; c <= 5; c++)
                {
                    int? prev = null;
                    foreach (var row in tb.Rows)
                    {
                        if (Catalog.IsGap(row)) continue;
                        var v = row[c];
                        if (v == null) continue;
                        if (v < 1 || v > 19) outOfRange++;
                        if (prev != null && v < prev) nonMonotonic++;
                        prev = v;
                    }
                }
        // REV-11: src/ holds the fixed tables, so the live code has no gap left. golden-original (OriginalTables) keeps the pre-fix
        // state: its gaps must equal the throwing corrections exactly, the live-vs-original cell diff must be exactly the corrections
        // set (nothing else), and the live tables must equal the original ones with the corrections applied (= data/).
        var gapsBefore = Catalog.AllGaps();
        var gapsOriginal = OriginalTables.Gaps;
        var corrections = CorrectionsLoader.All;
        var gapKeys = gapsOriginal.Select(g => $"{g.band}|{g.test}|{g.raw}").OrderBy(x => x, StringComparer.Ordinal).ToList();
        var corrKeys = corrections.Where(c => c.Kind == "scaled").SelectMany(c => c.Cells.Where(x => x.OldThrows).Select(x => $"{c.Band}|{c.Test}|{x.Raw}")).OrderBy(x => x, StringComparer.Ordinal).ToList();
        var correctionErrors = CorrectionsLoader.Validate();
        int matched = gapKeys.Intersect(corrKeys).Count();
        Console.WriteLine($"bands={bands.Count} distinctFingerprints={distinct} scaledOutOfRange={outOfRange} gapsBefore={gapsBefore.Count} gapsOriginal={gapsOriginal.Count} gapsMatchedCorrections={matched} corrections={corrections.Count} scaledCells={CorrectionsLoader.ScaledCellCount} indexCells={CorrectionsLoader.IndexCellCount}");
        var (vsOrigScaled, vsOrigIndex, vsOrigOther) = OriginalTables.FixedVsOriginal();
        var (vsDataScaled, vsDataIndex) = OriginalTables.FixedVsData();
        Console.WriteLine($"fixedVsOriginal scaledCells={vsOrigScaled.Count} indexCells={vsOrigIndex.Count} other={vsOrigOther.Count}");
        Console.WriteLine($"fixedVsData scaled={vsDataScaled.Count} index={vsDataIndex.Count}");
        var scaledExpected = new SortedSet<string>(CorrectionsLoader.Scaled.SelectMany(c => c.Cells.Select(cell =>
            $"{c.Band}|{c.Test}|{cell.Raw}|{(cell.OldThrows ? "throws" : cell.OldInt.ToString(CultureInfo.InvariantCulture))}|{cell.NewInt}")), StringComparer.Ordinal);
        var indexExpected = new SortedSet<string>(CorrectionsLoader.IndexCorrections.SelectMany(c => c.Cells.Select(cell =>
            $"{c.Index}|{cell.Sum}|{c.Field}|{(c.Field == "percentile" ? cell.Old.GetDecimal().ToString(CultureInfo.InvariantCulture) : cell.OldInt.ToString(CultureInfo.InvariantCulture))}|{CorrectionsLoader.CellNewText(c, cell)}")), StringComparer.Ordinal);
        if (bands.Count != 22 || distinct != 22 || outOfRange != 0 || nonMonotonic != 0 || gapsBefore.Count != 0 || !gapKeys.SequenceEqual(corrKeys) || correctionErrors.Count != 0
            || vsOrigOther.Count != 0 || !vsOrigScaled.SetEquals(scaledExpected) || !vsOrigIndex.SetEquals(indexExpected))
        {
            Console.Error.WriteLine($"ASSERTION FAILED: bands={bands.Count} distinct={distinct} outOfRange={outOfRange} nonMonotonic={nonMonotonic} gapsBefore={gapsBefore.Count}");
            Console.Error.WriteLine("original gaps: " + string.Join("; ", gapKeys));
            Console.Error.WriteLine("corrections: " + string.Join("; ", corrKeys));
            foreach (var e in correctionErrors) Console.Error.WriteLine(e);
            foreach (var x in vsOrigOther) Console.Error.WriteLine("fixedVsOriginal other: " + x);
            foreach (var x in vsOrigScaled.Except(scaledExpected)) Console.Error.WriteLine("fixedVsOriginal unexpected scaled change " + x);
            foreach (var x in scaledExpected.Except(vsOrigScaled)) Console.Error.WriteLine("fixedVsOriginal missing scaled change " + x);
            foreach (var x in vsOrigIndex.Except(indexExpected)) Console.Error.WriteLine("fixedVsOriginal unexpected index change " + x);
            foreach (var x in indexExpected.Except(vsOrigIndex)) Console.Error.WriteLine("fixedVsOriginal missing index change " + x);
            return 1;
        }
        Write(outDir, "subtests.json", new { bands });

        // ---- corrections.json: one row per corrected cell
        var indexTables = Catalog.Indices().ToDictionary(i => i.Name);
        var correctionRows = new List<object>();
        foreach (var c in corrections)
        {
            if (c.Kind == "scaled")
            {
                var band = bands.Single(b => b.Id == c.Band);
                foreach (var cell in c.Cells)
                {
                    var origTb = OriginalTables.Test(c.Band!, c.Test!);
                    var oldRow = origTb.Rows.Single(r => r[0] == cell.Raw);
                    var shape = cell.OldThrows ? origTb.Rows.Single(r => r[0] == c.EquivalentRaw) : oldRow;
                    var corrected = new int?[5];
                    for (int i = 0; i < 5; i++) corrected[i] = shape[i + 1] == null ? null : cell.NewInt;
                    object oldValue = cell.OldThrows ? new { throws = true } : new { scaled = oldRow.Skip(1).ToArray() };
                    correctionRows.Add(new { c.Id, c.Kind, c.Band, age = band.Age, c.Test, cell.Raw, old = oldValue, corrected, c.Source, c.Approval });
                }
            }
            else
            {
                var idx = indexTables[c.Index!];
                foreach (var cell in c.Cells)
                {
                    var r = OriginalTables.IndexResult(c.Index!, cell.Sum);
                    var p = CorrectionsLoader.PatchIndex(c.Index!, (short)cell.Sum, r, out _)!;
                    var oldRowObj = new { iq = (int)r.Value, percentile = r.Percentil.ToString(CultureInfo.InvariantCulture), ci90 = new int[] { r.ConfidenceInterval90.BottomBoundary, r.ConfidenceInterval90.TopBoundary }, ci95 = new int[] { r.ConfidenceInterval95.BottomBoundary, r.ConfidenceInterval95.TopBoundary } };
                    object oldValue = c.Field == "percentile" ? r.Percentil.ToString(CultureInfo.InvariantCulture) : int.Parse(CorrectionsLoader.IndexFieldOld(r, c.Field!), CultureInfo.InvariantCulture);
                    object newValue = c.Field == "percentile" ? p.Percentil.ToString(CultureInfo.InvariantCulture) : int.Parse(CorrectionsLoader.IndexFieldOld(p, c.Field!), CultureInfo.InvariantCulture);
                    correctionRows.Add(new { c.Id, c.Kind, index = c.Index, cell.Sum, c.Field, old = oldValue, corrected = newValue, oldRow = oldRowObj, c.Source, c.Approval });
                }
            }
        }
        Write(outDir, "corrections.json", correctionRows);

        // ---- indices.json
        var indices = Catalog.Indices();
        var indexRows = new Dictionary<string, List<object>>();
        foreach (var idx in indices)
        {
            var rows = new List<object>();
            for (int sum = 0; sum <= idx.Keys.Max() + 10; sum++)
            {
                var r = idx.Calculate((short)sum);
                rows.Add(new
                {
                    sum,
                    inTable = idx.Keys.Contains((short)sum),
                    iq = r == null ? (int?)null : r.Value,
                    percentile = r?.Percentil.ToString(CultureInfo.InvariantCulture),
                    ci90 = r == null ? null : new int[] { r.ConfidenceInterval90.BottomBoundary, r.ConfidenceInterval90.TopBoundary },
                    ci95 = r == null ? null : new int[] { r.ConfidenceInterval95.BottomBoundary, r.ConfidenceInterval95.TopBoundary }
                });
            }
            indexRows[idx.Name] = rows;
        }
        Write(outDir, "indices.json", indexRows);

        // ---- age-gate.json
        var st = Catalog.Standardizer;
        var typeFingerprint = new Dictionary<Type, int>();
        var gate = new List<object>();
        var gateEntries = new List<(int[] age, bool supported, int? band, bool throws)>();
        for (int y = 0; y <= 24; y++)
            for (int m = 0; m <= 11; m++)
                for (int d = 0; d <= 30; d++)
                {
                    var age = new Age(y, m, d);
                    bool supported = WISC3Test.IsAgeSupported(Catalog.Country, age);
                    int? bandIndex = null;
                    bool throws = false;
                    try
                    {
                        var table = Catalog.TableSelector.Invoke(st, new object[] { age })!;
                        if (!typeFingerprint.TryGetValue(table.GetType(), out var bi))
                        {
                            var fp = Catalog.FingerprintAt(age);
                            bi = bands.FindIndex(b => b.Fingerprint == fp);
                            if (bi < 0) throw new InvalidOperationException($"No band fingerprint matches table {table.GetType().Name}");
                            typeFingerprint[table.GetType()] = bi;
                        }
                        bandIndex = bi;
                    }
                    catch (TargetInvocationException) { throws = true; }
                    var arr = new[] { y, m, d };
                    gate.Add(new { age = arr, oldSupported = supported, oldBandIndex = bandIndex, oldThrows = throws });
                    gateEntries.Add((arr, supported, bandIndex, throws));
                }
        Write(outDir, "age-gate.json", gate);

        // ---- day-count-age.json
        Write(outDir, "day-count-age.json", DayCountCases());

        // ---- scenarios.json
        var scenarios = ScenarioDriver.Generate(10000);
        var results = scenarios.Select(ScenarioDriver.Run).ToList();
        // 3 forced scenarios per correction id so that every id is hit at least 3 times.
        var forced = ScenarioDriver.GenerateForcedPerId(10000);
        scenarios.AddRange(forced);
        results.AddRange(forced.Select(ScenarioDriver.Run));
        Console.WriteLine("forcedPerId=3");

        // ---- old console prediction summary (cases per kind) + assertions
        int KindCases(string k) => results.Count(r => r.OldConsole!.Any(c => c.Kind == k));
        var kindCounts = OldConsole.Kinds.ToDictionary(k => k, KindCases);
        Console.WriteLine($"oldConsoleKinds age-throw={kindCounts["age-throw"]} raw-throw={kindCounts["raw-throw"]} visualizer-raw-throw={kindCounts["visualizer-raw-throw"]} visualizer-index-throw={kindCounts["visualizer-index-throw"]}");
        // REV-11: the old tables have no gap any more, so neither a raw-stage nor a visualizer raw crash is predicted.
        if (kindCounts["visualizer-raw-throw"] != 0 || kindCounts["raw-throw"] != 0 || kindCounts["visualizer-index-throw"] != 0
            || kindCounts["age-throw"] != results.Count(r => r.Old.ThrowStage == "age")
            || kindCounts["raw-throw"] != results.Count(r => r.Old.ThrowStage == "raw"))
        {
            Console.Error.WriteLine($"ASSERTION FAILED: oldConsole kinds {string.Join(",", kindCounts.Select(kv => kv.Key + "=" + kv.Value))} expected raw-throw=0 visualizer-raw-throw=0 visualizer-index-throw=0");
            return 1;
        }
        Write(outDir, "scenarios.json", scenarios.Zip(results, (s, r) => new { s.Id, s.TestDate, s.BirthDate, s.Raw, old = r.Old, correctionsTouched = r.CorrectionsTouched, oldConsole = r.OldConsole }).ToList());

        // ---- findings.json
        Write(outDir, "findings.json", Findings.Build(indices, scenarios, results, gateEntries, gapsBefore, gapsOriginal, corrections));
        return 0;
    }

    static List<object> DayCountCases()
    {
        var list = new List<object>();
        void Add(DateTime test, DateTime birth)
        {
            var age = Catalog.DetermineAgeFrom(test, birth);
            list.Add(new { test = Catalog.Iso(test), birth = Catalog.Iso(birth), age = Catalog.AgeArr(age) });
        }
        var rng = new Random(Catalog.Seed);
        var first = new DateTime(2015, 1, 1);
        int span = (new DateTime(2030, 12, 31) - first).Days;
        int maxDays = Catalog.DaysFor(25, 0, 0);
        for (int i = 0; i < 3000; i++)
        {
            var test = first.AddDays(rng.Next(0, span + 1));
            Add(test, test.AddDays(-rng.Next(1, maxDays + 1)));
        }
        // Fixed pairs around Feb 28/29, Mar 1, Dec 31/Jan 1 in leap and non-leap years.
        var anchors = new List<DateTime>();
        foreach (var year in new[] { 2019, 2020, 2023, 2024 })
        {
            anchors.Add(new DateTime(year, 2, 28));
            if (DateTime.IsLeapYear(year)) anchors.Add(new DateTime(year, 2, 29));
            anchors.Add(new DateTime(year, 3, 1));
            anchors.Add(new DateTime(year, 12, 31));
            anchors.Add(new DateTime(year + 1, 1, 1));
        }
        foreach (var test in anchors)
            foreach (var birth in anchors)
                foreach (var years in new[] { 6, 10, 16 })
                {
                    int by = test.Year - years;
                    Add(test, new DateTime(by, birth.Month, Math.Min(birth.Day, DateTime.DaysInMonth(by, birth.Month))));
                }
        return list;
    }
}

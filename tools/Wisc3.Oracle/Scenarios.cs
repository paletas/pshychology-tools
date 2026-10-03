using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Microsoft.Extensions.Localization;
using Silvestre.Psychology.Tools.WISC3;
using Silvestre.Psychology.Tools.WISC3.ViewModels;

namespace Wisc3.Oracle;

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);
}

// Serves the pt resx values so the QI chart labels equal the live old app's.
public sealed class PtResxLocalizer : IStringLocalizer
{
    readonly Dictionary<string, string> _values = new();

    public PtResxLocalizer()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "Silvestre.Psychology.sln"))) dir = dir.Parent;
        if (dir == null) throw new InvalidOperationException("Silvestre.Psychology.sln not found above " + AppContext.BaseDirectory);
        var resx = Path.Combine(dir.FullName, "src", "Silvestre.Psychology.Tools.WISC3.WebComponent", "Pages", "WISC3.pt.resx");
        foreach (var data in XDocument.Load(resx).Root!.Elements("data"))
            _values[(string)data.Attribute("name")!] = (string?)data.Element("value") ?? "";
    }

    public LocalizedString this[string name] =>
        _values.TryGetValue(name, out var v) ? new LocalizedString(name, v, false) : new LocalizedString(name, name, true);

    public LocalizedString this[string name, params object[] arguments] =>
        _values.TryGetValue(name, out var v) ? new LocalizedString(name, string.Format(CultureInfo.InvariantCulture, v, arguments), false) : new LocalizedString(name, name, true);

    public IEnumerable<LocalizedString> GetAllStrings(bool includeParentCultures) =>
        _values.Select(kv => new LocalizedString(kv.Key, kv.Value, false));
}

public sealed record Scenario(string Id, string TestDate, string BirthDate, Dictionary<string, int?> Raw);
public sealed record OldTest(int? Min, int? Max, int?[] Scaled, bool OutOfBounds);
public sealed record OldIndex(int? Sum, int? Iq, string? Percentile, int[]? Ci90, int[]? Ci95, string? Comparison);
public sealed record ThrowAt(string Test, int Raw);
public sealed record OldResult(
    int[]? Age, bool Throws, bool Supported,
    Dictionary<string, OldTest>? Tests, Dictionary<string, int>? Sums,
    bool IndicesShown, Dictionary<string, OldIndex?>? Indices, JsonNode? Charts,
    string? ThrowStage = null, ThrowAt? ThrowAt = null, string? BandId = null);
public sealed record ScenarioResult(string Id, OldResult Old, List<string> CorrectionsHit, OldResult? OldCorrected = null);

public static class ScenarioDriver
{
    static readonly PtResxLocalizer Localizer = new();

    static string LowerFirst(string s) => char.ToLowerInvariant(s[0]) + s[1..];

    static WISC3ViewModel NewViewModel(Age? age)
    {
        var vm = new WISC3ViewModel(Localizer, Catalog.Country);
        vm.SubjectAge = age;
        return vm;
    }

    public static ScenarioResult Run(Scenario s)
    {
        var old = RunCore(s);
        var (corrected, hits) = CorrectedModel.Compute(s, old);
        return new ScenarioResult(s.Id, old, hits, hits.Count > 0 ? corrected : null);
    }

    internal static OldResult RunCore(Scenario s)
    {
        var age = Catalog.DetermineAgeFrom(Catalog.ParseIso(s.TestDate), Catalog.ParseIso(s.BirthDate));
        var ageArr = Catalog.AgeArr(age);
        string stage = "age";
        ThrowAt? at = null;
        string? bandId = null;
        try
        {
            var vm = NewViewModel(age);
            stage = "raw";
            if (age != null) bandId = Catalog.OldBandId(age.Value);
            foreach (var (id, raw) in s.Raw)
            {
                at = new ThrowAt(id, raw ?? -1);
                vm.StanderdizationPhase[id].RawResult = (short?)raw;
            }
            at = null;
            stage = "compute";

            var tests = new Dictionary<string, OldTest>();
            foreach (var type in Catalog.RowOrder)
            {
                var t = vm.StanderdizationPhase[type.ToString()];
                tests[type.ToString()] = new OldTest(t.MinRawResult, t.MaxRawResult,
                    new int?[] { t.StandardVerbal, t.StandardRealization, t.StandardVerbalComprehension, t.StandardPerceptiveOrganization, t.StandardProcessingVelocity },
                    t.RawResultOutOfBounds);
            }
            var ph = vm.StanderdizationPhase;
            var sums = new Dictionary<string, int>
            {
                ["verbal"] = ph.VerbalTotal,
                ["realization"] = ph.RealizationTotal,
                ["verbalComprehension"] = ph.VerbalComprehensionTotal,
                ["perceptiveOrganization"] = ph.PerceptiveOrganizationTotal,
                ["processingVelocity"] = ph.ProcessingVelocityTotal,
                ["complete"] = (short)(ph.VerbalTotal + ph.RealizationTotal)
            };
            var shown = vm.ShouldShowCharts;
            var indices = new Dictionary<string, OldIndex?>();
            foreach (var qi in vm.CalculatorPhase.AllCalculatedQI)
            {
                OldIndex? entry = null;
                if (shown)
                    entry = new OldIndex(qi.StandardResult, qi.IndexQI,
                        qi.Percentil?.ToString(CultureInfo.InvariantCulture),
                        qi.ConfidenceInterval90 == null ? null : new int[] { qi.ConfidenceInterval90.Value.LowerBound, qi.ConfidenceInterval90.Value.UpperBound },
                        qi.ConfidenceInterval95 == null ? null : new int[] { qi.ConfidenceInterval95.Value.LowerBound, qi.ConfidenceInterval95.Value.UpperBound },
                        qi.AverageComparisonResult?.ToString());
                indices[LowerFirst(qi.Name)] = entry;
            }
            JsonNode? charts = null;
            if (shown)
            {
                charts = new JsonObject
                {
                    ["standardResults"] = JsonSerializer.SerializeToNode(vm.GetStandardResultsChartData(), Json.Options),
                    ["factorial"] = JsonSerializer.SerializeToNode(vm.GetStandardFactorialIndicesChartData(), Json.Options),
                    ["qi"] = JsonSerializer.SerializeToNode(vm.GetQiIndicesChartData(), Json.Options)
                };
            }
            return new OldResult(ageArr, false, vm.IsAgeSupported == true, tests, sums, shown, indices, charts, null, null, bandId);
        }
        catch
        {
            return new OldResult(ageArr, true, false, null, null, false, null, null, stage, stage == "raw" ? at : null, stage == "age" ? null : bandId);
        }
    }

    static readonly string[] ForcedTestDates = { "2023-05-10", "2024-06-20", "2025-07-30" };
    static readonly Dictionary<string, short[]> ForcedSums = new()
    {
        ["D4"] = new short[] { 82, 82, 82 }, ["D5"] = new short[] { 84, 84, 84 }, ["D6"] = new short[] { 63, 63, 63 },
        ["D7"] = new short[] { 25, 26, 25 }, ["D8"] = new short[] { 40, 58, 76 }
    };

    static Scenario ForcedCase(int index, string testIso, BandData band, Dictionary<string, int?> raw)
    {
        var test = Catalog.ParseIso(testIso);
        var birth = test.AddDays(-Catalog.DaysFor(band.Age[0], band.Age[1], band.Age[2]));
        return new Scenario($"f{index:00000}", Catalog.Iso(test), Catalog.Iso(birth), raw);
    }

    // The scaled -> lowest raw map of one test column in a band (from the golden enumeration).
    static SortedDictionary<int, int> ScaledToRaw(BandData band, string testId, int column)
    {
        var map = new SortedDictionary<int, int>();
        foreach (var row in band.Tests[testId].Rows)
            if (row[column] != null && !map.ContainsKey(row[column]!.Value)) map[row[column]!.Value] = row[0]!.Value;
        return map;
    }

    // Depth-first search for one raw per contributing test whose scaled values add up to the target (null when unreachable).
    static Dictionary<string, int>? SolveSum(BandData band, string indexName, int target)
    {
        int column = Array.IndexOf(Catalog.IndexNames, indexName) switch { 0 => 1, 1 => 2, 3 => 3, 4 => 4, 5 => 5, _ => throw new InvalidOperationException(indexName) };
        bool mandatoryOnly = indexName is "verbal" or "realization";
        var tests = Catalog.RowOrder
            .Where(t => band.Tests[t.ToString()].Rows.Any(r => r[column] != null))
            .Where(t => !mandatoryOnly || Catalog.Standardizer.GetTestDescriptor(t).Mandatory)
            .Select(t => t.ToString()).ToList();
        var maps = tests.Select(t => ScaledToRaw(band, t, column)).ToList();
        var chosen = new int[tests.Count];
        bool Dfs(int i, int remaining)
        {
            if (i == tests.Count) return remaining == 0;
            foreach (var (scaled, raw) in maps[i])
            {
                chosen[i] = raw;
                if (Dfs(i + 1, remaining - scaled)) return true;
            }
            return false;
        }
        if (!Dfs(0, target)) return null;
        return tests.Select((t, i) => (t, i)).ToDictionary(x => x.t, x => chosen[x.i]);
    }

    // 3 forced scenarios per correction id so that every id is hit (plan step 38).
    public static List<Scenario> GenerateForcedPerId(int firstIndex)
    {
        var list = new List<Scenario>();
        int n = firstIndex;
        Dictionary<string, int?> Midpoints(BandData band) =>
            Catalog.RowOrder.ToDictionary(t => t.ToString(), t => (int?)((band.Tests[t.ToString()].Min + band.Tests[t.ToString()].Max) / 2));
        foreach (var c in CorrectionsLoader.All)
        {
            if (c.Kind == "scaled")
            {
                var band = Catalog.Bands.Single(b => b.Id == c.Band);
                foreach (var date in ForcedTestDates)
                {
                    var raw = Midpoints(band);
                    raw[c.Test!] = c.Cells[0].Raw;
                    list.Add(ForcedCase(n++, date, band, raw));
                }
            }
            else
            {
                var sums = ForcedSums[c.Id];
                for (int i = 0; i < 3; i++)
                {
                    BandData? used = null;
                    Dictionary<string, int>? solution = null;
                    foreach (var band in Catalog.Bands.OrderBy(b => b.Id == "10y00m" ? 0 : 1))
                    {
                        solution = SolveSum(band, c.Index!, sums[i]);
                        if (solution != null) { used = band; break; }
                    }
                    if (used == null) throw new InvalidOperationException($"{c.Id}: no band reaches {c.Index} sum {sums[i]}");
                    Console.WriteLine($"forced {c.Id} {c.Index} sum={sums[i]} band={used.Id}");
                    var raw = Midpoints(used);
                    foreach (var (t, r) in solution!) raw[t] = r;
                    list.Add(ForcedCase(n++, ForcedTestDates[i], used, raw));
                }
            }
        }
        return list;
    }

    // 10 000 seeded cases (see plan step 3).
    public static List<Scenario> Generate(int count)
    {
        var rng = new Random(Catalog.Seed);
        var first = new DateTime(2018, 1, 1);
        int span = (new DateTime(2026, 12, 31) - first).Days;
        int minDays = Catalog.DaysFor(5, 6, 0), maxDays = Catalog.DaysFor(17, 6, 0);
        var mandatory = Catalog.RowOrder.Where(t => Catalog.Standardizer.GetTestDescriptor(t).Mandatory).ToList();
        var list = new List<Scenario>();
        for (int i = 0; i < count; i++)
        {
            var test = first.AddDays(rng.Next(0, span + 1));
            var birth = test.AddDays(-rng.Next(minDays, maxDays + 1));
            var age = Catalog.DetermineAgeFrom(test, birth);
            WISC3ViewModel? probe = null;
            try { probe = NewViewModel(age); } catch { }

            var raw = new Dictionary<string, int?>();
            foreach (var type in Catalog.RowOrder)
            {
                bool mand = Catalog.Standardizer.GetTestDescriptor(type).Mandatory;
                bool omit = !mand && rng.NextDouble() < 0.25;
                var t = probe?.StanderdizationPhase[type.ToString()];
                int v = t?.MinRawResult != null ? rng.Next(t.MinRawResult.Value, t.MaxRawResult!.Value + 1) : rng.Next(0, 31);
                raw[type.ToString()] = omit ? null : v;
            }
            if (rng.NextDouble() < 0.02)
            {
                var type = mandatory[rng.Next(mandatory.Count)];
                var t = probe?.StanderdizationPhase[type.ToString()];
                raw[type.ToString()] = t?.MaxRawResult != null ? t.MaxRawResult.Value + 1 : 31;
            }
            list.Add(new Scenario($"s{i:00000}", Catalog.Iso(test), Catalog.Iso(birth), raw));
        }
        return list;
    }
}

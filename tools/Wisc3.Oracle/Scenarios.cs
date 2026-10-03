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
public sealed record ScenarioResult(string Id, OldResult Old, OldResult? OldCorrected = null);

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
        OldResult? corrected = null;
        if (old.Throws && old.ThrowStage == "raw" && old.ThrowAt != null)
        {
            var c = CorrectionsLoader.Find(old.BandId, old.ThrowAt.Test, old.ThrowAt.Raw);
            if (c != null)
            {
                var raws = new Dictionary<string, int?>(s.Raw) { [c.Test] = c.EquivalentRaw };
                corrected = RunCore(s with { Raw = raws });
            }
        }
        return new ScenarioResult(s.Id, old, corrected);
    }

    static OldResult RunCore(Scenario s)
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

    // Extra seeded cases forced into the correction's band with the gap raw (only used when no random case hits one).
    public static List<Scenario> GenerateForced(int count, int firstIndex)
    {
        var c = CorrectionsLoader.All[0];
        var band = Catalog.Bands.Single(b => b.Id == c.Band);
        var rng = new Random(Catalog.Seed + 1);
        var first = new DateTime(2018, 1, 1);
        int span = (new DateTime(2026, 12, 31) - first).Days;
        int minDays = Catalog.DaysFor(band.Year, 6, 0), maxDays = Catalog.DaysFor(band.Year, 11, 30);
        var list = new List<Scenario>();
        for (int i = 0; i < count; i++)
        {
            var test = first.AddDays(rng.Next(0, span + 1));
            var birth = test.AddDays(-rng.Next(minDays, maxDays + 1));
            var probe = NewViewModel(Catalog.DetermineAgeFrom(test, birth));
            var raw = new Dictionary<string, int?>();
            foreach (var type in Catalog.RowOrder)
            {
                bool omit = !Catalog.Standardizer.GetTestDescriptor(type).Mandatory && rng.NextDouble() < 0.25;
                var t = probe.StanderdizationPhase[type.ToString()];
                int v = rng.Next(t.MinRawResult!.Value, t.MaxRawResult!.Value + 1);
                raw[type.ToString()] = omit ? null : v;
            }
            raw[c.Test] = c.Raw;
            list.Add(new Scenario($"f{firstIndex + i:00000}", Catalog.Iso(test), Catalog.Iso(birth), raw));
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

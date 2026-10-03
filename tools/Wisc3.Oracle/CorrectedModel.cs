using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Silvestre.Psychology.Tools.WISC3;
using Silvestre.Psychology.Tools.WISC3.Calculator;
using Silvestre.Psychology.Tools.WISC3.ViewModels;
using Silvestre.Psychology.Tools.WISC3.ViewModels.Charts;

namespace Wisc3.Oracle;

// Computes the outcome of a case with the user-approved corrections applied, without touching src/ (see plan REV-4).
// Charts of the corrected scaled values are rebuilt by hand in the layout of the old chart view models; the same code
// reproduces the old charts exactly for every case without a correction hit (checked on every call).
public static class CorrectedModel
{
    static readonly PtResxLocalizer Localizer = new();
    static readonly IQICalculator Calc = WISC3Test.QICalculator(Catalog.Country);
    static readonly Dictionary<string, bool> Mandatory = Catalog.RowOrder.ToDictionary(t => t.ToString(), t => Catalog.Standardizer.GetTestDescriptor(t).Mandatory);
    static readonly Dictionary<string, int> FileOrder = CorrectionsLoader.All.Select((c, i) => (c.Id, i)).ToDictionary(x => x.Id, x => x.i);

    static Func<short, CalculatedIndexResult?> CalcFor(string index) => index switch
    {
        "verbal" => Calc.CalculateVerbalQI,
        "realization" => Calc.CalculateRealizationQI,
        "completeScale" => Calc.CalculateCompleteScaleQI,
        "verbalComprehension" => Calc.CalculateVerbalComprehensionQI,
        "perceptiveOrganization" => Calc.CalculatePerceptiveOrganizationQI,
        "processingVelocity" => Calc.CalculateProcessingVelocityQI,
        _ => throw new InvalidOperationException(index)
    };

    static bool StrictlySupported(int[]? a) =>
        a != null && string.Join(",", a.Select(x => x.ToString("D3"))).CompareTo("006,000,000") >= 0 && string.Join(",", a.Select(x => x.ToString("D3"))).CompareTo("017,000,000") < 0;

    static JsonNode? Node(IEnumerable<short?> values) => new JsonArray(values.Select(v => v == null ? null : (JsonNode)JsonValue.Create(v.Value)).ToArray());

    // Returns (corrected result, ids hit). The result is meaningful only when the id list is not empty.
    public static (OldResult? corrected, List<string> hits) Compute(Scenario s, OldResult old)
    {
        var none = (default(OldResult), new List<string>());
        if (!StrictlySupported(old.Age)) return none;
        var hits = new HashSet<string>();
        var b = old;
        var raws = new Dictionary<string, int?>(s.Raw);
        if (old.Throws)
        {
            if (old.ThrowStage != "raw" || old.ThrowAt == null) return none;
            var hit = CorrectionsLoader.FindScaled(old.BandId, old.ThrowAt.Test, old.ThrowAt.Raw);
            if (hit == null || !hit.Value.cell.OldThrows) return none;
            raws[old.ThrowAt.Test] = hit.Value.c.EquivalentRaw!.Value;
            b = ScenarioDriver.RunCore(s with { Raw = raws });
            hits.Add(hit.Value.c.Id);
            if (b.Throws) return (b, Ordered(hits));
        }

        // scaled cells
        var tests = new Dictionary<string, OldTest>();
        foreach (var type in Catalog.RowOrder)
        {
            var id = type.ToString();
            var t = b.Tests![id];
            var scaled = (int?[])t.Scaled.Clone();
            if (raws.TryGetValue(id, out var raw) && raw != null && !t.OutOfBounds)
            {
                var hit = CorrectionsLoader.FindScaled(b.BandId, id, raw.Value);
                if (hit != null && !hit.Value.cell.OldThrows)
                {
                    var (c, cell) = hit.Value;
                    for (int i = 0; i < 5; i++)
                    {
                        if (scaled[i] == null) continue;
                        if (scaled[i] != cell.OldInt) throw new InvalidOperationException($"{c.Id}: {s.Id} {id} raw {raw} column {i} is {scaled[i]}, expected {cell.OldInt}");
                        scaled[i] = cell.NewInt;
                    }
                    hits.Add(c.Id);
                }
            }
            tests[id] = t with { Scaled = scaled };
        }

        // sums (VM rules, WISC3StanderdizationViewModel.cs:27-35)
        int Sum(int col, bool mandatoryOnly) => Catalog.RowOrder.Sum(type => (!mandatoryOnly || Mandatory[type.ToString()]) ? tests[type.ToString()].Scaled[col] ?? 0 : 0);
        var verbal = Sum(0, true);
        var realization = Sum(1, true);
        var sums = new Dictionary<string, int>
        {
            ["verbal"] = verbal,
            ["realization"] = realization,
            ["verbalComprehension"] = Sum(2, false),
            ["perceptiveOrganization"] = Sum(3, false),
            ["processingVelocity"] = Sum(4, false),
            ["complete"] = verbal + realization
        };

        // indices
        var indexHits = new HashSet<string>();
        var vms = new List<WISC3CalculatedQIViewModel>();
        var indices = new Dictionary<string, OldIndex?>();
        foreach (var key in Catalog.IndexNames)
        {
            var calc = CalcFor(key);
            var vm = new WISC3CalculatedQIViewModel(char.ToUpperInvariant(key[0]) + key[1..], sum =>
            {
                var r = CorrectionsLoader.PatchIndex(key, sum, calc(sum), out var ids);
                foreach (var id in ids) indexHits.Add(id);
                return r;
            });
            vms.Add(vm);
            if (!b.IndicesShown) { indices[key] = null; continue; }
            vm.StandardResult = (short)(key == "completeScale" ? sums["complete"] : sums[key]);
            indices[key] = new OldIndex(vm.StandardResult, vm.IndexQI,
                vm.Percentil?.ToString(CultureInfo.InvariantCulture),
                vm.ConfidenceInterval90 == null ? null : new int[] { vm.ConfidenceInterval90.Value.LowerBound, vm.ConfidenceInterval90.Value.UpperBound },
                vm.ConfidenceInterval95 == null ? null : new int[] { vm.ConfidenceInterval95.Value.LowerBound, vm.ConfidenceInterval95.Value.UpperBound },
                vm.AverageComparisonResult?.ToString());
        }
        foreach (var id in indexHits) hits.Add(id);

        // charts
        JsonNode? charts = null;
        if (b.IndicesShown)
        {
            short? Col(string id, int col) => (short?)tests[id].Scaled[col];
            var standardResults = new JsonObject
            {
                ["Labels"] = new JsonArray(new[] { "Inf", "Sem", "Ari", "Voc", "Com", "MD", "CG", "Cd", "DG", "Cb", "CO", "PS", "Lb" }.Select(x => (JsonNode?)x).ToArray()),
                ["Verbal"] = Node(new short?[] { Col("Information", 0), Col("Similarities", 0), Col("Arithmetic", 0), Col("Vocabulary", 0), Col("Comprehension", 0), Col("DigitMemory", 0), null, null, null, null, null, null, null }),
                ["Realization"] = Node(new short?[] { null, null, null, null, null, null, Col("ImageCompletion", 1), Col("Code", 1), Col("ImageDisposition", 1), Col("Cubes", 1), Col("ObjectComposition", 1), Col("SymbolSearch", 1), Col("Labyrinth", 1) })
            };
            var factorial = new JsonObject
            {
                ["Labels"] = new JsonArray(new[] { "Inf", "Sem", "Voc", "Com", "CG", "DG", "Cb", "CO", "Cd", "PS" }.Select(x => (JsonNode?)x).ToArray()),
                ["VerbalComprehension"] = Node(new short?[] { Col("Information", 2), Col("Similarities", 2), Col("Vocabulary", 2), Col("Comprehension", 2), null, null, null, null, null, null, null, null, null }),
                ["PerceptiveOrganization"] = Node(new short?[] { null, null, null, null, Col("ImageCompletion", 1), Col("ImageDisposition", 1), Col("Cubes", 1), Col("ObjectComposition", 1), null, null }),
                ["ProcessingVelocity"] = Node(new short?[] { null, null, null, null, null, null, null, null, Col("Code", 1), Col("SymbolSearch", 1) })
            };
            charts = new JsonObject
            {
                ["standardResults"] = standardResults,
                ["factorial"] = factorial,
                ["qi"] = JsonSerializer.SerializeToNode(new WISC3QiIndicesChartViewModel(Localizer, vms[0], vms[1], vms[2], vms[3], vms[4], vms[5]), Json.Options)
            };
        }

        var corrected = b with { Tests = tests, Sums = sums, Indices = indices, Charts = charts };
        if (hits.Count == 0)
        {
            // Self-check of the rebuild: without a correction hit the result must equal the old one.
            if (JsonSerializer.Serialize(corrected.Sums, Json.Options) != JsonSerializer.Serialize(old.Sums, Json.Options)
                || JsonSerializer.Serialize(corrected.Indices, Json.Options) != JsonSerializer.Serialize(old.Indices, Json.Options)
                || !JsonNode.DeepEquals(corrected.Charts, old.Charts)
                || JsonSerializer.Serialize(corrected.Tests, Json.Options) != JsonSerializer.Serialize(old.Tests, Json.Options))
                throw new InvalidOperationException($"corrected-model rebuild differs from the old result for {s.Id} without a correction hit");
            return (null, new List<string>());
        }
        return (corrected, Ordered(hits));
    }

    static List<string> Ordered(IEnumerable<string> ids) => ids.OrderBy(i => FileOrder[i]).ToList();
}

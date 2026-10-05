using System.Globalization;
using System.Text.Json;
using Silvestre.Psychology.Tools.WISC3.Calculator;

namespace Wisc3.Oracle;

// The tables of the old app as they were BEFORE the REV-11 fix of the 7 table files in src/, read from the frozen
// golden-original/ (never regenerated). Since REV-11 the live reflection of src/ is the fixed app, so everything that
// needs the original values (corrections validation, emit-data diff, corrections.json) takes them from here.
public static class OriginalTables
{
    public sealed record IndexRow(int Sum, bool InTable, int? Iq, string? Percentile, int[]? Ci90, int[]? Ci95);
    sealed record BandsFile(List<BandData> Bands);

    static string Dir => Path.Combine(CorrectionsLoader.RepoRoot(), "tools", "Wisc3.Oracle", "golden-original");

    static T Read<T>(string file) => JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(Dir, file)), Json.Options)!;

    static List<BandData>? _bands;
    public static List<BandData> Bands => _bands ??= Read<BandsFile>("subtests.json").Bands;

    static Dictionary<string, List<IndexRow>>? _indices;
    public static Dictionary<string, List<IndexRow>> Indices => _indices ??= Read<Dictionary<string, List<IndexRow>>>("indices.json");

    public static BandData Band(string id) => Bands.Single(b => b.Id == id);
    public static TestBand Test(string bandId, string testId) => Band(bandId).Tests[testId];

    public static List<(string band, string test, int raw)> Gaps =>
        Bands.SelectMany(b => b.Tests.SelectMany(t => t.Value.Gaps.Select(g => (b.Id, t.Key, g)))).ToList();

    public static IndexRow Index(string name, int sum) => Indices[name].Single(r => r.Sum == sum);

    // The original result of a key of an index table, in the type the live calculators return.
    public static CalculatedIndexResult IndexResult(string name, int sum)
    {
        var r = Index(name, sum);
        if (!r.InTable) throw new InvalidOperationException($"{name}/{sum} is not an original key");
        return new CalculatedIndexResult((short)r.Iq!.Value, decimal.Parse(r.Percentile!, CultureInfo.InvariantCulture),
            ((short)r.Ci90![0], (short)r.Ci90[1]), ((short)r.Ci95![0], (short)r.Ci95[1]));
    }

    static string FirstScaled(int?[] row) => Catalog.IsGap(row) ? "throws" : row.Skip(1).First(v => v != null)!.Value.ToString(CultureInfo.InvariantCulture);

    // fixedVsOriginal: cell-level diff of the live (fixed) tables against golden-original. Scaled cells are raw rows
    // "band|test|raw|old|new"; index cells are "index|sum|field|old|new". other counts every other kind of difference
    // (bounds, out-of-range flags, row counts, key sets, rows that are not single-valued).
    public static (SortedSet<string> scaled, SortedSet<string> index, List<string> other) FixedVsOriginal()
    {
        var scaled = new SortedSet<string>(StringComparer.Ordinal);
        var index = new SortedSet<string>(StringComparer.Ordinal);
        var other = new List<string>();
        var inv = CultureInfo.InvariantCulture;
        if (Catalog.Bands.Count != Bands.Count) other.Add("band count");
        foreach (var band in Catalog.Bands)
        {
            var ob = Band(band.Id);
            foreach (var (testId, tb) in band.Tests)
            {
                var ot = ob.Tests[testId];
                if (tb.Min != ot.Min || tb.Max != ot.Max || tb.BelowMinThrows != ot.BelowMinThrows || tb.AboveMaxThrows != ot.AboveMaxThrows)
                    other.Add($"{band.Id}|{testId}|bounds");
                if (tb.Rows.Count != ot.Rows.Count) { other.Add($"{band.Id}|{testId}|row count"); continue; }
                for (int i = 0; i < tb.Rows.Count; i++)
                {
                    var n = tb.Rows[i];
                    var o = ot.Rows[i];
                    if (n.SequenceEqual(o)) continue;
                    var nv = n.Skip(1).Where(v => v != null).Distinct().Count();
                    var ov = o.Skip(1).Where(v => v != null).Distinct().Count();
                    if (n[0] != o[0] || nv > 1 || ov > 1) { other.Add($"{band.Id}|{testId}|{o[0]}|row shape"); continue; }
                    scaled.Add($"{band.Id}|{testId}|{o[0]}|{FirstScaled(o)}|{FirstScaled(n)}");
                }
            }
        }
        foreach (var idx in Catalog.Indices())
        {
            var orows = Indices[idx.Name];
            if (idx.Keys.Max() + 11 != orows.Count) other.Add($"{idx.Name}|row count");
            for (int sum = 0; sum <= idx.Keys.Max() + 10 && sum < orows.Count; sum++)
            {
                var o = orows[sum];
                bool inTable = idx.Keys.Contains((short)sum);
                if (inTable != o.InTable) { other.Add($"{idx.Name}|{sum}|inTable"); continue; }
                if (!inTable) continue;
                var n = idx.Calculate((short)sum)!;
                void Cmp(string field, string a, string b) { if (a != b) index.Add($"{idx.Name}|{sum}|{field}|{a}|{b}"); }
                Cmp("iq", o.Iq!.Value.ToString(inv), n.Value.ToString(inv));
                Cmp("percentile", o.Percentile!, n.Percentil.ToString(inv));
                Cmp("ci90Lower", o.Ci90![0].ToString(inv), n.ConfidenceInterval90.BottomBoundary.ToString(inv));
                Cmp("ci90Upper", o.Ci90[1].ToString(inv), n.ConfidenceInterval90.TopBoundary.ToString(inv));
                Cmp("ci95Lower", o.Ci95![0].ToString(inv), n.ConfidenceInterval95.BottomBoundary.ToString(inv));
                Cmp("ci95Upper", o.Ci95[1].ToString(inv), n.ConfidenceInterval95.TopBoundary.ToString(inv));
            }
        }
        return (scaled, index, other);
    }

    // fixedVsData: the live tables against the original tables with the approved corrections applied (= what emit-data writes to data/).
    public static (List<string> scaled, List<string> index) FixedVsData()
    {
        var scaled = new List<string>();
        var index = new List<string>();
        var inv = CultureInfo.InvariantCulture;
        foreach (var band in Catalog.Bands)
            foreach (var (testId, tb) in band.Tests)
            {
                var patched = CorrectionsLoader.PatchedRows(band.Id, testId);
                for (int i = 0; i < tb.Rows.Count; i++)
                    if (!tb.Rows[i].SequenceEqual(patched[i])) scaled.Add($"{band.Id}|{testId}|{tb.Rows[i][0]}");
            }
        foreach (var idx in Catalog.Indices())
            foreach (var key in idx.Keys)
            {
                var p = CorrectionsLoader.PatchIndex(idx.Name, key, IndexResult(idx.Name, key), out _)!;
                var n = idx.Calculate(key)!;
                if (p.Value != n.Value || p.Percentil != n.Percentil
                    || p.ConfidenceInterval90.BottomBoundary != n.ConfidenceInterval90.BottomBoundary || p.ConfidenceInterval90.TopBoundary != n.ConfidenceInterval90.TopBoundary
                    || p.ConfidenceInterval95.BottomBoundary != n.ConfidenceInterval95.BottomBoundary || p.ConfidenceInterval95.TopBoundary != n.ConfidenceInterval95.TopBoundary)
                    index.Add($"{idx.Name}|{key}");
            }
        return (scaled, index);
    }
}

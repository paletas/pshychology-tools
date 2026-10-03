using System.Globalization;
using System.Text.Json;
using Silvestre.Psychology.Tools.WISC3.Calculator;

namespace Wisc3.Oracle;

public sealed class CorrectionCell
{
    public int Raw { get; set; }
    public int Sum { get; set; }
    public JsonElement Old { get; set; }
    public JsonElement New { get; set; }

    public bool OldThrows => Old.ValueKind == JsonValueKind.String;
    public int NewInt => New.GetInt32();
    public int OldInt => Old.GetInt32();
}

public sealed class Correction
{
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Table { get; set; } = "";
    public string? Band { get; set; }
    public string? Test { get; set; }
    public string? Index { get; set; }
    public string? Field { get; set; }
    public List<CorrectionCell> Cells { get; set; } = new();
    public int? EquivalentRaw { get; set; }
    public string OldSource { get; set; } = "";
    public string Source { get; set; } = "";
    public string Approval { get; set; } = "";
}

public sealed class CorrectionsFile
{
    public int SchemaVersion { get; set; }
    public List<Correction> Corrections { get; set; } = new();
}

// Hand-written, user-approved corrections (data/corrections/wisc3-pt.json, schema v2): scaled cells and index fields.
public static class CorrectionsLoader
{
    public static readonly string[] IndexFields = { "iq", "percentile", "ci95Lower", "ci95Upper" };

    public static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "Silvestre.Psychology.sln"))) dir = dir.Parent;
        if (dir == null) throw new InvalidOperationException("Silvestre.Psychology.sln not found above " + AppContext.BaseDirectory);
        return dir.FullName;
    }

    static List<Correction>? _all;
    public static List<Correction> All => _all ??= Load();
    public static IEnumerable<Correction> Scaled => All.Where(c => c.Kind == "scaled");
    public static IEnumerable<Correction> IndexCorrections => All.Where(c => c.Kind == "index");
    public static int ScaledCellCount => Scaled.Sum(c => c.Cells.Count);
    public static int IndexCellCount => IndexCorrections.Sum(c => c.Cells.Count);

    static List<Correction> Load()
    {
        var path = Path.Combine(RepoRoot(), "data", "corrections", "wisc3-pt.json");
        var file = JsonSerializer.Deserialize<CorrectionsFile>(File.ReadAllText(path), Json.Options)!;
        if (file.SchemaVersion != 2) throw new InvalidOperationException("corrections file schemaVersion must be 2");
        return file.Corrections;
    }

    public static (Correction c, CorrectionCell cell)? FindScaled(string? band, string test, int raw)
    {
        foreach (var c in Scaled)
            if (c.Band == band && c.Test == test)
                foreach (var cell in c.Cells)
                    if (cell.Raw == raw) return (c, cell);
        return null;
    }

    // Rows of a test in a band with the scaled corrections applied (a gap row takes the value of equivalentRaw's columns).
    public static List<int?[]> PatchedRows(BandData band, string testId)
    {
        var tb = band.Tests[testId];
        var rows = new List<int?[]>();
        foreach (var oldRow in tb.Rows)
        {
            var row = (int?[])oldRow.Clone();
            var hit = FindScaled(band.Id, testId, row[0]!.Value);
            if (hit != null)
            {
                var (c, cell) = hit.Value;
                int nv = cell.NewInt;
                if (Catalog.IsGap(row))
                {
                    var eq = tb.Rows.Single(r => r[0] == c.EquivalentRaw);
                    for (int i = 1; i <= 5; i++) row[i] = eq[i] == null ? null : nv;
                }
                else
                    for (int i = 1; i <= 5; i++) if (row[i] != null) row[i] = nv;
            }
            rows.Add(row);
        }
        return rows;
    }

    // Applies the index corrections that match (index, sum) to the old result; ids lists the corrections applied.
    public static CalculatedIndexResult? PatchIndex(string index, short sum, CalculatedIndexResult? r, out List<string> ids)
    {
        ids = new List<string>();
        if (r == null) return null;
        short iq = r.Value;
        decimal pct = r.Percentil;
        short lo95 = r.ConfidenceInterval95.BottomBoundary, hi95 = r.ConfidenceInterval95.TopBoundary;
        foreach (var c in IndexCorrections.Where(c => c.Index == index))
            foreach (var cell in c.Cells.Where(x => x.Sum == sum))
            {
                switch (c.Field)
                {
                    case "iq": iq = (short)cell.NewInt; break;
                    case "percentile": pct = cell.New.GetDecimal(); break;
                    case "ci95Lower": lo95 = (short)cell.NewInt; break;
                    case "ci95Upper": hi95 = (short)cell.NewInt; break;
                    default: throw new InvalidOperationException($"{c.Id}: unknown field {c.Field}");
                }
                ids.Add(c.Id);
            }
        return ids.Count == 0 ? r : new CalculatedIndexResult(iq, pct, r.ConfidenceInterval90, (lo95, hi95));
    }

    public static string IndexFieldOld(CalculatedIndexResult r, string field) => field switch
    {
        "iq" => r.Value.ToString(CultureInfo.InvariantCulture),
        "percentile" => r.Percentil.ToString(CultureInfo.InvariantCulture),
        "ci95Lower" => r.ConfidenceInterval95.BottomBoundary.ToString(CultureInfo.InvariantCulture),
        "ci95Upper" => r.ConfidenceInterval95.TopBoundary.ToString(CultureInfo.InvariantCulture),
        _ => throw new InvalidOperationException("unknown field " + field)
    };

    public static string CellNewText(Correction c, CorrectionCell cell) =>
        c.Field == "percentile" ? cell.New.GetDecimal().ToString(CultureInfo.InvariantCulture) : cell.New.GetInt32().ToString(CultureInfo.InvariantCulture);

    // Returns a list of failure messages (empty when all assertions hold).
    public static List<string> Validate()
    {
        var errors = new List<string>();
        var st = Catalog.Standardizer;
        var ids = new HashSet<string>();
        foreach (var c in All) if (!ids.Add(c.Id)) errors.Add($"{c.Id}: duplicate id");

        // scaled corrections: old value equals the reflected C# value; C1 'throws' matches the recorded gap
        foreach (var c in Scaled)
        {
            var band = Catalog.Bands.SingleOrDefault(b => b.Id == c.Band);
            if (band == null || c.Test == null || !band.Tests.TryGetValue(c.Test, out var tb)) { errors.Add($"{c.Id}: unknown band/test {c.Band}/{c.Test}"); continue; }
            var age = new Silvestre.Psychology.Tools.WISC3.Age(band.Age[0], band.Age[1], band.Age[2]);
            var type = Enum.Parse<Silvestre.Psychology.Tools.WISC3.TestTypeEnum>(c.Test);
            foreach (var cell in c.Cells)
            {
                bool throws;
                try { st.Standerdization(type, age, (short)cell.Raw); throws = false; } catch (ArgumentOutOfRangeException) { throws = true; }
                var row = tb.Rows.FirstOrDefault(r => r[0] == cell.Raw);
                if (row == null) { errors.Add($"{c.Id}: raw {cell.Raw} outside {band.Id}/{c.Test} bounds"); continue; }
                if (cell.OldThrows)
                {
                    if (!throws) errors.Add($"{c.Id}: old code does not throw for {c.Band} {c.Test} raw {cell.Raw}");
                    var eq = tb.Rows.FirstOrDefault(r => r[0] == c.EquivalentRaw);
                    var eqVals = eq?.Skip(1).Where(v => v != null).Select(v => v!.Value).Distinct().ToList();
                    if (eqVals == null || eqVals.Count != 1 || eqVals[0] != cell.NewInt) errors.Add($"{c.Id}: equivalentRaw {c.EquivalentRaw} does not map to scaled {cell.NewInt}");
                }
                else
                {
                    if (throws) errors.Add($"{c.Id}: old code throws for {c.Band} {c.Test} raw {cell.Raw} but old is not 'throws'");
                    var vals = row.Skip(1).Where(v => v != null).Select(v => v!.Value).Distinct().ToList();
                    if (vals.Count != 1 || vals[0] != cell.OldInt) errors.Add($"{c.Id}: {c.Band} {c.Test} raw {cell.Raw}: old code gives [{string.Join(",", vals)}], file says {cell.OldInt}");
                    if (cell.NewInt == cell.OldInt) errors.Add($"{c.Id}: new equals old for raw {cell.Raw}");
                }
            }
        }

        // after applying: no gap, non-decreasing in raw, contiguous over min..max, one scaled value per row, 1..19
        foreach (var band in Catalog.Bands)
            foreach (var (testId, tb) in band.Tests)
            {
                var rows = PatchedRows(band, testId);
                int? prev = null;
                int expected = tb.Min;
                foreach (var row in rows)
                {
                    if (row[0] != expected++) errors.Add($"{band.Id}/{testId}: raw sequence broken at {row[0]}");
                    var vals = row.Skip(1).Where(v => v != null).Select(v => v!.Value).Distinct().ToList();
                    if (vals.Count != 1) { errors.Add($"{band.Id}/{testId}: raw {row[0]} has {vals.Count} scaled values after corrections"); continue; }
                    if (vals[0] < 1 || vals[0] > 19) errors.Add($"{band.Id}/{testId}: raw {row[0]} scaled {vals[0]} outside 1..19");
                    if (prev != null && vals[0] < prev) errors.Add($"{band.Id}/{testId}: scaled decreases at raw {row[0]} ({prev} -> {vals[0]})");
                    prev = vals[0];
                }
            }

        // index corrections: old equals the reflected C# value, CI95 contains CI90 after applying
        var indices = Catalog.Indices().ToDictionary(i => i.Name);
        foreach (var c in IndexCorrections)
        {
            if (c.Index == null || !indices.TryGetValue(c.Index, out var idx)) { errors.Add($"{c.Id}: unknown index {c.Index}"); continue; }
            if (c.Field == null || !IndexFields.Contains(c.Field)) { errors.Add($"{c.Id}: unknown field {c.Field}"); continue; }
            foreach (var cell in c.Cells)
            {
                if (!idx.Keys.Contains((short)cell.Sum)) { errors.Add($"{c.Id}: sum {cell.Sum} is not a key of {c.Index}"); continue; }
                var r = idx.Calculate((short)cell.Sum)!;
                var oldText = IndexFieldOld(r, c.Field);
                var fileOld = c.Field == "percentile" ? cell.Old.GetDecimal().ToString(CultureInfo.InvariantCulture) : cell.Old.GetInt32().ToString(CultureInfo.InvariantCulture);
                if (oldText != fileOld) errors.Add($"{c.Id}: {c.Index}/{cell.Sum}.{c.Field} old code gives {oldText}, file says {fileOld}");
                if (oldText == CellNewText(c, cell)) errors.Add($"{c.Id}: new equals old for {c.Index}/{cell.Sum}");
                var p = PatchIndex(c.Index, (short)cell.Sum, r, out _)!;
                if (!(p.ConfidenceInterval95.BottomBoundary <= p.ConfidenceInterval90.BottomBoundary && p.ConfidenceInterval95.TopBoundary >= p.ConfidenceInterval90.TopBoundary))
                    errors.Add($"{c.Id}: {c.Index}/{cell.Sum}: CI95 [{p.ConfidenceInterval95.BottomBoundary},{p.ConfidenceInterval95.TopBoundary}] does not contain CI90 [{p.ConfidenceInterval90.BottomBoundary},{p.ConfidenceInterval90.TopBoundary}]");
                if (c.Id == "D8" && r.ConfidenceInterval95.BottomBoundary != r.ConfidenceInterval90.BottomBoundary)
                    errors.Add($"D8: {c.Index}/{cell.Sum}: old CI95 lower {r.ConfidenceInterval95.BottomBoundary} != old CI90 lower {r.ConfidenceInterval90.BottomBoundary}");
            }
        }
        return errors;
    }
}

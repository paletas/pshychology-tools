using System.Text.Json;

namespace Wisc3.Oracle;

public sealed record Correction(
    string Id, string Band, string Test, int Raw, string Old, int Scaled, int EquivalentRaw,
    string OldSource, string Source, string ConfirmedBy, string ConfirmedOn);

public sealed record CorrectionsFile(List<Correction> Corrections);

// Hand-written, manual-confirmed table corrections (data/corrections/wisc3-pt.json).
public static class CorrectionsLoader
{
    public static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "Silvestre.Psychology.sln"))) dir = dir.Parent;
        if (dir == null) throw new InvalidOperationException("Silvestre.Psychology.sln not found above " + AppContext.BaseDirectory);
        return dir.FullName;
    }

    static List<Correction>? _all;
    public static List<Correction> All => _all ??= Load();

    static List<Correction> Load()
    {
        var path = Path.Combine(RepoRoot(), "data", "corrections", "wisc3-pt.json");
        return JsonSerializer.Deserialize<CorrectionsFile>(File.ReadAllText(path), Json.Options)!.Corrections;
    }

    public static Correction? Find(string? band, string test, int raw) =>
        All.FirstOrDefault(c => c.Band == band && c.Test == test && c.Raw == raw);

    // Returns a list of failure messages (empty when all assertions hold).
    public static List<string> Validate()
    {
        var errors = new List<string>();
        var st = Catalog.Standardizer;
        foreach (var c in All)
        {
            var band = Catalog.Bands.SingleOrDefault(b => b.Id == c.Band);
            if (band == null || !band.Tests.TryGetValue(c.Test, out var tb)) { errors.Add($"{c.Id}: unknown band/test {c.Band}/{c.Test}"); continue; }
            var age = new Silvestre.Psychology.Tools.WISC3.Age(band.Age[0], band.Age[1], band.Age[2]);
            var type = Enum.Parse<Silvestre.Psychology.Tools.WISC3.TestTypeEnum>(c.Test);
            bool throws;
            try { st.Standerdization(type, age, (short)c.Raw); throws = false; } catch (ArgumentOutOfRangeException) { throws = true; }
            if (!throws) errors.Add($"{c.Id}: old code does not throw for {c.Band} {c.Test} raw {c.Raw}");
            var eq = tb.Rows.FirstOrDefault(r => r[0] == c.EquivalentRaw);
            var eqVals = eq?.Skip(1).Where(v => v != null).Select(v => v!.Value).Distinct().ToList();
            if (eqVals == null || eqVals.Count != 1 || eqVals[0] != c.Scaled) errors.Add($"{c.Id}: equivalentRaw {c.EquivalentRaw} does not map to scaled {c.Scaled}");
            foreach (var n in new[] { c.Raw - 1, c.Raw + 1 })
            {
                var row = tb.Rows.FirstOrDefault(r => r[0] == n);
                var v = row?.Skip(1).FirstOrDefault(x => x != null);
                if (v == null) continue;
                if (n < c.Raw ? v > c.Scaled : v < c.Scaled) errors.Add($"{c.Id}: monotonicity broken against raw {n} (scaled {v})");
            }
        }
        return errors;
    }
}

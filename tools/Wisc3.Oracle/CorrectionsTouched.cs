using System.Globalization;

namespace Wisc3.Oracle;

// Which approved corrections a case lands on (REV-11). The old app already contains the corrections, so there is no
// separate corrected outcome any more: this only records the ids (a raw on a corrected scaled cell, or a shown index whose
// sum is a corrected sum) so the harness can prove every id is exercised, and checks that the live value is the corrected one.
public static class CorrectionsTouched
{
    static readonly Dictionary<string, int> FileOrder = CorrectionsLoader.All.Select((c, i) => (c.Id, i)).ToDictionary(x => x.Id, x => x.i);

    static bool StrictlySupported(int[]? a) =>
        a != null && string.Join(",", a.Select(x => x.ToString("D3"))).CompareTo("006,000,000") >= 0 && string.Join(",", a.Select(x => x.ToString("D3"))).CompareTo("017,000,000") < 0;

    public static List<string> Compute(Scenario s, OldResult old)
    {
        var hits = new HashSet<string>();
        if (old.Throws || !StrictlySupported(old.Age)) return new List<string>();

        foreach (var type in Catalog.RowOrder)
        {
            var id = type.ToString();
            var t = old.Tests![id];
            if (!s.Raw.TryGetValue(id, out var raw) || raw == null || t.OutOfBounds) continue;
            var hit = CorrectionsLoader.FindScaled(old.BandId, id, raw.Value);
            if (hit == null) continue;
            var (c, cell) = hit.Value;
            foreach (var v in t.Scaled)
                if (v != null && v != cell.NewInt) throw new InvalidOperationException($"{c.Id}: {s.Id} {id} raw {raw} is {v}, expected the corrected {cell.NewInt}");
            hits.Add(c.Id);
        }

        if (old.IndicesShown)
            foreach (var (name, entry) in old.Indices!)
            {
                if (entry?.Sum == null) continue;
                foreach (var c in CorrectionsLoader.IndexCorrections.Where(c => c.Index == name))
                    foreach (var cell in c.Cells.Where(x => x.Sum == entry.Sum))
                    {
                        var p = CorrectionsLoader.PatchIndex(name, (short)cell.Sum, OriginalTables.IndexResult(name, cell.Sum), out _)!;
                        var live = c.Field switch
                        {
                            "iq" => entry.Iq?.ToString(CultureInfo.InvariantCulture),
                            "percentile" => entry.Percentile,
                            "ci95Lower" => entry.Ci95?[0].ToString(CultureInfo.InvariantCulture),
                            "ci95Upper" => entry.Ci95?[1].ToString(CultureInfo.InvariantCulture),
                            _ => throw new InvalidOperationException($"{c.Id}: unknown field {c.Field}")
                        };
                        if (live != CorrectionsLoader.IndexFieldOld(p, c.Field!)) throw new InvalidOperationException($"{c.Id}: {s.Id} {name}/{cell.Sum}.{c.Field} is {live}, expected the corrected value");
                        hits.Add(c.Id);
                    }
            }
        return hits.OrderBy(i => FileOrder[i]).ToList();
    }
}

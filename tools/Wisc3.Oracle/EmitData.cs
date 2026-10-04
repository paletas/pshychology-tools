using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Wisc3.Oracle;

// Writes the data/wisc3-pt files from the same enumerations as `golden`. Formatting is done afterwards by web/scripts/format-data.mjs.
public static class EmitData
{
    public const string DataVersion = "2026.10.03-2";

    static void WriteJson(string path, Action<Utf8JsonWriter> body)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms, new JsonWriterOptions { Indented = false, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
            body(w);
        File.WriteAllBytes(path, ms.ToArray());
    }

    static void WriteIntArray(Utf8JsonWriter w, params int[] values)
    {
        w.WriteStartArray();
        foreach (var v in values) w.WriteNumberValue(v);
        w.WriteEndArray();
    }

    // Columns (non-null TestResult fields) of a test; must be identical for every row of every band.
    static string[] ColumnsOf(string testId, out bool ok)
    {
        ok = true;
        string[]? columns = null;
        foreach (var band in Catalog.Bands)
            foreach (var row in band.Tests[testId].Rows)
            {
                if (Catalog.IsGap(row)) continue;
                var cols = Enumerable.Range(0, 5).Where(i => row[i + 1] != null).Select(i => Catalog.ColumnNames[i]).ToArray();
                columns ??= cols;
                if (!cols.SequenceEqual(columns)) ok = false;
            }
        return columns!;
    }

    public static int Run(string outDir)
    {
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        var bands = Catalog.Bands;
        var correctionErrors = CorrectionsLoader.Validate();
        if (correctionErrors.Count != 0) { foreach (var e in correctionErrors) Console.Error.WriteLine(e); return 1; }
        var tests = Catalog.RowOrder.Select(t => t.ToString()).ToList();

        // tests.json
        var columns = new Dictionary<string, string[]>();
        foreach (var id in tests)
        {
            columns[id] = ColumnsOf(id, out var ok);
            if (!ok) { Console.Error.WriteLine($"columns of {id} differ between rows or bands"); return 1; }
        }
        WriteJson(Path.Combine(outDir, "tests.json"), w =>
        {
            w.WriteStartArray();
            foreach (var type in Catalog.RowOrder)
            {
                var id = type.ToString();
                w.WriteStartObject();
                w.WriteString("id", id);
                w.WriteBoolean("mandatory", Catalog.Standardizer.GetTestDescriptor(type).Mandatory);
                w.WriteStartArray("columns");
                foreach (var c in columns[id]) w.WriteStringValue(c);
                w.WriteEndArray();
                w.WriteEndObject();
            }
            w.WriteEndArray();
        });

        // version.json
        WriteJson(Path.Combine(outDir, "version.json"), w =>
        {
            w.WriteStartObject();
            w.WriteNumber("schemaVersion", 1);
            w.WriteString("dataVersion", DataVersion);
            w.WriteEndObject();
        });

        // bands.json
        WriteJson(Path.Combine(outDir, "bands.json"), w =>
        {
            w.WriteStartArray();
            foreach (var b in bands)
            {
                w.WriteStartObject();
                w.WriteString("id", b.Id);
                w.WritePropertyName("from"); WriteIntArray(w, b.Year, b.SecondHalf ? 6 : 0, 0);
                w.WritePropertyName("to"); WriteIntArray(w, b.Year, b.SecondHalf ? 11 : 5, 30);
                w.WriteEndObject();
            }
            w.WriteEndArray();
        });

        // subtests/<bandId>.json: ranges inverted from the rows
        foreach (var band in bands)
        {
            var perTest = new Dictionary<string, SortedDictionary<int, (int lo, int hi)>>();
            foreach (var id in tests)
            {
                var tb = band.Tests[id];
                var ranges = new SortedDictionary<int, (int lo, int hi)>();
                int? prevScaled = null;
                foreach (var row in CorrectionsLoader.PatchedRows(band.Id, id))
                {
                    if (Catalog.IsGap(row)) { Console.Error.WriteLine($"{band.Id}/{id}: raw {row[0]} is unmapped and has no correction"); return 1; }
                    var values = row.Skip(1).Where(v => v != null).Select(v => v!.Value).Distinct().ToList();
                    if (values.Count != 1) { Console.Error.WriteLine($"{band.Id}/{id}: raw {row[0]} has differing scaled values"); return 1; }
                    int scaled = values[0], raw = row[0]!.Value;
                    if (ranges.TryGetValue(scaled, out var r))
                    {
                        if (prevScaled != scaled || r.hi + 1 != raw) { Console.Error.WriteLine($"{band.Id}/{id}: scaled {scaled} has non-contiguous raws"); return 1; }
                        ranges[scaled] = (r.lo, raw);
                    }
                    else ranges[scaled] = (raw, raw);
                    prevScaled = scaled;
                }
                perTest[id] = ranges;
            }
            WriteJson(Path.Combine(outDir, "subtests", band.Id + ".json"), w =>
            {
                w.WriteStartObject();
                foreach (var id in tests)
                {
                    var tb = band.Tests[id];
                    w.WritePropertyName(id);
                    w.WriteStartObject();
                    w.WriteNumber("min", tb.Min);
                    w.WriteNumber("max", tb.Max);
                    w.WritePropertyName("scaled");
                    w.WriteStartObject();
                    foreach (var (scaled, r) in perTest[id])
                    {
                        w.WritePropertyName(scaled.ToString(CultureInfo.InvariantCulture));
                        WriteIntArray(w, r.lo, r.hi);
                    }
                    w.WriteEndObject();
                    w.WriteEndObject();
                }
                w.WriteEndObject();
            });
        }

        // indices/<name>.json: only the inTable keys; percentile as the literal of decimal.ToString(InvariantCulture)
        foreach (var idx in Catalog.Indices())
            WriteJson(Path.Combine(outDir, "indices", idx.Name + ".json"), w =>
            {
                w.WriteStartObject();
                foreach (var key in idx.Keys)
                {
                    var r = CorrectionsLoader.PatchIndex(idx.Name, key, OriginalTables.IndexResult(idx.Name, key), out _)!;
                    w.WritePropertyName(key.ToString(CultureInfo.InvariantCulture));
                    w.WriteStartObject();
                    w.WriteNumber("iq", r.Value);
                    w.WritePropertyName("percentile");
                    w.WriteRawValue(r.Percentil.ToString(CultureInfo.InvariantCulture));
                    w.WritePropertyName("ci90"); WriteIntArray(w, r.ConfidenceInterval90.BottomBoundary, r.ConfidenceInterval90.TopBoundary);
                    w.WritePropertyName("ci95"); WriteIntArray(w, r.ConfidenceInterval95.BottomBoundary, r.ConfidenceInterval95.TopBoundary);
                    w.WriteEndObject();
                }
                w.WriteEndObject();
            });

        // The cell diff between the original tables (golden-original) and the emitted data must be exactly the corrections set.
        var scaledDiff = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var band in bands)
            foreach (var id in tests)
            {
                var tb = OriginalTables.Test(band.Id, id);
                var patched = CorrectionsLoader.PatchedRows(band.Id, id);
                for (int i = 0; i < tb.Rows.Count; i++)
                {
                    var o = tb.Rows[i];
                    var p = patched[i];
                    if (o.SequenceEqual(p)) continue;
                    var oldText = Catalog.IsGap(o) ? "throws" : o.Skip(1).First(v => v != null)!.Value.ToString(CultureInfo.InvariantCulture);
                    scaledDiff.Add($"{band.Id}|{id}|{o[0]}|{oldText}|{p.Skip(1).First(v => v != null)!.Value}");
                }
            }
        var scaledExpected = new SortedSet<string>(CorrectionsLoader.Scaled.SelectMany(c => c.Cells.Select(cell =>
            $"{c.Band}|{c.Test}|{cell.Raw}|{(cell.OldThrows ? "throws" : cell.OldInt.ToString(CultureInfo.InvariantCulture))}|{cell.NewInt}")), StringComparer.Ordinal);
        var indexDiff = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var idx in Catalog.Indices())
            foreach (var key in idx.Keys)
            {
                var o = OriginalTables.IndexResult(idx.Name, key);
                var p = CorrectionsLoader.PatchIndex(idx.Name, key, o, out _)!;
                void Cmp(string field, string a, string b) { if (a != b) indexDiff.Add($"{idx.Name}|{key}|{field}|{a}|{b}"); }
                var inv = CultureInfo.InvariantCulture;
                Cmp("iq", o.Value.ToString(inv), p.Value.ToString(inv));
                Cmp("percentile", o.Percentil.ToString(inv), p.Percentil.ToString(inv));
                Cmp("ci90Lower", o.ConfidenceInterval90.BottomBoundary.ToString(inv), p.ConfidenceInterval90.BottomBoundary.ToString(inv));
                Cmp("ci90Upper", o.ConfidenceInterval90.TopBoundary.ToString(inv), p.ConfidenceInterval90.TopBoundary.ToString(inv));
                Cmp("ci95Lower", o.ConfidenceInterval95.BottomBoundary.ToString(inv), p.ConfidenceInterval95.BottomBoundary.ToString(inv));
                Cmp("ci95Upper", o.ConfidenceInterval95.TopBoundary.ToString(inv), p.ConfidenceInterval95.TopBoundary.ToString(inv));
            }
        var indexExpected = new SortedSet<string>(CorrectionsLoader.IndexCorrections.SelectMany(c => c.Cells.Select(cell =>
            $"{c.Index}|{cell.Sum}|{c.Field}|{(c.Field == "percentile" ? cell.Old.GetDecimal().ToString(CultureInfo.InvariantCulture) : cell.OldInt.ToString(CultureInfo.InvariantCulture))}|{CorrectionsLoader.CellNewText(c, cell)}")), StringComparer.Ordinal);
        Console.WriteLine($"emit-data: scaledDiffCells={scaledDiff.Count} indexDiffCells={indexDiff.Count}");
        if (!scaledDiff.SetEquals(scaledExpected) || !indexDiff.SetEquals(indexExpected))
        {
            Console.Error.WriteLine("emit-data: diff differs from the corrections set");
            foreach (var x in scaledDiff.Except(scaledExpected)) Console.Error.WriteLine("  unexpected scaled change " + x);
            foreach (var x in scaledExpected.Except(scaledDiff)) Console.Error.WriteLine("  missing scaled change " + x);
            foreach (var x in indexDiff.Except(indexExpected)) Console.Error.WriteLine("  unexpected index change " + x);
            foreach (var x in indexExpected.Except(indexDiff)) Console.Error.WriteLine("  missing index change " + x);
            return 1;
        }

        Console.WriteLine($"emit-data: bands={bands.Count} tests={tests.Count} out={outDir}");
        return 0;
    }
}

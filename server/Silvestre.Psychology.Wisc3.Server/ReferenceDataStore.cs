using System.Security.Cryptography;
using System.Text.Json;

namespace Silvestre.Psychology.Wisc3.Server;

public sealed record ReferenceBundle(string DataVersion, int SchemaVersion, string Sha256, byte[] Bytes);

/// <summary>
/// Builds the canonical reference-data bundle from the data directory and rebuilds it whenever
/// any file under the directory changes (max LastWriteTimeUtc differs from the cached value).
/// </summary>
public sealed class ReferenceDataStore
{
    private readonly string _dataDir;
    private readonly object _gate = new();
    private DateTime _stamp = DateTime.MinValue;
    private ReferenceBundle? _bundle;

    public ReferenceDataStore(string dataDir)
    {
        _dataDir = Path.GetFullPath(dataDir);
    }

    public ReferenceBundle Current
    {
        get
        {
            lock (_gate)
            {
                var stamp = Directory.EnumerateFiles(_dataDir, "*", SearchOption.AllDirectories)
                    .Select(File.GetLastWriteTimeUtc)
                    .DefaultIfEmpty(DateTime.MinValue)
                    .Max();
                if (_bundle is null || stamp != _stamp)
                {
                    _bundle = Build();
                    _stamp = stamp;
                }
                return _bundle;
            }
        }
    }

    private ReferenceBundle Build()
    {
        using var version = Load("version.json");
        using var bands = Load("bands.json");
        using var tests = Load("tests.json");
        var subtests = LoadDir("subtests");
        var indices = LoadDir("indices");
        try
        {
            var schemaVersion = version.RootElement.GetProperty("schemaVersion").GetInt32();
            var dataVersion = version.RootElement.GetProperty("dataVersion").GetString()!;

            // Top-level keys in CompareOrdinal order: bands, dataVersion, indices, schemaVersion, subtests, tests.
            var bytes = CanonicalJson.Write(w =>
            {
                w.WriteStartObject();
                w.WritePropertyName("bands");
                CanonicalJson.WriteElement(w, bands.RootElement);
                w.WriteString("dataVersion", dataVersion);
                w.WritePropertyName("indices");
                WriteMap(w, indices);
                w.WritePropertyName("schemaVersion");
                w.WriteRawValue(version.RootElement.GetProperty("schemaVersion").GetRawText());
                w.WritePropertyName("subtests");
                WriteMap(w, subtests);
                w.WritePropertyName("tests");
                CanonicalJson.WriteElement(w, tests.RootElement);
                w.WriteEndObject();
            });
            var sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            return new ReferenceBundle(dataVersion, schemaVersion, sha, bytes);
        }
        finally
        {
            foreach (var d in subtests.Values) d.Dispose();
            foreach (var d in indices.Values) d.Dispose();
        }
    }

    private static void WriteMap(Utf8JsonWriter w, SortedDictionary<string, JsonDocument> map)
    {
        w.WriteStartObject();
        foreach (var (name, doc) in map)
        {
            w.WritePropertyName(name);
            CanonicalJson.WriteElement(w, doc.RootElement);
        }
        w.WriteEndObject();
    }

    private JsonDocument Load(string relative) =>
        JsonDocument.Parse(File.ReadAllBytes(Path.Combine(_dataDir, relative)));

    private SortedDictionary<string, JsonDocument> LoadDir(string relative)
    {
        var result = new SortedDictionary<string, JsonDocument>(StringComparer.Ordinal);
        foreach (var file in Directory.EnumerateFiles(Path.Combine(_dataDir, relative), "*.json"))
        {
            result[Path.GetFileNameWithoutExtension(file)] = JsonDocument.Parse(File.ReadAllBytes(file));
        }
        return result;
    }
}

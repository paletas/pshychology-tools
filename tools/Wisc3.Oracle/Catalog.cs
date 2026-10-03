using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Silvestre.Psychology.Tools.WISC3;
using Silvestre.Psychology.Tools.WISC3.Calculator;
using Silvestre.Psychology.Tools.WISC3.Standardization.Standardizers;

namespace Wisc3.Oracle;

// Row = [raw, verbal, realization, verbalComprehension, perceptiveOrganization, processingVelocity]
public sealed class TestBand
{
    public int Min { get; set; }
    public int Max { get; set; }
    public List<int?[]> Rows { get; set; } = new();
    public bool BelowMinThrows { get; set; }
    public bool AboveMaxThrows { get; set; }
    public List<int> Gaps { get; set; } = new();
}

public sealed class BandData
{
    public string Id { get; set; } = "";
    public int Year { get; set; }
    public bool SecondHalf { get; set; }
    public int[] Age { get; set; } = Array.Empty<int>();
    public string Fingerprint { get; set; } = "";
    public Dictionary<string, TestBand> Tests { get; set; } = new();
}

public sealed class IndexTable
{
    public string Name { get; init; } = "";
    public List<short> Keys { get; init; } = new();
    public Func<short, CalculatedIndexResult?> Calculate { get; init; } = _ => null;
}

public static class Catalog
{
    public const string Country = "PT";
    public const int Seed = 20261003;

    public static readonly string[] IndexNames = { "verbal", "realization", "completeScale", "verbalComprehension", "perceptiveOrganization", "processingVelocity" };

    // Old row order (VM WISC3ViewModel.cs:47-59); ids are the TestTypeEnum names.
    public static readonly TestTypeEnum[] RowOrder =
    {
        TestTypeEnum.ImageCompletion, TestTypeEnum.Information, TestTypeEnum.Code, TestTypeEnum.Similarities,
        TestTypeEnum.ImageDisposition, TestTypeEnum.Arithmetic, TestTypeEnum.Cubes, TestTypeEnum.Vocabulary,
        TestTypeEnum.ObjectComposition, TestTypeEnum.Comprehension, TestTypeEnum.SymbolSearch, TestTypeEnum.DigitMemory,
        TestTypeEnum.Labyrinth
    };

    public static readonly string[] ColumnNames = { "verbal", "realization", "verbalComprehension", "perceptiveOrganization", "processingVelocity" };

    public static ITestStandardizer Standardizer => WISC3Test.Standerdization(Country);

    public static string BandId(int year, bool secondHalf) => $"{year:00}y{(secondHalf ? 6 : 0):00}m";

    public static string Sha256(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();

    // A raw inside min..max that the old code cannot map (ArgumentOutOfRangeException) is a gap: row [raw,null x5].
    static int?[] RowFor(ITestStandardizer st, TestTypeEnum type, Age age, short raw)
    {
        try
        {
            var r = st.Standerdization(type, age, raw);
            return new int?[] { raw, r.Verbal, r.Realization, r.VerbalComprehension, r.PerceptiveOrganization, r.ProcessingVelocity };
        }
        catch (ArgumentOutOfRangeException)
        {
            return new int?[] { raw, null, null, null, null, null };
        }
    }

    public static bool IsGap(int?[] row) => row.Skip(1).All(v => v == null);

    static bool Throws(Action a)
    {
        try { a(); return false; } catch { return true; }
    }

    // Bounds + rows of every test at the given age (throws when the old code throws for that age).
    public static string FingerprintAt(Age age)
    {
        var st = Standardizer;
        var sb = new StringBuilder();
        foreach (var type in Enum.GetValues<TestTypeEnum>())
        {
            var b = st.GetTestDescriptorPerAge(type, age).Boundaries;
            sb.Append(type).Append(':').Append(b.Min).Append('-').Append(b.Max).Append(';');
            for (short raw = b.Min; raw <= b.Max!.Value; raw++)
            {
                var row = RowFor(st, type, age, raw);
                sb.Append(string.Join(",", row.Select(v => v?.ToString() ?? "n"))).Append('|');
            }
        }
        return Sha256(sb.ToString());
    }

    // (band, test, raw) of every in-bounds raw the old code cannot map.
    public static List<(string band, string test, int raw)> AllGaps() =>
        Bands.SelectMany(b => b.Tests.SelectMany(t => t.Value.Gaps.Select(g => (b.Id, t.Key, g)))).ToList();

    static Dictionary<Type, string?>? _tableBand;

    // Band id of the old table the old code selects for this age (null when it throws).
    public static string? OldBandId(Age age)
    {
        _tableBand ??= new();
        try
        {
            var table = TableSelector.Invoke(Standardizer, new object[] { age })!;
            if (!_tableBand.TryGetValue(table.GetType(), out var id))
            {
                var fp = FingerprintAt(age);
                id = Bands.FirstOrDefault(b => b.Fingerprint == fp)?.Id;
                _tableBand[table.GetType()] = id;
            }
            return id;
        }
        catch (TargetInvocationException) { return null; }
    }

    static List<BandData>? _bands;
    public static List<BandData> Bands => _bands ??= BuildBands();

    static List<BandData> BuildBands()
    {
        var st = Standardizer;
        var list = new List<BandData>();
        foreach (var (from, _) in st.SupportedAgeIntervals)
        {
            bool second = from.Months != 0;
            int y = from.Years;
            var age = second ? new Age(y, 8, 15) : new Age(y, 2, 15);
            var band = new BandData { Id = BandId(y, second), Year = y, SecondHalf = second, Age = new[] { age.Years, age.Months, age.Days } };
            foreach (var type in Enum.GetValues<TestTypeEnum>())
            {
                var b = st.GetTestDescriptorPerAge(type, age).Boundaries;
                var tb = new TestBand { Min = b.Min, Max = b.Max!.Value };
                for (short raw = b.Min; raw <= b.Max!.Value; raw++)
                {
                    var row = RowFor(st, type, age, raw);
                    tb.Rows.Add(row);
                    if (IsGap(row)) tb.Gaps.Add(raw);
                }
                tb.BelowMinThrows = Throws(() => st.Standerdization(type, age, (short)(b.Min - 1)));
                tb.AboveMaxThrows = Throws(() => st.Standerdization(type, age, (short)(b.Max!.Value + 1)));
                band.Tests[type.ToString()] = tb;
            }
            band.Fingerprint = FingerprintAt(age);
            list.Add(band);
        }
        return list;
    }

    // Static Dictionary<short,...> field of each internal subscale type, found by reflection.
    public static List<IndexTable> Indices()
    {
        var asm = typeof(WISC3Test).Assembly;
        var ns = "Silvestre.Psychology.Tools.WISC3.Calculator.ConvertionScales.Portugal";
        var map = new Dictionary<string, string>
        {
            ["verbal"] = "VerbalSubscale", ["realization"] = "RealizationSubscale", ["completeScale"] = "CompleteSubscale",
            ["verbalComprehension"] = "VerbalComprehensionSubscale", ["perceptiveOrganization"] = "PerceptiveOrganizationSubscale",
            ["processingVelocity"] = "ProcessingVelocitySubscale"
        };
        var calc = WISC3Test.QICalculator(Country);
        var calcs = new Dictionary<string, Func<short, CalculatedIndexResult?>>
        {
            ["verbal"] = calc.CalculateVerbalQI, ["realization"] = calc.CalculateRealizationQI, ["completeScale"] = calc.CalculateCompleteScaleQI,
            ["verbalComprehension"] = calc.CalculateVerbalComprehensionQI, ["perceptiveOrganization"] = calc.CalculatePerceptiveOrganizationQI,
            ["processingVelocity"] = calc.CalculateProcessingVelocityQI
        };
        var result = new List<IndexTable>();
        foreach (var name in IndexNames)
        {
            var type = asm.GetType($"{ns}.{map[name]}", throwOnError: true)!;
            var field = type.GetFields(BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)
                .Single(f => f.FieldType.IsGenericType && (f.FieldType.GetGenericTypeDefinition() == typeof(Dictionary<,>) || f.FieldType.GetGenericTypeDefinition() == typeof(IDictionary<,>))
                             && f.FieldType.GetGenericArguments()[0] == typeof(short));
            var dict = (IDictionary)field.GetValue(null)!;
            var keys = dict.Keys.Cast<short>().OrderBy(k => k).ToList();
            result.Add(new IndexTable { Name = name, Keys = keys, Calculate = calcs[name] });
        }
        return result;
    }

    // VERBATIM COPY from WISC3.razor.cs:131-143
    public static Age? DetermineAgeFrom(DateTime? testDate, DateTime? subjectBirthday)
    {
        if (testDate == null || subjectBirthday == null || testDate <= subjectBirthday) return null;

        var timeSpent = testDate.Value - subjectBirthday.Value;
        var timeSpentAsDateTime = new DateTime(1, 1, 1) + timeSpent;

        var years = timeSpentAsDateTime.Year - 1;
        var months = timeSpentAsDateTime.Month - 1;
        var days = timeSpentAsDateTime.Day - 1;

        return new Age(years, months, days);
    }

    public static int DaysFor(int y, int m, int d) => (new DateTime(1 + y, 1 + m, 1 + d) - new DateTime(1, 1, 1)).Days;

    public static string Iso(DateTime d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    public static DateTime ParseIso(string s) => DateTime.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture);
    public static int[]? AgeArr(Age? a) => a == null ? null : new[] { a.Value.Years, a.Value.Months, a.Value.Days };

    public static MethodInfo TableSelector { get; } =
        typeof(LookupStandardizer).GetMethod("GetStandardizerTableFor", BindingFlags.Instance | BindingFlags.NonPublic)!;
}

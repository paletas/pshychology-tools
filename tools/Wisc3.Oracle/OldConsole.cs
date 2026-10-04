using Silvestre.Psychology.Tools.WISC3;

namespace Wisc3.Oracle;

// One predicted old-app console exception (plan Design, "Old-app console and crash rules").
public sealed record OldConsoleRec(string Kind, string Stage, string? Test = null, int? Raw = null);

public static class OldConsole
{
    // WISC3LookupTableVisualizer.razor:68-73 (DisplayedTests order).
    static readonly TestTypeEnum[] DisplayedTests =
    {
        TestTypeEnum.Information, TestTypeEnum.Similarities, TestTypeEnum.Arithmetic, TestTypeEnum.Vocabulary, TestTypeEnum.Comprehension, TestTypeEnum.DigitMemory,
        TestTypeEnum.ImageCompletion, TestTypeEnum.Code, TestTypeEnum.ImageDisposition, TestTypeEnum.Cubes, TestTypeEnum.ObjectComposition, TestTypeEnum.SymbolSearch, TestTypeEnum.Labyrinth
    };

    public static readonly string[] Kinds = { "age-throw", "raw-throw", "visualizer-raw-throw", "visualizer-index-throw" };

    // Mirrors the old page's control flow: the age-stage / raw-stage crash comes from RunCore; the lookup visualizer
    // loop (WISC3LookupTableVisualizer.razor:88-127) runs only when there is no age-stage crash.
    public static List<OldConsoleRec> Predict(Scenario s, OldResult old)
    {
        var list = new List<OldConsoleRec>();
        if (old.Throws && old.ThrowStage == "age") { list.Add(new OldConsoleRec("age-throw", "age")); return list; }
        if (old.Throws && old.ThrowStage == "raw") list.Add(new OldConsoleRec("raw-throw", "raw", old.ThrowAt!.Test, old.ThrowAt.Raw));

        var age = Catalog.DetermineAgeFrom(Catalog.ParseIso(s.TestDate), Catalog.ParseIso(s.BirthDate));
        if (age == null) return list;
        var st = Catalog.Standardizer;
        var a = age.Value;
        if (!st.SupportedAgeIntervals.Any(i => a >= i.From && a <= i.To)) return list;

        foreach (var type in DisplayedTests)
        {
            var desc = st.GetTestDescriptorPerAge(type, a);
            if (desc == null) continue;
            int length = (desc.Boundaries.Max ?? desc.Boundaries.Min) - desc.Boundaries.Min + 1;
            for (short ix = desc.Boundaries.Min; ix <= desc.Boundaries.Max; ix++)
            {
                TestResult r;
                try { r = st.Standerdization(type, a, ix); }
                catch
                {
                    list.Add(new OldConsoleRec("visualizer-raw-throw", "age", type.ToString(), ix));
                    return list;
                }
                var v = r.Verbal ?? r.Realization;
                if (v == null) continue;
                if (v.Value >= length)
                {
                    list.Add(new OldConsoleRec("visualizer-index-throw", "age", type.ToString(), ix));
                    return list;
                }
            }
        }
        return list;
    }
}

using System.Globalization;
using Silvestre.Psychology.Tools.WISC3;

namespace Wisc3.Oracle;

public static class Findings
{
    static int[] CalendarAge(DateTime test, DateTime birth)
    {
        int y = test.Year - birth.Year, m = test.Month - birth.Month, d = test.Day - birth.Day;
        if (d < 0)
        {
            m--;
            var prev = test.AddMonths(-1);
            d += DateTime.DaysInMonth(prev.Year, prev.Month);
        }
        if (m < 0) { y--; m += 12; }
        return new[] { y, m, d };
    }

    // Clean half-years Y,0,0..Y,5,30 and Y,6,0..Y,11,30.
    static string? CleanBand(int[] a) => a[0] < 6 || a[0] >= 17 ? null : Catalog.BandId(a[0], a[1] >= 6);

    public static object Build(List<IndexTable> indices, List<Scenario> scenarios, List<ScenarioResult> results,
        List<(int[] age, bool supported, int? band, bool throws)> grid,
        List<(string band, string test, int raw)> gapsBefore, List<(string band, string test, int raw)> gapsOriginal, List<Correction> corrections)
    {
        var iq999 = new Dictionary<string, List<int>>();
        var pct0or100 = new Dictionary<string, List<object>>();
        var inRangeNonKey = new Dictionary<string, List<int>>();
        foreach (var idx in indices)
        {
            var s999 = new List<int>();
            var sPct = new List<object>();
            var sNon = new List<int>();
            int min = idx.Keys.Min(), max = idx.Keys.Max();
            foreach (var key in idx.Keys)
            {
                var r = idx.Calculate(key)!;
                if (r.Value == 999) s999.Add(key);
                if (r.Percentil == 0m || r.Percentil == 100m)
                    sPct.Add(new { sum = (int)key, percentile = r.Percentil.ToString(CultureInfo.InvariantCulture) });
            }
            for (int sum = min; sum <= max; sum++)
                if (!idx.Keys.Contains((short)sum)) sNon.Add(sum);
            iq999[idx.Name] = s999;
            pct0or100[idx.Name] = sPct;
            inRangeNonKey[idx.Name] = sNon;
        }

        var pvExamples = new List<string>();
        int pvCount = 0;
        for (int i = 0; i < scenarios.Count; i++)
        {
            var old = results[i].Old;
            if (old.IndicesShown && scenarios[i].Raw["SymbolSearch"] == null && old.Indices!["processingVelocity"] != null)
            {
                pvCount++;
                if (pvExamples.Count < 3) pvExamples.Add(scenarios[i].Id);
            }
        }

        static int Cmp(int[] a, int[] b) => a[0] != b[0] ? a[0].CompareTo(b[0]) : a[1] != b[1] ? a[1].CompareTo(b[1]) : a[2].CompareTo(b[2]);
        int[] lo = { 6, 0, 0 }, hi = { 17, 0, 0 };
        var gateLeak = new
        {
            gridSize = grid.Count,
            oldSupportedBelow6y = grid.Count(g => g.supported && Cmp(g.age, lo) < 0),
            oldSupportedFrom17y = grid.Count(g => g.supported && Cmp(g.age, hi) >= 0),
            oldSupportedFrom17yThrowing = grid.Count(g => g.supported && Cmp(g.age, hi) >= 0 && g.throws),
            oldSupportedTotal = grid.Count(g => g.supported)
        };

        var rng = new Random(Catalog.Seed);
        var first = new DateTime(2018, 1, 1);
        int span = (new DateTime(2026, 12, 31) - first).Days;
        int minDays = Catalog.DaysFor(6, 0, 0), maxDays = Catalog.DaysFor(17, 0, 0) - 1;
        const int pairs = 50000;
        int ageDiff = 0, bandDiff = 0;
        var ageExamples = new List<object>();
        var bandExamples = new List<object>();
        for (int i = 0; i < pairs; i++)
        {
            var test = first.AddDays(rng.Next(0, span + 1));
            var birth = test.AddDays(-rng.Next(minDays, maxDays + 1));
            var dayCount = Catalog.AgeArr(Catalog.DetermineAgeFrom(test, birth))!;
            var calendar = CalendarAge(test, birth);
            var bandDay = CleanBand(dayCount);
            var bandCal = CleanBand(calendar);
            var example = new { test = Catalog.Iso(test), birth = Catalog.Iso(birth), dayCount, calendar, bandDayCount = bandDay, bandCalendar = bandCal };
            if (!dayCount.SequenceEqual(calendar))
            {
                ageDiff++;
                if (ageExamples.Count < 5) ageExamples.Add(example);
            }
            if (bandDay != bandCal)
            {
                bandDiff++;
                if (bandExamples.Count < 5) bandExamples.Add(example);
            }
        }

        return new
        {
            gapsBefore = gapsBefore.Select(g => new { g.band, g.test, g.raw }).ToList(),
            gapsOriginal = gapsOriginal.Select(g => new { g.band, g.test, g.raw }).ToList(),
            correctionsApplied = corrections.Select(c => new { c.Id, c.Kind, c.Table, cells = c.Cells.Count, c.Source, c.Approval }).ToList(),
            iq999,
            pct0or100,
            inRangeNonKey,
            pvWithoutSymbolSearch = new { count = pvCount, scenarios = scenarios.Count, examples = pvExamples },
            gateLeak,
            dayCountVsCalendar = new
            {
                pairs,
                ageDiffersPercent = Math.Round(100.0 * ageDiff / pairs, 3),
                bandDiffersPercent = Math.Round(100.0 * bandDiff / pairs, 3),
                ageExamples,
                bandExamples
            }
        };
    }
}

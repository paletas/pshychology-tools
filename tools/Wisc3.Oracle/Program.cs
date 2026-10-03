using System.Globalization;
using System.Text;
using System.Text.Json;
using Wisc3.Oracle;

CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;

static string? Arg(string[] args, string name)
{
    int i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}

const string usage = "usage: Wisc3.Oracle golden --out <dir> | emit-data --out <dir> | scenarios --in <file> --out <file>";
if (args.Length == 0) { Console.Error.WriteLine(usage); return 2; }

switch (args[0])
{
    case "golden":
        {
            var outDir = Arg(args, "--out");
            if (outDir == null) { Console.Error.WriteLine(usage); return 2; }
            return Golden.Run(outDir);
        }
    case "emit-data":
        {
            var outDir = Arg(args, "--out");
            if (outDir == null) { Console.Error.WriteLine(usage); return 2; }
            return EmitData.Run(outDir);
        }
    case "scenarios":
        {
            var input = Arg(args, "--in");
            var output = Arg(args, "--out");
            if (input == null || output == null) { Console.Error.WriteLine(usage); return 2; }
            var cases = JsonSerializer.Deserialize<List<Scenario>>(File.ReadAllText(input), Json.Options)!;
            var results = cases.Select(ScenarioDriver.Run).ToList();
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
            File.WriteAllText(output, Json.Serialize(results), new UTF8Encoding(false));
            Console.WriteLine($"scenarios: {results.Count} cases -> {output}");
            return 0;
        }
    default:
        Console.Error.WriteLine(usage);
        return 2;
}

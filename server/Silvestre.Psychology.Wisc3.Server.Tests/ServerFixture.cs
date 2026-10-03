using Microsoft.AspNetCore.Mvc.Testing;

namespace Silvestre.Psychology.Wisc3.Server.Tests;

/// <summary>A server over a temporary SPA root and a temporary copy of data/wisc3-pt.</summary>
public sealed class ServerFixture : IDisposable
{
    public string Root { get; }
    public string Spa { get; }
    public string Data { get; }
    public WebApplicationFactory<Program> Factory { get; }

    public ServerFixture()
    {
        Root = Path.Combine(Path.GetTempPath(), "wisc3-server-tests-" + Guid.NewGuid().ToString("N"));
        Spa = Path.Combine(Root, "spa");
        Data = Path.Combine(Root, "data");
        Directory.CreateDirectory(Path.Combine(Spa, "assets"));
        File.WriteAllText(Path.Combine(Spa, "index.html"), "<html><body>fake-index</body></html>");
        File.WriteAllText(Path.Combine(Spa, "service-worker.js"), "// sw");
        File.WriteAllText(Path.Combine(Spa, "assets", "a.js"), "// a");
        CopyDirectory(FindRealData(), Data);
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("Spa:Root", Spa);
            b.UseSetting("ReferenceData:Path", Data);
        });
    }

    public HttpClient CreateClient() =>
        Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private static string FindRealData()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Silvestre.Psychology.sln")))
        {
            dir = dir.Parent;
        }
        if (dir is null) throw new InvalidOperationException("Silvestre.Psychology.sln not found above the test output");
        return Path.Combine(dir.FullName, "data", "wisc3-pt");
    }

    private static void CopyDirectory(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var f in Directory.GetFiles(from)) File.Copy(f, Path.Combine(to, Path.GetFileName(f)));
        foreach (var d in Directory.GetDirectories(from)) CopyDirectory(d, Path.Combine(to, Path.GetFileName(d)));
    }

    public void Dispose()
    {
        Factory.Dispose();
        try { Directory.Delete(Root, true); } catch (IOException) { }
    }
}

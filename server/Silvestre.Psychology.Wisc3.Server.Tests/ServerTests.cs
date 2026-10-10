using System.Net;
using System.Security.Cryptography;
using System.Text.Json;

namespace Silvestre.Psychology.Wisc3.Server.Tests;

public sealed class ServerTests : IClassFixture<ServerFixture>
{
    private readonly ServerFixture _fx;

    public ServerTests(ServerFixture fx) => _fx = fx;

    // the manifest url is relative to the manifest's own URL
    private static Uri BundleUri(HttpClient client, JsonElement m) =>
        new(new Uri(client.BaseAddress!, "/api/reference/manifest"), m.GetProperty("url").GetString());

    private static async Task<JsonElement> ManifestAsync(HttpClient client)
    {
        var resp = await client.GetAsync("/api/reference/manifest");
        resp.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await resp.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    [Fact]
    public async Task Manifest_has_headers_and_fields_and_supports_304()
    {
        var client = _fx.CreateClient();
        var resp = await client.GetAsync("/api/reference/manifest");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("no-cache", resp.Headers.CacheControl?.ToString());
        var m = JsonDocument.Parse(await resp.Content.ReadAsStringAsync()).RootElement;
        var sha = m.GetProperty("sha256").GetString()!;
        Assert.Equal(1, m.GetProperty("schemaVersion").GetInt32());
        Assert.False(string.IsNullOrEmpty(m.GetProperty("dataVersion").GetString()));
        Assert.True(m.GetProperty("bytes").GetInt32() > 0);
        Assert.Equal($"bundle/{sha}.json", m.GetProperty("url").GetString());
        Assert.Equal($"\"{sha}\"", resp.Headers.ETag?.Tag);

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/reference/manifest");
        req.Headers.TryAddWithoutValidation("If-None-Match", $"\"{sha}\"");
        var second = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.NotModified, second.StatusCode);
    }

    [Fact]
    public async Task Bundle_is_immutable_and_matches_manifest()
    {
        var client = _fx.CreateClient();
        var m = await ManifestAsync(client);
        var resp = await client.GetAsync(BundleUri(client, m));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("application/json", resp.Content.Headers.ContentType?.MediaType);
        Assert.Contains("immutable", resp.Headers.CacheControl!.ToString());
        var body = await resp.Content.ReadAsByteArrayAsync();
        Assert.Equal(m.GetProperty("sha256").GetString(), Convert.ToHexString(SHA256.HashData(body)).ToLowerInvariant());
        Assert.Equal(m.GetProperty("bytes").GetInt32(), body.Length);

        var unknown = await client.GetAsync("/api/reference/bundle/" + new string('0', 64) + ".json");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Fact]
    public async Task Bundle_keys_are_in_ordinal_order()
    {
        var client = _fx.CreateClient();
        var m = await ManifestAsync(client);
        var text = await client.GetStringAsync(BundleUri(client, m));
        var start = text.IndexOf("\"completeScale\":{", StringComparison.Ordinal);
        Assert.True(start >= 0);
        var segment = text[start..];
        var ten = segment.IndexOf("\"10\":", StringComparison.Ordinal);
        var five = segment.IndexOf("\"5\":", StringComparison.Ordinal);
        Assert.True(ten >= 0 && five >= 0);
        Assert.True(ten < five);
    }

    [Fact]
    public async Task Changing_data_changes_the_manifest_sha()
    {
        var client = _fx.CreateClient();
        var before = (await ManifestAsync(client)).GetProperty("sha256").GetString();
        var file = Path.Combine(_fx.Data, "version.json");
        var original = File.ReadAllText(file);
        try
        {
            File.WriteAllText(file, "{\"schemaVersion\":1,\"dataVersion\":\"test-" + Guid.NewGuid().ToString("N") + "\"}");
            File.SetLastWriteTimeUtc(file, DateTime.UtcNow.AddMinutes(5));
            var after = (await ManifestAsync(client)).GetProperty("sha256").GetString();
            Assert.NotEqual(before, after);
        }
        finally
        {
            File.WriteAllText(file, original);
            File.SetLastWriteTimeUtc(file, DateTime.UtcNow.AddMinutes(10));
        }
    }

    [Fact]
    public async Task Static_files_get_cache_headers()
    {
        var client = _fx.CreateClient();
        var sw = await client.GetAsync("/service-worker.js");
        Assert.Equal(HttpStatusCode.OK, sw.StatusCode);
        Assert.Equal("no-cache", sw.Headers.CacheControl?.ToString());
        var asset = await client.GetAsync("/assets/a.js");
        Assert.Equal(HttpStatusCode.OK, asset.StatusCode);
        Assert.Contains("immutable", asset.Headers.CacheControl!.ToString());
    }

    [Fact]
    public async Task Retire_worker_is_no_cache()
    {
        var resp = await _fx.CreateClient().GetAsync("/retire-service-worker.js");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("no-cache", resp.Headers.CacheControl?.ToString());
        Assert.Contains("wisc3-retire", await resp.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Routing()
    {
        var client = _fx.CreateClient();
        var root = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.Redirect, root.StatusCode);
        Assert.Equal("wisc3", root.Headers.Location?.OriginalString);
        // behind Traefik stripprefix /new the browser resolves it against /new/
        Assert.Equal("/new/wisc3", new Uri(new Uri("http://x/new/"), root.Headers.Location).AbsolutePath);

        var spa = await client.GetAsync("/wisc3");
        Assert.Equal(HttpStatusCode.OK, spa.StatusCode);
        Assert.Contains("fake-index", await spa.Content.ReadAsStringAsync());
        Assert.Equal("no-cache", spa.Headers.CacheControl?.ToString());

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/healthz")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/_framework/x.js")).StatusCode);
    }

    private static Task<HttpResponseMessage> HeadAsync(HttpClient client, string url) =>
        client.SendAsync(new HttpRequestMessage(HttpMethod.Head, url));

    [Fact]
    public async Task Head_SpaShell_Wisc3()
    {
        var resp = await HeadAsync(_fx.CreateClient(), "/wisc3");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("no-cache", resp.Headers.CacheControl?.ToString());
        Assert.StartsWith("text/html", resp.Content.Headers.ContentType?.MediaType);
        Assert.Empty(await resp.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Head_ServiceWorker()
    {
        var resp = await HeadAsync(_fx.CreateClient(), "/service-worker.js");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("no-cache", resp.Headers.CacheControl?.ToString());
        Assert.Empty(await resp.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Head_Manifest()
    {
        var client = _fx.CreateClient();
        var get = await client.GetAsync("/api/reference/manifest");
        var resp = await HeadAsync(client, "/api/reference/manifest");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("no-cache", resp.Headers.CacheControl?.ToString());
        Assert.NotNull(resp.Headers.ETag);
        Assert.Equal(get.Headers.ETag?.Tag, resp.Headers.ETag?.Tag);
        Assert.Empty(await resp.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Head_Bundle()
    {
        var client = _fx.CreateClient();
        var m = await ManifestAsync(client);
        var resp = await HeadAsync(client, $"/api/reference/bundle/{m.GetProperty("sha256").GetString()}.json");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains("immutable", resp.Headers.CacheControl!.ToString());
        Assert.NotNull(resp.Headers.ETag);
        Assert.Equal(m.GetProperty("bytes").GetInt64(), resp.Content.Headers.ContentLength);
        Assert.Empty(await resp.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Post_on_api_is_405()
    {
        var client = _fx.CreateClient();
        var resp = await client.PostAsync("/api/reference/manifest", new StringContent("{}"));
        Assert.Equal(HttpStatusCode.MethodNotAllowed, resp.StatusCode);
    }
    private static async Task<(HttpResponseMessage Resp, string Body)> GetConfigAsync(ServerFixture fx)
    {
        var resp = await fx.CreateClient().GetAsync("/config.json");
        return (resp, await resp.Content.ReadAsStringAsync());
    }

    private static void AssertNoSetCookie(HttpResponseMessage resp) =>
        Assert.False(resp.Headers.Contains("Set-Cookie"), "the server never sets cookies");

    [Fact]
    public async Task Config_Empty()
    {
        var (resp, body) = await GetConfigAsync(_fx);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("no-cache", resp.Headers.CacheControl?.ToString());
        Assert.Equal("application/json", resp.Content.Headers.ContentType?.MediaType);
        Assert.Equal(JsonValueKind.Null, JsonDocument.Parse(body).RootElement.GetProperty("legacyUrl").ValueKind);
        AssertNoSetCookie(resp);
        // no cookie on the other responses either
        foreach (var path in new[] { "/healthz", "/wisc3", "/api/reference/manifest", "/service-worker.js" })
            AssertNoSetCookie(await _fx.CreateClient().GetAsync(path));
    }

    [Fact]
    public async Task Config_Set()
    {
        using var fx = ServerFixture.WithLegacyUrl("https://old.example.org/wisc3");
        var (resp, body) = await GetConfigAsync(fx);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("https://old.example.org/wisc3", JsonDocument.Parse(body).RootElement.GetProperty("legacyUrl").GetString());
        AssertNoSetCookie(resp);
    }

    [Fact]
    public async Task Config_Invalid()
    {
        foreach (var value in new[] { "javascript:alert(1)", "/relative/path", "ftp://old.example.org", "not a url" })
        {
            using var fx = ServerFixture.WithLegacyUrl(value);
            var (resp, body) = await GetConfigAsync(fx);
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
            Assert.Equal(JsonValueKind.Null, JsonDocument.Parse(body).RootElement.GetProperty("legacyUrl").ValueKind);
        }
    }

    [Fact]
    public async Task Head_Config()
    {
        var client = _fx.CreateClient();
        var get = await client.GetAsync("/config.json");
        var head = await HeadAsync(client, "/config.json");
        Assert.Equal(HttpStatusCode.OK, head.StatusCode);
        Assert.Equal("no-cache", head.Headers.CacheControl?.ToString());
        Assert.NotNull(head.Headers.ETag);
        Assert.Equal(get.Headers.ETag?.Tag, head.Headers.ETag?.Tag);
        Assert.Empty(await head.Content.ReadAsByteArrayAsync());
        AssertNoSetCookie(head);

        var req = new HttpRequestMessage(HttpMethod.Get, "/config.json");
        req.Headers.TryAddWithoutValidation("If-None-Match", get.Headers.ETag!.Tag);
        Assert.Equal(HttpStatusCode.NotModified, (await client.SendAsync(req)).StatusCode);
    }
}

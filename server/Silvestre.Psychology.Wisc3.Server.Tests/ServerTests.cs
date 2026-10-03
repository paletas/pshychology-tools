using System.Net;
using System.Security.Cryptography;
using System.Text.Json;

namespace Silvestre.Psychology.Wisc3.Server.Tests;

public sealed class ServerTests : IClassFixture<ServerFixture>
{
    private readonly ServerFixture _fx;

    public ServerTests(ServerFixture fx) => _fx = fx;

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
        Assert.Equal($"/api/reference/bundle/{sha}.json", m.GetProperty("url").GetString());
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
        var resp = await client.GetAsync(m.GetProperty("url").GetString());
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
        var text = await client.GetStringAsync(m.GetProperty("url").GetString());
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
    public async Task Routing()
    {
        var client = _fx.CreateClient();
        var root = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.Redirect, root.StatusCode);
        Assert.Equal("/wisc3", root.Headers.Location?.OriginalString);

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
}

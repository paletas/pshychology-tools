using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;

namespace Silvestre.Psychology.Wisc3.Server.Tests;

public class TelemetryTests
{
    private static ServerFixture With(string endpoint) =>
        ServerFixture.WithSettings(new Dictionary<string, string> { ["OTEL_EXPORTER_OTLP_ENDPOINT"] = endpoint });

    [Fact]
    public async Task Healthz_returns_200_ok()
    {
        using var fx = new ServerFixture();
        var res = await fx.CreateClient().GetAsync("/healthz");
        Assert.Equal(System.Net.HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("ok", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public void No_endpoint_registers_no_meter_provider()
    {
        using var fx = With("");
        Assert.Null(fx.Factory.Services.GetService<MeterProvider>());
    }

    [Fact]
    public async Task Endpoint_set_registers_meter_provider_and_api_still_serves()
    {
        using var fx = With("http://127.0.0.1:4318");
        Assert.NotNull(fx.Factory.Services.GetService<MeterProvider>());
        var res = await fx.CreateClient().GetAsync("/api/reference/manifest");
        Assert.Equal(System.Net.HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public void Allow_list_has_no_identifying_keys()
    {
        Assert.Equal(new[]
        {
            "http.request.method", "http.response.status_code", "http.route",
            "url.scheme", "network.protocol.name", "network.protocol.version",
        }, AppTelemetry.AllowedTags);
        foreach (var bad in new[] { "url.full", "url.query", "url.path", "client.address", "user_agent.original", "server.address" })
            Assert.DoesNotContain(bad, AppTelemetry.AllowedTags);
    }
}

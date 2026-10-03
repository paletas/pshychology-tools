using Microsoft.Extensions.FileProviders;
using Silvestre.Psychology.Wisc3.Server;

var builder = WebApplication.CreateBuilder(args);

var spaRoot = Path.GetFullPath(builder.Configuration["Spa:Root"] ?? "../web/dist");
var dataPath = Path.GetFullPath(builder.Configuration["ReferenceData:Path"] ?? "../data/wisc3-pt");

builder.Services.AddSingleton(new ReferenceDataStore(dataPath));

var app = builder.Build();

const string NoCache = "no-cache";
const string Immutable = "public, max-age=31536000, immutable";

app.MapMethods("/healthz", new[] { HttpMethods.Get, HttpMethods.Head }, () => Results.Text("ok"));

app.MapMethods("/", new[] { HttpMethods.Get, HttpMethods.Head }, () => Results.Redirect("/wisc3"));

app.MapMethods("/wisc3", new[] { HttpMethods.Get, HttpMethods.Head }, (HttpContext ctx) =>
{
    var index = Path.Combine(spaRoot, "index.html");
    if (!File.Exists(index)) return Results.NotFound();
    ctx.Response.Headers.CacheControl = NoCache;
    return Results.File(index, "text/html; charset=utf-8");
});

app.MapMethods("/api/reference/manifest", new[] { HttpMethods.Get, HttpMethods.Head }, (HttpContext ctx, ReferenceDataStore store) =>
{
    var bundle = store.Current;
    var etag = $"\"{bundle.Sha256}\"";
    ctx.Response.Headers.CacheControl = NoCache;
    ctx.Response.Headers.ETag = etag;
    if (ctx.Request.Headers.IfNoneMatch.ToString().Split(',').Select(v => v.Trim()).Contains(etag))
    {
        return Results.StatusCode(StatusCodes.Status304NotModified);
    }
    if (HttpMethods.IsHead(ctx.Request.Method))
    {
        // headers only; skip serialising a body that would be dropped
        ctx.Response.ContentType = "application/json; charset=utf-8";
        return Results.Empty;
    }
    return Results.Json(new
    {
        schemaVersion = 1,
        dataVersion = bundle.DataVersion,
        sha256 = bundle.Sha256,
        bytes = bundle.Bytes.Length,
        url = $"/api/reference/bundle/{bundle.Sha256}.json",
    });
});

app.MapMethods("/api/reference/bundle/{sha}.json", new[] { HttpMethods.Get, HttpMethods.Head }, (HttpContext ctx, ReferenceDataStore store, string sha) =>
{
    var bundle = store.Current;
    if (!string.Equals(sha, bundle.Sha256, StringComparison.Ordinal)) return Results.NotFound();
    ctx.Response.Headers.CacheControl = Immutable;
    ctx.Response.Headers.ETag = $"\"{bundle.Sha256}\"";
    return Results.Bytes(bundle.Bytes, "application/json");
});

// Static files come straight from the SPA root and are read from disk on every request.
var spaFiles = new PhysicalFileProvider(spaRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = spaFiles,
    ServeUnknownFileTypes = false,
    OnPrepareResponse = ctx =>
    {
        var path = ctx.Context.Request.Path.Value ?? "";
        var headers = ctx.Context.Response.Headers;
        if (path.StartsWith("/assets/", StringComparison.Ordinal))
        {
            headers.CacheControl = Immutable;
        }
        else if (path is "/service-worker.js" or "/index.html" or "/manifest.json")
        {
            headers.CacheControl = NoCache;
        }
    },
});

app.Run();

public partial class Program { }

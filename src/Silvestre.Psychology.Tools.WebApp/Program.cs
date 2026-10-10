using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Silvestre.Psychology.Tools.ViewModels;
using Silvestre.Psychology.Tools.WebApp.Components;
using Silvestre.Psychology.Tools.WISC3.WebComponent.Pages;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services
    .AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();

builder.Services
    .AddSingleton<PsychologyToolsViewModel>()
    .AddLocalization();

// Optional path base (env PathBase, e.g. /legacy): the app is then also served under that prefix (Traefik does not strip it).
// Unset = the pipeline is exactly as before.
var pathBase = builder.Configuration["PathBase"];
if (!string.IsNullOrEmpty(pathBase) && (!pathBase.StartsWith('/') || pathBase.EndsWith('/')))
{
    throw new InvalidOperationException($"PathBase must start with '/' and must not end with '/' (got '{pathBase}').");
}

var app = builder.Build();

if (!string.IsNullOrEmpty(pathBase))
{
    app.UsePathBase(pathBase);
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseWebAssemblyDebugging();
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();
app.MapStaticAssets();
if (!string.IsNullOrEmpty(pathBase))
{
    // Routing must run after UsePathBase: the implicit UseRouting would run first and match nothing under the prefix.
    app.UseRouting();
}
app.UseAntiforgery();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(WISC3).Assembly);

app.Run();

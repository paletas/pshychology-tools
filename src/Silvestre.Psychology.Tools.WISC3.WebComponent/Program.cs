using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using Silvestre.Psychology.Tools.WISC3.WebComponent.ViewModel;
using System;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace Silvestre.Psychology.Tools.WISC3.WebComponent
{
    public class Program
    {
        public static CultureInfo[] SupportedCultures = new[]
        {
            new CultureInfo("pt-PT"),
        };


        public static async Task Main(string[] args)
        {
            var builder = WebAssemblyHostBuilder.CreateDefault(args);
            builder.RootComponents.Add<App>("app");

            builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
            builder.Services.AddSingleton<PsychologyToolsViewModel>();
            builder.Services.AddLocalization();

            var host = builder.Build();
            await SetCulture(host);

            await host.RunAsync();
        }

        private static async Task SetCulture(WebAssemblyHost host)
        {
            var jsInterop = host.Services.GetRequiredService<IJSRuntime>();
            var result = await jsInterop.InvokeAsync<string>("blazorCulture.get");
            if (result == null) result = SupportedCultures[0].Name;
            else if (SupportedCultures.Any(culture => culture.Name == result) == false)
                result = SupportedCultures[0].Name;

            var culture = new CultureInfo(result);
            CultureInfo.DefaultThreadCurrentCulture = culture;
            CultureInfo.DefaultThreadCurrentUICulture = culture;
        }
    }
}

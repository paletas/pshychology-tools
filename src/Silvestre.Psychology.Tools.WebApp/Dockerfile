#See https://aka.ms/containerfastmode to understand how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
RUN dotnet workload install wasm-tools
RUN apt-get update
RUN apt-get install -y python3
RUN apt-get install -y libatomic1

WORKDIR /src
COPY ["src/Silvestre.Psychology.Tools.WISC3/Silvestre.Psychology.Tools.WISC3.csproj", "Silvestre.Psychology.Tools.WISC3/"]
COPY ["src/Silvestre.Psychology.Tools.WISC3.ViewModels/Silvestre.Psychology.Tools.WISC3.ViewModels.csproj", "Silvestre.Psychology.Tools.WISC3.ViewModels/"]
COPY ["src/Silvestre.Psychology.Tools.WISC3.WebComponent/Silvestre.Psychology.Tools.WISC3.WebComponent.csproj", "Silvestre.Psychology.Tools.WISC3.WebComponent/"]
COPY ["src/Silvestre.Psychology.Tools.ViewModels/Silvestre.Psychology.Tools.ViewModels.csproj", "Silvestre.Psychology.Tools.ViewModels/"]
COPY ["src/Silvestre.Psychology.Tools.WebApp/Silvestre.Psychology.Tools.WebApp.csproj", "Silvestre.Psychology.Tools.WebApp/"]
RUN dotnet restore "Silvestre.Psychology.Tools.WebApp/Silvestre.Psychology.Tools.WebApp.csproj"
COPY src/. .
WORKDIR "/src/Silvestre.Psychology.Tools.WebApp"
RUN dotnet build "Silvestre.Psychology.Tools.WebApp.csproj" -c Release -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "Silvestre.Psychology.Tools.WebApp.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Silvestre.Psychology.Tools.WebApp.dll"]
#See https://aka.ms/containerfastmode to understand how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/core/aspnet:3.1-buster-slim AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/core/sdk:3.1-buster AS build
WORKDIR /src
COPY ["Silvestre.Pshychology.Tools.WebApp/Silvestre.Pshychology.Tools.WebApp.csproj", "Silvestre.Pshychology.Tools.WebApp/"]
RUN dotnet restore "Silvestre.Pshychology.Tools.WebApp/Silvestre.Pshychology.Tools.WebApp.csproj"
COPY . .
WORKDIR "/src/Silvestre.Pshychology.Tools.WebApp"
RUN dotnet build "Silvestre.Pshychology.Tools.WebApp.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Silvestre.Pshychology.Tools.WebApp.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Silvestre.Pshychology.Tools.WebApp.dll"]
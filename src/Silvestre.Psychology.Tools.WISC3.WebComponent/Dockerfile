FROM mcr.microsoft.com/dotnet/aspnet:7.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:7.0 AS build
WORKDIR /src
COPY ["src/Silvestre.Psychology.Tools.WISC3.WebComponent/Silvestre.Psychology.Tools.WISC3.WebComponent.csproj", "Silvestre.Psychology.Tools.WISC3.WebComponent/"]
RUN dotnet restore "Silvestre.Psychology.Tools.WISC3.WebComponent/Silvestre.Psychology.Tools.WISC3.WebComponent.csproj"
COPY src/ .
WORKDIR "/src/Silvestre.Psychology.Tools.WISC3.WebComponent"
RUN dotnet build "Silvestre.Psychology.Tools.WISC3.WebComponent.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Silvestre.Psychology.Tools.WISC3.WebComponent.csproj" -c Release -o /app/publish

FROM nginx:alpine AS final
WORKDIR /usr/share/nginx/html
COPY --from=publish /app/publish/wwwroot .
COPY build/docker/nginx.conf /etc/nginx/nginx.conf
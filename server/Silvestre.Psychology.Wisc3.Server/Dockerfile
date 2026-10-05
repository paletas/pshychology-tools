# WISC-III next: offline-first PWA + reference-data server. Build context = repo root:
#   docker build -f server/Silvestre.Psychology.Wisc3.Server/Dockerfile .
FROM node:26-bookworm-slim AS web
WORKDIR /repo
COPY data/ data/
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web/ web/
# tsc -b typechecks web/test, which imports this node-only script
COPY tests/e2e/scripts/ui-class-audit.ts tests/e2e/scripts/
RUN cd web && npm run build

# server/global.json is NOT copied: its SDK pin is for local dev; the image uses sdk:10.0 like the old Dockerfile.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
COPY server/Silvestre.Psychology.Wisc3.Server/*.csproj server/Silvestre.Psychology.Wisc3.Server/
RUN dotnet restore server/Silvestre.Psychology.Wisc3.Server/Silvestre.Psychology.Wisc3.Server.csproj
COPY server/Silvestre.Psychology.Wisc3.Server/ server/Silvestre.Psychology.Wisc3.Server/
RUN dotnet publish server/Silvestre.Psychology.Wisc3.Server/Silvestre.Psychology.Wisc3.Server.csproj -c Release -o /out /p:UseAppHost=false --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server /out .
COPY --from=web /repo/web/dist ./spa
COPY data/wisc3-pt ./data/wisc3-pt
ENV ASPNETCORE_HTTP_PORTS=8080 Spa__Root=/app/spa ReferenceData__Path=/app/data/wisc3-pt
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet","Silvestre.Psychology.Wisc3.Server.dll"]

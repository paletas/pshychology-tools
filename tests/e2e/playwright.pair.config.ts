import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { dataDir, e2eDir, oldPublish, repoRoot, webDist } from './specs/helpers/paths';

// Old app (root) + new app (/new/) behind prefix-proxy.mjs on one origin, as in production. Needs `npm run old:publish` first.
const OLD = 'http://localhost:5110';
const NEW = 'http://localhost:5210';
const PROXY = 'http://localhost:5310';
const common = { locale: 'pt-PT', timezoneId: 'Europe/Lisbon', baseURL: `${PROXY}/`, serviceWorkers: 'allow' as const };

export default defineConfig({
  testDir: './specs',
  testMatch: 'specs/pair/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000, // the old app boots twice per test
  reporter: [['list']],
  outputDir: resolve(e2eDir, 'test-results'),
  webServer: [
    {
      command: `dotnet Silvestre.Psychology.Tools.WebApp.dll --urls ${OLD}`,
      cwd: oldPublish,
      env: { ASPNETCORE_ENVIRONMENT: 'Production', NewApp__Url: '/new/wisc3' },
      url: `${OLD}/wisc3`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `dotnet run --project Silvestre.Psychology.Wisc3.Server -c Release --no-launch-profile --urls ${NEW}`,
      cwd: resolve(repoRoot, 'server'),
      env: { Spa__Root: webDist, ReferenceData__Path: dataDir, Legacy__Url: `${PROXY}/wisc3` },
      url: `${NEW}/healthz`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/prefix-proxy.mjs',
      cwd: e2eDir,
      env: { PROXY_PORT: '5310', NEW_UPSTREAM: NEW, ROOT_UPSTREAM: OLD },
      url: `${PROXY}/new/healthz`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
});

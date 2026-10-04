import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { dataDir, e2eDir, oldPublish, repoRoot, webDist } from './specs/helpers/paths';

const OLD = 'http://localhost:5100';
const NEW = 'http://localhost:5200';
const common = {
  ...devices['Desktop Chrome'],
  locale: 'pt-PT',
  timezoneId: 'Europe/Lisbon',
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'allow' as const,
  launchOptions: {
    args: [
      '--host-resolver-rules=MAP *.googlesyndication.com 0.0.0.0, MAP *.doubleclick.net 0.0.0.0, MAP *.googleadservices.com 0.0.0.0',
    ],
  },
};

export default defineConfig({
  testDir: './specs',
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: resolve(e2eDir, 'test-results'),
  webServer: [
    {
      // old app: published non-AOT Release build
      command: `dotnet Silvestre.Psychology.Tools.WebApp.dll --urls ${OLD}`,
      cwd: oldPublish,
      env: { ASPNETCORE_ENVIRONMENT: 'Production' },
      url: `${OLD}/wisc3`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      // new app: the real web/dist and data/wisc3-pt
      command: 'dotnet run --project Silvestre.Psychology.Wisc3.Server -c Release --no-launch-profile --urls ' + NEW,
      cwd: resolve(repoRoot, 'server'),
      // Legacy__Url stays unset: the compare runs without the back-to-old link
      env: { Spa__Root: webDist, ReferenceData__Path: dataDir, Legacy__Url: '' },
      url: `${NEW}/healthz`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'compare', testMatch: 'specs/compare/*.spec.ts', use: common },
    { name: 'timing', testMatch: 'specs/timing/*.spec.ts', use: common },
  ],
});

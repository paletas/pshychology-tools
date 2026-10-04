import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { e2eDir, repoRoot, tmpData, tmpSpa } from './specs/helpers/paths';

const BASE = 'http://localhost:5201';
const common = { locale: 'pt-PT', timezoneId: 'Europe/Lisbon', baseURL: BASE };

export default defineConfig({
  testDir: './specs',
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: resolve(e2eDir, 'test-results'),
  webServer: {
    // new app for behaviour and flow tests: Spa root and data are per-test copies under .tmp
    command: `node "${resolve(e2eDir, 'scripts/prepare-tmp.mjs')}" && dotnet run --project Silvestre.Psychology.Wisc3.Server -c Release --no-launch-profile --urls ${BASE}`,
    cwd: resolve(repoRoot, 'server'),
    env: { Spa__Root: tmpSpa, ReferenceData__Path: tmpData },
    url: `${BASE}/healthz`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'behaviour',
      testMatch: ['specs/behaviour/*.spec.ts', 'specs/ui/*.spec.ts'],
      use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'flow-chromium-desktop',
      testMatch: 'specs/flow/*.spec.ts',
      use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'flow-webkit-desktop',
      testMatch: 'specs/flow/*.spec.ts',
      use: { ...devices['Desktop Safari'], ...common, viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'flow-webkit-ipad',
      testMatch: 'specs/flow/*.spec.ts',
      use: { ...devices['Desktop Safari'], ...common, viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: 'flow-chromium-phone',
      testMatch: 'specs/flow/*.spec.ts',
      use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 375, height: 812 } },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { e2eDir, fixturesDir, repoRoot, tmpData, tmpSpa } from './specs/helpers/paths';

// New app behind prefix-proxy.mjs under /new/ (stand-in for Traefik stripprefix); the previous app's stub sits at the origin root.
const NEW = 'http://localhost:5202';
const PROXY = 'http://localhost:5203';

export default defineConfig({
  testDir: './specs',
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: resolve(e2eDir, 'test-results'),
  webServer: [
    {
      // new app: Spa root and data are per-test copies under .tmp
      command: `node "${resolve(e2eDir, 'scripts/prepare-tmp.mjs')}" && dotnet run --project Silvestre.Psychology.Wisc3.Server -c Release --no-launch-profile --urls ${NEW}`,
      cwd: resolve(repoRoot, 'server'),
      env: { Spa__Root: tmpSpa, ReferenceData__Path: tmpData, Legacy__Url: '' },
      url: `${NEW}/healthz`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/prefix-proxy.mjs',
      cwd: e2eDir,
      env: { PROXY_PORT: '5203', NEW_UPSTREAM: NEW, ROOT_DIR: resolve(fixturesDir, 'stub') },
      url: `${PROXY}/new/healthz`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'prefix',
      testMatch: [
        'specs/behaviour/{offline,app-update,refdata-update,cross-origin,memory-only}.spec.ts',
        'specs/ui/legacy.spec.ts',
        'specs/prefix/*.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        locale: 'pt-PT',
        timezoneId: 'Europe/Lisbon',
        baseURL: `${PROXY}/new/`,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});

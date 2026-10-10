import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { e2eDir } from './specs/helpers/paths';

// Read-only switch test against production (no webServer): SWITCH_PHASE=post npm run test:prod
// post: new app at /, old app at /legacy (switch.spec.ts + new-and-root.spec.ts)
const phase = process.env.SWITCH_PHASE;
if (phase !== 'post') throw new Error('set SWITCH_PHASE=post');
const common = { locale: 'pt-PT', timezoneId: 'Europe/Lisbon', baseURL: 'https://psy.itssilvestre.com/', serviceWorkers: 'allow' as const };

export default defineConfig({
  testDir: './specs',
  testMatch: ['specs/pair/switch.spec.ts', 'specs/pair/new-and-root.spec.ts'],
  workers: 1,
  fullyParallel: false,
  retries: 1,
  timeout: 120_000, // the old app boots twice per test
  reporter: [['list']],
  outputDir: resolve(e2eDir, 'test-results'),
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
});

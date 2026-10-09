import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { e2eDir } from './specs/helpers/paths';

// Read-only switch test against production (no webServer): SWITCH_PHASE=pre|mid|post npm run test:prod
// pre : before L1 (old app at /, banner; switch-pre.spec.ts)
// mid : between L1 and L2 (only the @legacy tests of switch.spec.ts: old app 1.3.0 at /legacy)
// post: after the flip (new app at /, old app at /legacy; switch.spec.ts + new-and-root.spec.ts)
const phase = process.env.SWITCH_PHASE;
if (phase !== 'pre' && phase !== 'mid' && phase !== 'post') throw new Error('set SWITCH_PHASE=pre|mid|post (pre = before L1, mid = between L1 and L2, post = after the flip)');
const common = { locale: 'pt-PT', timezoneId: 'Europe/Lisbon', baseURL: 'https://psy.itssilvestre.com/', serviceWorkers: 'allow' as const };

export default defineConfig({
  testDir: './specs',
  testMatch: phase === 'pre' ? 'specs/pair/switch-pre.spec.ts' : ['specs/pair/switch.spec.ts', 'specs/pair/new-and-root.spec.ts'],
  grep: phase === 'mid' ? /@legacy/ : undefined,
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

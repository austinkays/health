import { defineConfig } from '@playwright/test';

// Visual regression setup
// ─────────────────────────────────────────────────────────────────────────────
// First run: `npm run test:visual:update` generates baseline snapshots in
//   tests/visual/__snapshots__. Commit those files — CI compares against them.
//
// Updating a snapshot intentionally: `npm run test:visual:update` then commit.
//
// Viewing failures: open playwright-report/index.html for a visual diff.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  testDir: 'tests/visual',
  snapshotDir: 'tests/visual/__snapshots__',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry in CI absorbs flaky subpixel diffs on the first run
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list']],

  use: {
    baseURL: 'http://localhost:5173',
  },

  projects: [
    // The two most common iOS viewport widths — the gap where mobile-specific
    // layout bugs (like the install prompt) tend to hide.
    { name: 'mobile-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'mobile-430', use: { viewport: { width: 430, height: 932 } } },
    // Desktop baseline
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],

  webServer: {
    command: 'npm run dev',
    port: 5173,
    // Reuse a running dev server locally so tests start instantly.
    // In CI always start fresh.
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

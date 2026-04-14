import { test, expect } from '@playwright/test';

// InstallPrompt — the bottom-sheet that invites users to add Salve to their
// home screen. The bug this test is designed to catch: layout constraints
// that only apply at md: (768px+) and silently break on 375/430px viewports.
//
// Strategy: spoof an iOS user agent so isIOS() returns true and the component
// enters iOS-instructions mode. Fresh browser context = empty localStorage, so
// hasBeenDismissed() and hasBeenSeen() both return false. The preAuth timer
// (rendered on the auth screen) fires after 600ms.

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

test.describe('InstallPrompt', () => {
  test.use({ userAgent: IOS_UA });

  test.beforeEach(async ({ page }) => {
    // Navigate to the app unauthenticated → auth screen → preAuth InstallPrompt
    await page.goto('/');
  });

  test('shows within viewport bounds', async ({ page }) => {
    // preAuth iOS timer fires at 600ms; give up to 3s for slower CI machines
    const dialog = page.getByRole('dialog', { name: 'Install Salve' });
    await dialog.waitFor({ state: 'visible', timeout: 3000 });

    // Wait for the slide-in transition to finish (0.32s ease)
    await page.waitForTimeout(400);

    // ── Layout assertions ───────────────────────────────────────────────────
    // These fail immediately with a clear message if the dialog overflows the
    // viewport, even before the screenshot comparison runs.
    const box = await dialog.boundingBox();
    const vp = page.viewportSize();

    expect(box.x, 'left edge must not be clipped').toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      'right edge must not overflow viewport'
    ).toBeLessThanOrEqual(vp.width + 1); // +1 for subpixel rounding

    // ── Visual snapshot ─────────────────────────────────────────────────────
    await expect(page).toHaveScreenshot({ animations: 'disabled' });
  });
});

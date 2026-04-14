import { test, expect } from '@playwright/test';

// Auth screen — shown to every unauthenticated visitor.
// Tests that the card, logo, and form lay out correctly at each viewport.

test.describe('Auth screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the email input — confirms the auth card is mounted and visible
    await page.waitForSelector('input[type="email"]', { timeout: 8000 });
  });

  test('renders correctly', async ({ page }) => {
    await expect(page).toHaveScreenshot({ animations: 'disabled' });
  });
});

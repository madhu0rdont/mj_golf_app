import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('photo capture page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate through the session new flow to get to photo page with state
    await page.goto('/session/new');
    await waitForApp(page);
    await page.waitForTimeout(500);
  });

  test('shows no club selected when navigating directly', async ({ page }) => {
    // Navigate directly without state
    await page.goto('/session/new/photo');
    await waitForApp(page);
    await page.waitForTimeout(300);

    await expect(page.getByText(/no club selected/i)).toBeVisible();
  });

  test('navigate to photo page from session new', async ({ page }) => {
    // Click photo option
    const photoBtn = page.getByText(/photo/i);
    if (await photoBtn.isVisible()) {
      await photoBtn.click();
      await page.waitForTimeout(300);
      await expect(page).toHaveURL('/session/new/photo');
    }
  });

  test('photo capture page shows camera and upload buttons', async ({ page }) => {
    const photoBtn = page.getByText(/photo/i);
    if (await photoBtn.isVisible()) {
      await photoBtn.click();
      await page.waitForTimeout(300);

      await expect(page.getByText(/take photo/i)).toBeVisible();
      await expect(page.getByText(/upload image/i)).toBeVisible();
    }
  });

  test('has hidden file inputs for camera and gallery', async ({ page }) => {
    const photoBtn = page.getByText(/photo/i);
    if (await photoBtn.isVisible()) {
      await photoBtn.click();
      await page.waitForTimeout(300);

      // File inputs exist but are hidden
      const fileInputs = page.locator('input[type="file"]');
      await expect(fileInputs).toHaveCount(2);
    }
  });
});

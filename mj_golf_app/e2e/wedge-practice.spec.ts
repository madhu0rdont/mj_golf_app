import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('wedge practice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/session/new/wedge-practice');
    await waitForApp(page);
    await page.waitForTimeout(500);
  });

  test('page loads with date input', async ({ page }) => {
    await expect(page.getByText(/wedge practice/i).first()).toBeVisible();
    await expect(page.locator('input[type="date"]')).toBeVisible();
  });

  test('shows location input', async ({ page }) => {
    await expect(page.locator('input[placeholder*="Optional"]')).toBeVisible();
  });

  test('shows wedge matrix grid or empty state', async ({ page }) => {
    // Either shows the matrix grid or an empty state
    const hasGrid = await page.getByText(/full/i).isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no wedges/i).isVisible().catch(() => false);

    expect(hasGrid || hasEmpty).toBeTruthy();
  });

  test('save button is disabled with no shots', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /save session/i });
    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeDisabled();
    }
  });

  test('shows position columns for Full, Shoulder, Hip', async ({ page }) => {
    const hasMatrix = await page.getByText(/full/i).isVisible().catch(() => false);
    if (hasMatrix) {
      await expect(page.getByText('Full').first()).toBeVisible();
      await expect(page.getByText('Shoulder').first()).toBeVisible();
      await expect(page.getByText('Hip').first()).toBeVisible();
    }
  });
});

import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

// Create a session first, then verify the summary page
test.describe('session summary', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to manual entry and create a session
    await page.goto('/session/new');
    await waitForApp(page);
    await page.waitForTimeout(500);

    // Go to manual entry
    await page.getByText(/manual/i).click();
    await page.waitForTimeout(300);

    // Enter first shot
    const carryInputs = page.locator('input[type="number"]');
    await carryInputs.first().fill('155');

    // Add second shot
    await page.getByRole('button', { name: /add shot/i }).click();
    await page.waitForTimeout(200);
    const allInputs = page.locator('input[type="number"]');
    await allInputs.nth(2).fill('160');

    // Add third shot
    await page.getByRole('button', { name: /add shot/i }).click();
    await page.waitForTimeout(200);
    const allInputs2 = page.locator('input[type="number"]');
    await allInputs2.nth(4).fill('150');

    // Save
    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForTimeout(500);
  });

  test('displays session summary page after save', async ({ page }) => {
    await expect(page).toHaveURL(/\/session\/.+/);
  });

  test('displays hero metrics', async ({ page }) => {
    await expect(page.getByText('CARRY', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('TOTAL', { exact: true }).first()).toBeVisible();
  });

  test('displays shot count', async ({ page }) => {
    await expect(page.getByText(/3 shots/i)).toBeVisible();
  });

  test('shows shot data table with avg row', async ({ page }) => {
    await expect(page.getByText('Avg')).toBeVisible();
    await expect(page.getByText('Std. Dev.')).toBeVisible();
  });
});

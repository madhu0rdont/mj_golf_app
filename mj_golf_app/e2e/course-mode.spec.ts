import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('course mode', () => {
  test.beforeEach(async ({ page }) => {
    // First create a session so we have yardage data
    await page.goto('/session/new');
    await waitForApp(page);
    await page.waitForTimeout(500);

    await page.getByText(/manual/i).click();
    await page.waitForTimeout(300);

    const carryInputs = page.locator('input[type="number"]');
    await carryInputs.first().fill('155');

    await page.getByRole('button', { name: /add shot/i }).click();
    await page.waitForTimeout(200);
    const allInputs = page.locator('input[type="number"]');
    await allInputs.nth(2).fill('160');

    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForTimeout(500);

    // Navigate to course mode
    await page.goto('/course');
    await waitForApp(page);
    await page.waitForTimeout(300);
  });

  test('shows target distance input', async ({ page }) => {
    await expect(page.locator('input[type="number"]')).toBeVisible();
  });

  test('enter target yardage and see recommendations', async ({ page }) => {
    await page.locator('input[type="number"]').fill('155');
    await page.waitForTimeout(500);

    // Should show at least one recommendation
    await expect(page.getByText(/great|ok|stretch/i)).toBeVisible();
  });

  test('shows no results for extreme target', async ({ page }) => {
    await page.locator('input[type="number"]').fill('350');
    await page.waitForTimeout(500);

    // Should show no clubs within range
    await expect(page.getByText(/no club/i)).toBeVisible();
  });
});

test('shows empty state when no data exists', async ({ page }) => {
  // Navigate to course with a fresh context (no sessions)
  await page.goto('/course');
  await waitForApp(page);
  await page.waitForTimeout(500);

  // With no sessions, should show empty state
  await expect(page.getByText(/no yardage data/i)).toBeVisible();
});

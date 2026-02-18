import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('session flight view with trajectory data', () => {
  test.beforeEach(async ({ page }) => {
    // Create a session via CSV with full trajectory data
    await page.goto('/session/new');
    await waitForApp(page);
    await page.waitForTimeout(500);

    await page.getByText(/csv/i).click();
    await expect(page).toHaveURL('/session/new/csv');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'sample-shots.csv'));
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForTimeout(500);

    // Now on session summary page
    await expect(page).toHaveURL(/\/session\/.+/);
  });

  test('displays metrics bar with CARRY and TOTAL labels', async ({ page }) => {
    await expect(page.getByText('CARRY', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('TOTAL', { exact: true }).first()).toBeVisible();
  });

  test('displays trajectory SVG chart', async ({ page }) => {
    await expect(page.locator('svg[aria-label="Side-view trajectory chart"]')).toBeVisible();
  });

  test('displays dispersion SVG chart', async ({ page }) => {
    await expect(page.locator('svg[aria-label="Top-down dispersion chart"]')).toBeVisible();
  });

  test('displays metrics values from shot data', async ({ page }) => {
    // Should show SPEED, LAUNCH, SPIN metric labels in the metrics bar
    await expect(page.getByText('SPEED', { exact: true })).toBeVisible();
    await expect(page.getByText('LAUNCH', { exact: true })).toBeVisible();
    await expect(page.getByText('SPIN', { exact: true })).toBeVisible();
  });
});

test('shows fallback when trajectory data is missing', async ({ page }) => {
  // Create a manual session with only carry values
  await page.goto('/session/new');
  await waitForApp(page);
  await page.waitForTimeout(500);

  await page.getByText(/manual/i).click();
  await page.waitForTimeout(300);

  const carryInputs = page.locator('input[type="number"]');
  await carryInputs.first().fill('155');

  await page.getByRole('button', { name: /save/i }).click();
  await page.waitForTimeout(500);

  // Should show fallback message instead of trajectory chart
  await expect(page.getByText(/trajectory data not available/i)).toBeVisible();
});

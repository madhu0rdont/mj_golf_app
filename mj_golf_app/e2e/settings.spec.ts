import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await waitForApp(page);
  await page.waitForTimeout(300);
});

test('settings page loads', async ({ page }) => {
  await expect(page.getByText(/settings/i).first()).toBeVisible();
});

test('API key input is masked by default', async ({ page }) => {
  const input = page.locator('input[type="password"]');
  await expect(input).toBeVisible();
});

test('export data button is present', async ({ page }) => {
  await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
});

test('import backup file', async ({ page }) => {
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.isVisible()) {
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'sample-backup.json'));
    await page.waitForTimeout(1000);

    // Verify import success message or data is loaded
    // Navigate to bag to verify data was imported
    await page.goto('/bag');
    await waitForApp(page);
    await page.waitForTimeout(500);
    await expect(page.getByText('7 Iron')).toBeVisible();
  }
});

test('clear all data button shows confirmation', async ({ page }) => {
  const clearButton = page.getByRole('button', { name: /clear all/i });
  if (await clearButton.isVisible()) {
    await clearButton.click();
    // Should show a confirmation modal
    await expect(page.getByText(/confirm|are you sure|delete everything/i)).toBeVisible();
  }
});

test('shows version info', async ({ page }) => {
  await expect(page.getByText(/1\.0\.0/)).toBeVisible();
});

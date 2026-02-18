import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.beforeEach(async ({ page }) => {
  await page.goto('/session/new');
  await waitForApp(page);
  await page.waitForTimeout(500);
});

test('navigate to CSV import page', async ({ page }) => {
  await page.getByText(/csv/i).click();
  await expect(page).toHaveURL('/session/new/csv');
});

test('upload sample CSV file and verify shot count', async ({ page }) => {
  await page.getByText(/csv/i).click();
  await expect(page).toHaveURL('/session/new/csv');

  // Upload the CSV file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'sample-shots.csv'));

  // Wait for parsing
  await page.waitForTimeout(500);

  // Should show 5 shots from our CSV
  await expect(page.getByText(/5 shot/i).first()).toBeVisible();
});

test('save imported session and verify redirect', async ({ page }) => {
  await page.getByText(/csv/i).click();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'sample-shots.csv'));
  await page.waitForTimeout(500);

  // Save the session
  await page.getByRole('button', { name: /save/i }).click();
  await page.waitForTimeout(500);

  // Should redirect to session summary
  await expect(page).toHaveURL(/\/session\/.+/);
});

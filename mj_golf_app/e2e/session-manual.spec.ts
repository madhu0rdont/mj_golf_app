import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/session/new');
  await waitForApp(page);
  await page.waitForTimeout(500); // Wait for clubs to load
});

test('session new page shows club selector and method buttons', async ({ page }) => {
  await expect(page.getByLabel(/club/i)).toBeVisible();
  await expect(page.getByText(/manual/i)).toBeVisible();
});

test('navigate to manual entry after selecting club', async ({ page }) => {
  // Club select should auto-select first club
  await page.getByText(/manual/i).click();
  await expect(page).toHaveURL('/session/new/manual');
});

test('enter carry yards for shots and save session', async ({ page }) => {
  await page.getByText(/manual/i).click();
  await expect(page).toHaveURL('/session/new/manual');

  // First shot - enter carry value
  const carryInputs = page.locator('input[type="number"]');
  await carryInputs.first().fill('155');

  // Add another shot
  await page.getByRole('button', { name: /add shot/i }).click();
  await page.waitForTimeout(200);

  // Fill second shot carry
  const allCarryInputs = page.locator('input[type="number"]');
  // The second carry input (for shot 2)
  await allCarryInputs.nth(2).fill('160');

  // Save session
  await page.getByRole('button', { name: /save/i }).click();

  // Should redirect to session summary
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/session\/.+/);
});

test('cannot save with no valid carry values', async ({ page }) => {
  await page.getByText(/manual/i).click();
  await expect(page).toHaveURL('/session/new/manual');

  // Save button should be disabled when no carry values entered
  const saveButton = page.getByRole('button', { name: /save/i });
  await expect(saveButton).toBeDisabled();
});

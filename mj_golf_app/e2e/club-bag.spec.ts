import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/bag');
  await waitForApp(page);
});

test('default bag loads with 14 clubs on first visit', async ({ page }) => {
  // Wait for clubs to load from IndexedDB seed
  await page.waitForTimeout(500);
  await expect(page.getByText('14 clubs')).toBeVisible();
});

test('shows club names from default bag', async ({ page }) => {
  await page.waitForTimeout(500);
  await expect(page.getByText('Driver', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('7 Iron', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('PW', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Putter', { exact: true }).first()).toBeVisible();
});

test('add new club via form', async ({ page }) => {
  await page.waitForTimeout(500);
  // Click the "Add Club" link
  await page.getByRole('link', { name: /add club/i }).first().click();
  await expect(page).toHaveURL('/bag/new');

  // Fill out the club form
  await page.getByLabel(/name/i).fill('60 Degree');
  await page.getByLabel(/category/i).selectOption('wedge');

  // Save (button says "Add Club" on new club form)
  await page.getByRole('button', { name: /add club/i }).click();
  await expect(page).toHaveURL('/bag');

  // Verify the new club appears
  await page.waitForTimeout(300);
  await expect(page.getByText('60 Degree')).toBeVisible();
  await expect(page.getByText('15 clubs')).toBeVisible();
});

test('navigate to edit form by clicking a club', async ({ page }) => {
  await page.waitForTimeout(500);
  // Click on the Driver club card
  await page.getByText('Driver').first().click();
  await expect(page).toHaveURL(/\/bag\/.*\/edit/);
});

test('edit existing club name', async ({ page }) => {
  await page.waitForTimeout(500);
  await page.getByText('Driver').first().click();
  await expect(page).toHaveURL(/\/bag\/.*\/edit/);

  // Clear and type new name
  const nameInput = page.getByLabel(/name/i);
  await nameInput.clear();
  await nameInput.fill('Big Driver');
  await page.getByRole('button', { name: /save/i }).click();

  await expect(page).toHaveURL('/bag');
  await page.waitForTimeout(300);
  await expect(page.getByText('Big Driver')).toBeVisible();
});

test('delete club shows confirmation and removes it', async ({ page }) => {
  await page.waitForTimeout(500);
  await page.getByText('Putter').first().click();

  // Click delete button
  await page.getByRole('button', { name: /delete/i }).click();

  // Confirm deletion in modal (button says "Delete")
  await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click();

  await expect(page).toHaveURL('/bag');
  await page.waitForTimeout(300);
  await expect(page.getByText('13 clubs')).toBeVisible();
});

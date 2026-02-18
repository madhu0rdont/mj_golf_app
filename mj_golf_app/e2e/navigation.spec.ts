import { test, expect } from '@playwright/test';
import { waitForApp, clearIndexedDB } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
});

test('bottom nav has 4 tabs', async ({ page }) => {
  const nav = page.locator('nav');
  await expect(nav.getByRole('link')).toHaveCount(4);
});

test('Home tab navigates to dashboard', async ({ page }) => {
  await page.getByRole('link', { name: 'Bag' }).click();
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL('/');
});

test('Bag tab navigates to /bag', async ({ page }) => {
  await page.getByRole('link', { name: 'Bag' }).click();
  await expect(page).toHaveURL('/bag');
});

test('Yardage tab navigates to /yardage', async ({ page }) => {
  await page.locator('nav').getByRole('link', { name: 'Yardage' }).click();
  await expect(page).toHaveURL('/yardage');
});

test('Course tab navigates to /course', async ({ page }) => {
  await page.locator('nav').getByRole('link', { name: 'Course' }).click();
  await expect(page).toHaveURL('/course');
});

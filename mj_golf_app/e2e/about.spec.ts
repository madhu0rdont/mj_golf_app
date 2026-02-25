import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('about page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await waitForApp(page);
    await page.waitForTimeout(300);
  });

  test('shows app name and description', async ({ page }) => {
    await expect(page.getByText('MJ Golf')).toBeVisible();
    await expect(page.getByText(/foresight gc4/i)).toBeVisible();
  });

  test('shows version number', async ({ page }) => {
    await expect(page.getByText('v1.0.0')).toBeVisible();
  });

  test('shows developer info', async ({ page }) => {
    await expect(page.getByText('Madhukrishna Josyula')).toBeVisible();
  });

  test('shows social links', async ({ page }) => {
    await expect(page.getByText('LinkedIn')).toBeVisible();
    await expect(page.getByText('GitHub')).toBeVisible();
    await expect(page.getByText('X')).toBeVisible();
  });

  test('How It Works link navigates to /faq', async ({ page }) => {
    await page.getByText(/how it works/i).click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL('/faq');
  });

  test('shows copyright with current year', async ({ page }) => {
    const year = new Date().getFullYear();
    await expect(page.getByText(new RegExp(`${year}`))).toBeVisible();
  });
});

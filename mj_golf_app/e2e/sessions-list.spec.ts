import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('sessions list', () => {
  test('shows empty state when no sessions exist', async ({ page }) => {
    await page.goto('/sessions');
    await waitForApp(page);
    await page.waitForTimeout(500);

    await expect(page.getByText(/no sessions yet/i)).toBeVisible();
  });

  test.describe('with session data', () => {
    test.beforeEach(async ({ page }) => {
      // Create a session first
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

      // Navigate to sessions list
      await page.goto('/sessions');
      await waitForApp(page);
      await page.waitForTimeout(500);
    });

    test('displays session cards with shot count', async ({ page }) => {
      await expect(page.getByText(/2 shots/i).first()).toBeVisible();
    });

    test('clicking a session navigates to summary', async ({ page }) => {
      // Click the session card (not the edit/delete buttons)
      const sessionCard = page.locator('button').filter({ hasText: /shots/i }).first();
      await sessionCard.click();
      await page.waitForTimeout(300);

      await expect(page).toHaveURL(/\/session\/.+/);
    });

    test('edit button opens edit modal', async ({ page }) => {
      await page.getByLabel(/edit session/i).first().click();
      await page.waitForTimeout(300);

      await expect(page.getByText(/edit session/i)).toBeVisible();
      await expect(page.getByLabel(/date/i)).toBeVisible();
    });

    test('delete button shows confirmation dialog', async ({ page }) => {
      await page.getByLabel(/delete session/i).first().click();
      await page.waitForTimeout(300);

      await expect(page.getByText(/delete session/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    });

    test('confirming delete removes the session', async ({ page }) => {
      await page.getByLabel(/delete session/i).first().click();
      await page.waitForTimeout(300);

      await page.getByRole('button', { name: /delete/i }).last().click();
      await page.waitForTimeout(500);

      await expect(page.getByText(/no sessions yet/i)).toBeVisible();
    });
  });
});

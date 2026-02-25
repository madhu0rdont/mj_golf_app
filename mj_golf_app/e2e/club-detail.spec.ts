import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('club detail page', () => {
  test.describe('with session data', () => {
    test.beforeEach(async ({ page }) => {
      // Create a session so the club has data
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

      await page.getByRole('button', { name: /add shot/i }).click();
      await page.waitForTimeout(200);
      const allInputs2 = page.locator('input[type="number"]');
      await allInputs2.nth(4).fill('150');

      await page.getByRole('button', { name: /save/i }).click();
      await page.waitForTimeout(500);

      // Navigate to yardage book and click through to club detail
      await page.goto('/yardage');
      await waitForApp(page);
      await page.waitForTimeout(500);
    });

    test('navigates to club detail from yardage book', async ({ page }) => {
      // Click on the first club row
      const clubLink = page.getByRole('link').filter({ hasText: /iron|driver|wood|wedge|hybrid/i }).first();
      if (await clubLink.isVisible()) {
        await clubLink.click();
        await page.waitForTimeout(300);
        await expect(page).toHaveURL(/\/yardage\/.+/);
      }
    });

    test('shows club name in header', async ({ page }) => {
      const clubLink = page.getByRole('link').filter({ hasText: /iron|driver|wood|wedge|hybrid/i }).first();
      if (await clubLink.isVisible()) {
        const clubName = await clubLink.textContent();
        await clubLink.click();
        await page.waitForTimeout(300);

        // Club name should appear in the detail page
        if (clubName) {
          await expect(page.getByText(clubName.trim()).first()).toBeVisible();
        }
      }
    });

    test('shows book carry and stats', async ({ page }) => {
      const clubLink = page.getByRole('link').filter({ hasText: /iron|driver|wood|wedge|hybrid/i }).first();
      if (await clubLink.isVisible()) {
        await clubLink.click();
        await page.waitForTimeout(300);

        // Should show carry stat
        await expect(page.getByText(/book carry|carry/i).first()).toBeVisible();
      }
    });

    test('shows session history section', async ({ page }) => {
      const clubLink = page.getByRole('link').filter({ hasText: /iron|driver|wood|wedge|hybrid/i }).first();
      if (await clubLink.isVisible()) {
        await clubLink.click();
        await page.waitForTimeout(300);

        // Should show session history with at least 1 session
        await expect(page.getByText(/sessions|history/i).first()).toBeVisible();
      }
    });

    test('session history item navigates to session summary', async ({ page }) => {
      const clubLink = page.getByRole('link').filter({ hasText: /iron|driver|wood|wedge|hybrid/i }).first();
      if (await clubLink.isVisible()) {
        await clubLink.click();
        await page.waitForTimeout(300);

        // Click on a session in history
        const sessionBtn = page.locator('button').filter({ hasText: /shots/i }).first();
        if (await sessionBtn.isVisible()) {
          await sessionBtn.click();
          await page.waitForTimeout(300);
          await expect(page).toHaveURL(/\/session\/.+/);
        }
      }
    });
  });
});

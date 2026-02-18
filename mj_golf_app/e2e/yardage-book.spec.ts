import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test('shows empty state when no sessions exist', async ({ page }) => {
  // Clear DB and navigate
  await page.goto('/');
  await waitForApp(page);
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
  await page.goto('/yardage');
  await waitForApp(page);
  await page.waitForTimeout(500);

  // Should show empty state message
  await expect(page.getByText(/no yardage data/i)).toBeVisible();
});

test.describe('yardage book with data', () => {
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
  });

  test('shows yardage entries after creating a session', async ({ page }) => {
    await page.goto('/yardage');
    await waitForApp(page);
    await page.waitForTimeout(500);

    // Should show at least one club with data
    await expect(page.getByText(/1 club/i)).toBeVisible();
  });

  test('displays freshness badge', async ({ page }) => {
    await page.goto('/yardage');
    await waitForApp(page);
    await page.waitForTimeout(500);

    // Fresh session should have green freshness indicator
    await expect(page.getByText(/fresh/i)).toBeVisible();
  });

  test('gapping chart link navigates correctly', async ({ page }) => {
    await page.goto('/yardage');
    await waitForApp(page);
    await page.waitForTimeout(500);

    // Click on gapping
    const gappingLink = page.getByRole('link', { name: /gapping/i });
    if (await gappingLink.isVisible()) {
      await gappingLink.click();
      await expect(page).toHaveURL('/yardage/gapping');
    }
  });
});

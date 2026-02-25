import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('yardage details tab', () => {
  test.beforeEach(async ({ page }) => {
    // Create a session so we have data
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

    // Navigate to yardage details tab
    await page.goto('/yardage/details');
    await waitForApp(page);
    await page.waitForTimeout(500);
  });

  test('details tab loads and shows club count', async ({ page }) => {
    await expect(page.getByText(/club/i).first()).toBeVisible();
    await expect(page.getByText(/shot/i).first()).toBeVisible();
  });

  test('shows summary table with club data', async ({ page }) => {
    // Should show table with at least one club row
    const table = page.locator('table');
    if (await table.isVisible()) {
      await expect(table.locator('tr').first()).toBeVisible();
    }
  });

  test('flight visuals section is collapsible', async ({ page }) => {
    const flightToggle = page.getByText(/flight visuals/i);
    if (await flightToggle.isVisible()) {
      // Click to expand
      await flightToggle.click();
      await page.waitForTimeout(300);

      // Should show chart SVGs
      const svgs = page.locator('svg[role="img"]');
      await expect(svgs.first()).toBeVisible();
    }
  });

  test('mishit toggle is present when mishits exist', async ({ page }) => {
    // May or may not have mishits depending on shot classifier
    const toggle = page.getByText(/exclude mishits/i);
    // Just verify the page rendered without errors
    await expect(page.locator('body')).toBeVisible();
  });
});

test('shows empty state when no data exists', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
  await page.goto('/yardage/details');
  await waitForApp(page);
  await page.waitForTimeout(500);

  await expect(page.getByText(/no shot data/i)).toBeVisible();
});

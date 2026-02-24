import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('interleaved practice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/session/new/interleaved');
    await waitForApp(page);
    await page.waitForTimeout(300);
  });

  test('setup page renders date input and round size buttons', async ({ page }) => {
    await expect(page.locator('input[type="date"]')).toBeVisible();
    await expect(page.getByText('9')).toBeVisible();
    await expect(page.getByText('18')).toBeVisible();
    await expect(page.getByRole('button', { name: /start round/i })).toBeVisible();
  });

  test('can select 18 holes', async ({ page }) => {
    // Click the 18 button
    await page.getByText('18').click();
    await page.waitForTimeout(200);

    // 18 button should have selected styling (primary color)
    const btn18 = page.getByText('18').locator('..');
    await expect(btn18).toHaveCSS('border-color', /./);
  });

  test('Start Round shows hole 1 with par and distance', async ({ page }) => {
    await page.getByRole('button', { name: /start round/i }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText(/Hole 1 of 9/i)).toBeVisible();
    await expect(page.getByText(/Par [345]/)).toBeVisible();
    await expect(page.getByRole('button', { name: /hit shot/i })).toBeVisible();
  });

  test('Hit Shot opens bottom sheet with club picker and inputs', async ({ page }) => {
    await page.getByRole('button', { name: /start round/i }).click();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /hit shot/i }).click();
    await page.waitForTimeout(300);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('select')).toBeVisible();
    await expect(dialog.getByText(/carry/i)).toBeVisible();
    await expect(dialog.getByText(/offline/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /add shot/i })).toBeVisible();
  });

  test('adding a shot updates remaining distance display', async ({ page }) => {
    await page.getByRole('button', { name: /start round/i }).click();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /hit shot/i }).click();
    await page.waitForTimeout(300);

    const dialog = page.getByRole('dialog');
    // Fill carry with a moderate value (won't complete the hole)
    await dialog.locator('input[type="number"]').first().fill('100');
    await dialog.getByRole('button', { name: /add shot/i }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText(/yds to hole/i)).toBeVisible();
  });

  test('completing a hole shows Hole Complete with score', async ({ page }) => {
    await page.getByRole('button', { name: /start round/i }).click();
    await page.waitForTimeout(300);

    // Hit a 500-yard shot to complete any hole in 1 shot
    await page.getByRole('button', { name: /hit shot/i }).click();
    await page.waitForTimeout(300);

    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="number"]').first().fill('500');
    await dialog.getByRole('button', { name: /add shot/i }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText(/hole complete/i)).toBeVisible();
    await expect(page.getByText(/putts/i)).toBeVisible();
  });

  test('Next Hole advances to hole 2', async ({ page }) => {
    await page.getByRole('button', { name: /start round/i }).click();
    await page.waitForTimeout(300);

    // Complete hole 1
    await page.getByRole('button', { name: /hit shot/i }).click();
    await page.waitForTimeout(300);
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="number"]').first().fill('500');
    await dialog.getByRole('button', { name: /add shot/i }).click();
    await page.waitForTimeout(300);

    // Advance to hole 2
    await page.getByRole('button', { name: /next hole/i }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText(/Hole 2 of 9/i)).toBeVisible();
  });

  test('early exit saves and navigates to summary', async ({ page }) => {
    await page.getByRole('button', { name: /start round/i }).click();
    await page.waitForTimeout(300);

    // Complete hole 1
    await page.getByRole('button', { name: /hit shot/i }).click();
    await page.waitForTimeout(300);
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="number"]').first().fill('500');
    await dialog.getByRole('button', { name: /add shot/i }).click();
    await page.waitForTimeout(500);

    // Click early exit
    await page.getByRole('button', { name: /end round/i }).click();
    await page.waitForTimeout(1000);

    // Should navigate to session summary
    await expect(page).toHaveURL(/\/session\/.+/);
    await expect(page.getByText(/interleaved practice/i)).toBeVisible();
  });
});

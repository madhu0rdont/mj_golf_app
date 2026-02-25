import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.describe('how it works page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/faq');
    await waitForApp(page);
    await page.waitForTimeout(300);
  });

  test('page loads with title', async ({ page }) => {
    await expect(page.getByText('How It Works').first()).toBeVisible();
  });

  test('shows Why Interleaved Practice section', async ({ page }) => {
    await expect(page.getByText(/why interleaved practice/i)).toBeVisible();
    await expect(page.getByText(/blocked practice/i)).toBeVisible();
  });

  test('shows Yardage Book section', async ({ page }) => {
    await expect(page.getByText(/yardage book/i).first()).toBeVisible();
    await expect(page.getByText(/recency-weighted/i)).toBeVisible();
  });

  test('shows Smart Club Selection section', async ({ page }) => {
    await expect(page.getByText(/smart club selection/i)).toBeVisible();
    await expect(page.getByText(/simulation/i).first()).toBeVisible();
  });

  test('renders SVG diagrams', async ({ page }) => {
    // Should have at least the blocked vs interleaved diagram
    const svgs = page.locator('svg');
    const count = await svgs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('shows research citations', async ({ page }) => {
    await expect(page.getByText(/fazeli/i)).toBeVisible();
    await expect(page.getByText(/mousavi/i)).toBeVisible();
  });

  test('shows proximity putting section', async ({ page }) => {
    await expect(page.getByText(/proximity putting/i)).toBeVisible();
  });

  test('shows scoring zone section', async ({ page }) => {
    await expect(page.getByText(/scoring zone/i)).toBeVisible();
  });
});

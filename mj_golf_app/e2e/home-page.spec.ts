import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
});

test('shows Play section with Course Mgmt and Yardage Book buttons', async ({ page }) => {
  await expect(page.getByText('Play', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Course Mgmt' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Yardage Book' })).toBeVisible();
});

test('shows Practice section with Start Practice and Sessions buttons', async ({ page }) => {
  await expect(page.getByText('Practice', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start Practice' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sessions' })).toBeVisible();
});

test('Course Mgmt button navigates to /strategy', async ({ page }) => {
  await page.getByRole('link', { name: 'Course Mgmt' }).first().click();
  await expect(page).toHaveURL(/\/strategy/);
});

test('Yardage Book button navigates to /yardage', async ({ page }) => {
  await page.getByRole('link', { name: 'Yardage Book' }).click();
  await expect(page).toHaveURL(/\/yardage/);
});

test('Start Practice button navigates to /session/new', async ({ page }) => {
  await page.getByRole('link', { name: 'Start Practice' }).click();
  await expect(page).toHaveURL(/\/session\/new/);
});

test('Sessions button navigates to /sessions', async ({ page }) => {
  await page.getByRole('link', { name: 'Sessions' }).first().click();
  await expect(page).toHaveURL(/\/sessions/);
});

test('shows Recent Sessions header', async ({ page }) => {
  await expect(page.getByText('Recent Sessions')).toBeVisible();
});

test('shows heading and subtitle', async ({ page }) => {
  await expect(page.getByText("Madhu's Yardage Book")).toBeVisible();
  await expect(page.getByText('Powered by real data and statistics.')).toBeVisible();
});

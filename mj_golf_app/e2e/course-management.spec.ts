import { test, expect, type Page } from '@playwright/test';

// --- Mock data ---

const MOCK_COURSES = [
  {
    id: 'course-1',
    name: 'Claremont CC',
    par: 68,
    slope: 123,
    rating: 68.1,
    designers: ['Alister MacKenzie'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

function makeMockHole(n: number) {
  return {
    id: `hole-${n}`,
    courseId: 'course-1',
    holeNumber: n,
    par: n <= 4 ? 4 : n === 5 ? 3 : 4,
    yardages: { blue: 350 + n * 10, white: 320 + n * 10, red: 280 + n * 10 },
    heading: 45,
    tee: { lat: 37.84 + n * 0.001, lng: -122.24, elevation: 100 },
    pin: { lat: 37.84 + n * 0.001 + 0.003, lng: -122.237, elevation: 105 },
    targets: [],
    centerLine: [],
    hazards:
      n <= 3
        ? [
            {
              name: `Bunker ${n}A`,
              type: 'fairway_bunker',
              penalty: 0.3,
              confidence: 'high',
              source: 'claude-vision',
              polygon: [
                { lat: 37.84, lng: -122.24 },
                { lat: 37.841, lng: -122.24 },
                { lat: 37.841, lng: -122.239 },
              ],
              status: 'accepted',
            },
          ]
        : [],
    fairway: [],
    green: [],
    playsLikeYards: null,
    notes: n === 1 ? 'Favor left side off the tee' : null,
  };
}

const MOCK_COURSE_WITH_HOLES = {
  ...MOCK_COURSES[0],
  holes: Array.from({ length: 18 }, (_, i) => makeMockHole(i + 1)),
};

/** Mock all API routes needed for the Course Management page. */
async function setupApiMocks(page: Page) {
  await page.route('**/api/auth/check', (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route('**/api/courses', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_COURSES });
    }
    return route.continue();
  });
  await page.route('**/api/courses/course-1', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_COURSE_WITH_HOLES });
    }
    return route.continue();
  });
  await page.route('**/api/courses/course-1/holes/*', (route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url();
      const holeNumber = parseInt(url.split('/').pop()!);
      const hole = MOCK_COURSE_WITH_HOLES.holes.find(
        (h) => h.holeNumber === holeNumber,
      );
      return route.fulfill({ json: hole ?? {} });
    }
    return route.continue();
  });
  await page.route('**/api/clubs', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
  await page.route('**/api/shots', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
}

/** Mock auth + return empty courses list. */
async function setupEmptyMocks(page: Page) {
  await page.route('**/api/auth/check', (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route('**/api/courses', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
  await page.route('**/api/clubs', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
  await page.route('**/api/shots', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
}

/** Wait for the Course Management page to finish loading (title visible). */
async function waitForCourseManagement(page: Page) {
  await page.waitForSelector('h1:has-text("Course Management")', {
    timeout: 10_000,
  });
}

// --- Tests ---

test.describe('course management — page structure', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/strategy');
    await waitForCourseManagement(page);
  });

  test('page loads with title "Course Management"', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Course Management');
  });

  test('shows course selector dropdown', async ({ page }) => {
    const select = page.locator('select');
    await expect(select).toBeVisible();
    await expect(
      page.locator('option', { hasText: 'Claremont CC' }),
    ).toBeAttached();
  });

  test('shows tee box selector', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Blue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'White' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Red' })).toBeVisible();
  });

  test('shows hole selector grid with holes 1-18', async ({ page }) => {
    for (let i = 1; i <= 18; i++) {
      await expect(
        page.getByRole('button', { name: String(i), exact: true }),
      ).toBeVisible();
    }
  });

  test('hole navigation works', async ({ page }) => {
    const hole2Button = page.getByRole('button', { name: '2', exact: true });
    await hole2Button.click();
    await page.waitForTimeout(300);

    // Hole 2 button should have the active/primary styling (bg-primary text-white)
    await expect(hole2Button).toHaveClass(/bg-primary/);
  });

  test('shows Hole View / Game Plan tabs', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Hole View' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Game Plan' }),
    ).toBeVisible();
  });

  test('sim toggle is disabled when no shot data exists', async ({ page }) => {
    const simButton = page.getByRole('button', { name: 'Sim' });
    await expect(simButton).toBeVisible();
    await expect(simButton).toBeDisabled();
  });
});

test.describe('course management — empty state', () => {
  test('shows "No courses imported" with link to /admin when no courses exist', async ({
    page,
  }) => {
    await setupEmptyMocks(page);
    await page.goto('/strategy');
    await waitForCourseManagement(page);
    await page.waitForTimeout(300);

    await expect(page.getByText(/no courses imported/i)).toBeVisible();
    const importLink = page.getByRole('link', { name: /import a course/i });
    await expect(importLink).toBeVisible();
    await expect(importLink).toHaveAttribute('href', '/admin');
  });
});

test.describe('course management — hamburger menu', () => {
  test('hamburger menu shows "Course Management"', async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/strategy');
    await waitForCourseManagement(page);

    // Open the hamburger menu
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.waitForTimeout(300);

    // Verify "Course Management" link is visible in the drawer
    await expect(
      page.getByRole('link', { name: 'Course Management' }),
    ).toBeVisible();
  });
});

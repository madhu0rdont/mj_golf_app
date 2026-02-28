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
            {
              name: `Water ${n}B`,
              type: 'water',
              penalty: 1,
              confidence: 'high',
              source: 'claude-vision',
              polygon: [
                { lat: 37.842, lng: -122.24 },
                { lat: 37.843, lng: -122.24 },
                { lat: 37.843, lng: -122.239 },
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

/** Mock all API routes needed for admin page (auth + courses). */
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
  await page.route('**/api/admin/*/holes/*', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ json: { ok: true } });
    }
    return route.continue();
  });
  await page.route('**/api/admin/courses/*/refresh-elevation', (route) =>
    route.fulfill({
      json: {
        holes: MOCK_COURSE_WITH_HOLES.holes.map((h) => ({
          holeNumber: h.holeNumber,
          before: h.yardages,
          after: h.yardages,
        })),
      },
    }),
  );
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
}

/** Wait for the Admin page to finish loading (title visible). */
async function waitForAdmin(page: Page) {
  await page.waitForSelector('h1:has-text("Admin")', { timeout: 10_000 });
}

// --- Tests ---

test.describe('admin page — tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/admin');
    await waitForAdmin(page);
  });

  test('shows 3 tab buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Edit Courses' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Penalties' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import Course' })).toBeVisible();
  });

  test('Edit Courses is the default tab', async ({ page }) => {
    // Course selector should be visible on the default tab
    await expect(page.getByLabel('Course')).toBeVisible();
  });

  test('switching to Edit Penalties tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit Penalties' }).click();
    await page.waitForTimeout(300);

    // Should show penalty editor content
    await expect(page.getByLabel('Course')).toBeVisible();
  });

  test('switching to Import Course tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Import Course' }).click();
    await page.waitForTimeout(300);

    // Should show the KML import wizard (step 1 — file upload area)
    await expect(page.getByText(/\.kml/i)).toBeVisible();
  });

  test('switching back to Edit Courses tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Import Course' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Edit Courses' }).click();
    await page.waitForTimeout(300);

    await expect(page.getByLabel('Course')).toBeVisible();
  });
});

test.describe('admin page — Edit Courses tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/admin');
    await waitForAdmin(page);
    await page.waitForTimeout(300);
  });

  test('shows course selector with course name', async ({ page }) => {
    await expect(page.getByLabel('Course')).toBeVisible();
    await expect(page.locator('option', { hasText: 'Claremont CC' })).toBeAttached();
  });

  test('shows Refresh Elevation button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /refresh elevation/i }),
    ).toBeVisible();
  });

  test('shows auto-detect all button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /auto-detect all/i }),
    ).toBeVisible();
  });

  test('shows 18-hole status grid', async ({ page }) => {
    // Holes 1-3 should show "Done" (they have accepted hazards)
    const doneLabels = page.getByText('Done');
    await expect(doneLabels.first()).toBeVisible();

    // Holes without hazards show "--"
    const emptyLabels = page.getByText('--');
    await expect(emptyLabels.first()).toBeVisible();
  });

  test('empty state when no courses', async ({ page }) => {
    await page.unrouteAll();
    await setupEmptyMocks(page);
    await page.goto('/admin');
    await waitForAdmin(page);
    await page.waitForTimeout(300);

    await expect(page.getByText(/no courses imported/i)).toBeVisible();
  });

  test('elevation refresh shows results table', async ({ page }) => {
    await page.getByRole('button', { name: /refresh elevation/i }).click();
    await page.waitForTimeout(500);

    // Should show the before/after table
    await expect(page.getByRole('columnheader', { name: 'Before' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'After' })).toBeVisible();
  });
});

test.describe('admin page — Edit Penalties tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/admin');
    await waitForAdmin(page);
    await page.getByRole('button', { name: 'Edit Penalties' }).click();
    await page.waitForTimeout(500);
  });

  test('shows hazards from multiple holes', async ({ page }) => {
    // Holes 1-3 each have 2 hazards = 6 total
    await expect(page.getByText('Bunker 1A')).toBeVisible();
    await expect(page.getByText('Water 1B')).toBeVisible();
    await expect(page.getByText('Bunker 2A')).toBeVisible();
  });

  test('shows hole number badges', async ({ page }) => {
    await expect(page.getByText('#1').first()).toBeVisible();
    await expect(page.getByText('#2').first()).toBeVisible();
  });

  test('shows hazard type pills', async ({ page }) => {
    await expect(page.getByText('FW Bunker').first()).toBeVisible();
    await expect(page.getByText('Water').first()).toBeVisible();
  });

  test('penalty inputs are editable', async ({ page }) => {
    const penaltyInputs = page.locator('input[type="number"]');
    const count = await penaltyInputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('save button disabled when no changes', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /save all/i });
    await expect(saveButton).toBeDisabled();
  });

  test('save button enabled after editing a penalty', async ({ page }) => {
    const penaltyInputs = page.locator('input[type="number"]');
    await penaltyInputs.first().fill('0.7');

    const saveButton = page.getByRole('button', { name: /save all/i });
    await expect(saveButton).toBeEnabled();
  });

  test('save sends PATCH requests', async ({ page }) => {
    const patchRequests: string[] = [];
    await page.route('**/api/admin/*/holes/*', (route) => {
      if (route.request().method() === 'PATCH') {
        patchRequests.push(route.request().url());
        return route.fulfill({ json: { ok: true } });
      }
      return route.continue();
    });

    const penaltyInputs = page.locator('input[type="number"]');
    await penaltyInputs.first().fill('0.7');
    await page.getByRole('button', { name: /save all/i }).click();
    await page.waitForTimeout(500);

    expect(patchRequests.length).toBeGreaterThan(0);
  });

  test('no hazards message when course has none', async ({ page }) => {
    await page.unrouteAll();
    const emptyHazardsCourse = {
      ...MOCK_COURSE_WITH_HOLES,
      holes: MOCK_COURSE_WITH_HOLES.holes.map((h) => ({ ...h, hazards: [] })),
    };
    await page.route('**/api/auth/check', (route) =>
      route.fulfill({ json: { authenticated: true } }),
    );
    await page.route('**/api/courses', (route) =>
      route.fulfill({ json: MOCK_COURSES }),
    );
    await page.route('**/api/courses/course-1', (route) =>
      route.fulfill({ json: emptyHazardsCourse }),
    );

    await page.goto('/admin');
    await waitForAdmin(page);
    await page.getByRole('button', { name: 'Edit Penalties' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/no hazards mapped/i)).toBeVisible();
  });
});

test.describe('admin page — Import Course tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/admin');
    await waitForAdmin(page);
    await page.getByRole('button', { name: 'Import Course' }).click();
    await page.waitForTimeout(300);
  });

  test('shows upload area', async ({ page }) => {
    await expect(page.getByText(/drag.*drop/i)).toBeVisible();
  });

  test('shows step indicator', async ({ page }) => {
    await expect(page.getByText('Upload')).toBeVisible();
    await expect(page.getByText('Preview')).toBeVisible();
  });

  test('file input accepts .kml files', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    const accept = await fileInput.getAttribute('accept');
    expect(accept).toBe('.kml');
  });
});

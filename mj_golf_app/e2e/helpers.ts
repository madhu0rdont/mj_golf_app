import { type Page } from '@playwright/test';

export async function waitForApp(page: Page) {
  await page.waitForSelector('nav', { timeout: 10000 });
}

export async function clearIndexedDB(page: Page) {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
}

export async function navigateTo(page: Page, tab: 'Home' | 'Bag' | 'Yardage' | 'Course Mgmt') {
  await page.getByRole('link', { name: tab }).click();
  await page.waitForTimeout(300);
}

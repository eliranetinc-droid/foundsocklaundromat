import { test, expect } from '@playwright/test';

test('homepage has correct title and core content', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Laundromat in Brighton, MA/);
  await expect(page.locator('h1')).toContainText(/cleanest/i);
  await expect(page.locator('text=Get Directions')).toBeVisible();
  await expect(page.locator('text=$6.00')).toBeVisible();
  await expect(page.locator('text=Google reviews')).toBeVisible();
});

test('homepage has LocalBusiness JSON-LD', async ({ page }) => {
  await page.goto('/');
  const ld = await page.locator('script[type="application/ld+json"]').first().innerHTML();
  const parsed = JSON.parse(ld);
  expect(parsed['@type']).toBe('Laundry');
  expect(parsed.address.postalCode).toBe('02135');
});

test('no console errors on homepage', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

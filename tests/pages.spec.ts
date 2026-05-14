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

test('pricing page renders prices', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page).toHaveTitle(/Laundromat Prices in Brighton/);
  await expect(page.locator('text=$6.00')).toBeVisible();
  await expect(page.locator('text=$7.75')).toBeVisible();
  await expect(page.locator('text=$0.50')).toBeVisible();
});

test('visit page has hours and address', async ({ page }) => {
  await page.goto('/visit');
  await expect(page).toHaveTitle(/76 Washington/);
  await expect(page.locator('text=Daily 6 AM – 11 PM')).toBeVisible();
});

for (const path of ['/about', '/loyalty', '/app', '/gallery', '/faq']) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        errors.push(msg.text());
      }
    });
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('FAQ page emits FAQPage schema', async ({ page }) => {
  await page.goto('/faq');
  const scripts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  const hasFaq = scripts.some(s => JSON.parse(s)['@type'] === 'FAQPage');
  expect(hasFaq).toBe(true);
});

test('blog index lists posts', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.locator('h1')).toContainText(/Laundry tips/i);
  await expect(page.locator('a[href^="/blog/"]').first()).toBeVisible();
});

test('blog post page renders', async ({ page }) => {
  await page.goto('/blog/welcome');
  await expect(page.locator('h1')).toContainText(/rebuilt our website/i);
  const ld = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  expect(ld.some(s => JSON.parse(s)['@type'] === 'Article')).toBe(true);
});

test('contact form posts to API', async ({ page }) => {
  await page.route('/api/submit-ticket', route => {
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true, ticketId: 1 }) });
  });
  await page.goto('/contact');
  await page.fill('input[name="name"]', 'Test User');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('textarea[name="message"]', 'Test message');
  await page.click('button[type="submit"]');
  await expect(page.locator('[data-status]')).toContainText(/got it/i);
});

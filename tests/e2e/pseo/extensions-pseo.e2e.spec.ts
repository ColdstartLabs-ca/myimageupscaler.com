/**
 * Browser Extension pSEO Tests
 *
 * Tests for the new browser extension category pages (PRD #100):
 * - Extensions hub page (/extensions)
 * - Individual extension pages (/extensions/chrome, /extensions/edge)
 * - SEO metadata and schema
 * - Internal links and navigation
 */

import { test, expect } from '@playwright/test';

const EXTENSIONS_HUB = '/extensions';
const EXTENSION_PAGES = ['/extensions/chrome', '/extensions/edge'];

test.describe('Browser Extension pSEO - Hub Page', () => {
  test('extensions hub page loads successfully', async ({ page }) => {
    const response = await page.goto(EXTENSIONS_HUB);

    expect(response?.status()).toBe(200);

    // Check for proper page title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('extensions hub page has proper SEO elements', async ({ page }) => {
    await page.goto(EXTENSIONS_HUB);

    // Check for meta description
    const metaDescription = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDescription).toBeTruthy();
    expect(metaDescription?.length).toBeGreaterThan(0);

    // Check for canonical link
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
  });

  test('extensions hub displays content', async ({ page }) => {
    await page.goto(EXTENSIONS_HUB);

    // Check for main content
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('extensions hub has links to individual extension pages', async ({ page }) => {
    await page.goto(EXTENSIONS_HUB);

    // Look for links to Chrome and Edge extension pages
    const chromeLink = page.locator('a[href="/extensions/chrome"]');
    const edgeLink = page.locator('a[href="/extensions/edge"]');

    const hasChromeLink = (await chromeLink.count()) > 0;
    const hasEdgeLink = (await edgeLink.count()) > 0;

    // At least Chrome link should be present
    expect(hasChromeLink || hasEdgeLink).toBe(true);
  });
});

test.describe('Browser Extension pSEO - Detail Pages', () => {
  for (const extensionPage of EXTENSION_PAGES) {
    test.describe(`${extensionPage} detail page`, () => {
      test(`${extensionPage} loads successfully`, async ({ page }) => {
        const response = await page.goto(extensionPage);

        expect(response?.status()).toBe(200);

        // Check for proper page title
        const title = await page.title();
        expect(title).toBeTruthy();
        expect(title.length).toBeGreaterThan(0);
      });

      test(`${extensionPage} has proper SEO elements`, async ({ page }) => {
        await page.goto(extensionPage);

        // Check for meta description
        const metaDescription = await page
          .locator('meta[name="description"]')
          .getAttribute('content');
        expect(metaDescription).toBeTruthy();
        expect(metaDescription?.length).toBeGreaterThan(0);

        // Check for canonical link
        const canonical = page.locator('link[rel="canonical"]');
        await expect(canonical).toHaveCount(1);
      });

      test(`${extensionPage} displays content`, async ({ page }) => {
        await page.goto(extensionPage);

        // Check for main content
        const mainContent = page.locator('main');
        await expect(mainContent).toBeVisible();
      });
    });
  }
});

test.describe('Browser Extension pSEO - Navigation', () => {
  test('can navigate from hub to detail pages', async ({ page }) => {
    await page.goto(EXTENSIONS_HUB);

    // Look for Chrome extension link
    const chromeLink = page.locator('a[href="/extensions/chrome"]').first();
    const hasChromeLink = (await chromeLink.count()) > 0;

    if (hasChromeLink) {
      await chromeLink.click();
      await page.waitForURL('**/extensions/chrome');
      expect(page.url()).toContain('/extensions/chrome');
    } else {
      // Try Edge link instead
      const edgeLink = page.locator('a[href="/extensions/edge"]').first();
      await edgeLink.click();
      await page.waitForURL('**/extensions/edge');
      expect(page.url()).toContain('/extensions/edge');
    }
  });
});

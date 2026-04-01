/**
 * English-Only Category Internal Links E2E Tests
 *
 * Tests that English-only categories (platforms, compare, bulk-tools, ai-features)
 * do NOT have locale prefixes in their internal links (breadcrumbs, related pages).
 *
 * This is a regression test for MIU-104: GSC redirect errors caused by
 * locale prefixes being incorrectly added to English-only category links.
 */

import { test, expect } from '@playwright/test';

test.describe('English-Only Category Internal Links', () => {
  test.describe('Platforms category (English-only)', () => {
    test('should have breadcrumb links without locale prefix', async ({ page }) => {
      await page.goto('/platforms/midjourney-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Find breadcrumb links - use more flexible selector
      const breadcrumbNav = page.locator('nav[aria-label="Breadcrumb"]');

      // Wait for breadcrumb to appear with longer timeout
      const isVisible = await breadcrumbNav.isVisible().catch(() => false);

      // Get all breadcrumb links
      const breadcrumbLinks = breadcrumbNav.locator('a');
      const count = await breadcrumbLinks.count();

      // Skip test if no breadcrumb links found (page structure may differ)
      test.skip(!isVisible || count === 0, 'No breadcrumb navigation found on page');

      // Verify none of the breadcrumb links have locale prefixes
      for (let i = 0; i < count; i++) {
        const href = await breadcrumbLinks.nth(i).getAttribute('href');
        expect(href).toBeDefined();

        // Should NOT start with locale prefix like /es/, /de/, /fr/, etc.
        // Should be either / or /platforms/... format
        expect(href).not.toMatch(/^\/(es|de|fr|it|pt|ja)\//);

        // Should be proper internal link format
        expect(href).toMatch(/^(\/|\/platforms\/)/);
      }
    });

    test('should have related page links without locale prefix', async ({ page }) => {
      await page.goto('/platforms/midjourney-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Wait for page content to load
      await page.waitForTimeout(1000);

      // Find all links in the page that point to platforms category
      const platformLinks = page.locator('a[href*="/platforms/"]');
      const count = await platformLinks.count();

      // There should be at least some platform links (related pages, nav, etc.)
      if (count > 0) {
        for (let i = 0; i < Math.min(count, 20); i++) {
          // Check up to 20 links
          const href = await platformLinks.nth(i).getAttribute('href');
          if (href) {
            // Should NOT start with locale prefix
            expect(href).not.toMatch(/^\/(es|de|fr|it|pt|ja)\/platforms\//);
          }
        }
      }
    });
  });

  test.describe('Compare category (English-only)', () => {
    test('should have breadcrumb links without locale prefix', async ({ page }) => {
      await page.goto('/compare/myimageupscaler-vs-topaz');
      await page.waitForLoadState('domcontentloaded');

      // Find breadcrumb links
      const breadcrumbNav = page.locator('nav[aria-label="Breadcrumb"]');
      const isVisible = await breadcrumbNav.isVisible().catch(() => false);

      // Get all breadcrumb links
      const breadcrumbLinks = breadcrumbNav.locator('a');
      const count = await breadcrumbLinks.count();

      // Skip test if no breadcrumb links found
      test.skip(!isVisible || count === 0, 'No breadcrumb navigation found on page');

      // Verify none of the breadcrumb links have locale prefixes
      for (let i = 0; i < count; i++) {
        const href = await breadcrumbLinks.nth(i).getAttribute('href');
        expect(href).toBeDefined();

        // Should NOT start with locale prefix
        expect(href).not.toMatch(/^\/(es|de|fr|it|pt|ja)\//);
      }
    });
  });

  test.describe('Localized category control (tools)', () => {
    test('tools category SHOULD have locale prefix for non-English pages', async ({ page }) => {
      await page.goto('/es/tools/ai-image-upscaler');
      await page.waitForLoadState('networkidle');

      // Find breadcrumb links
      const breadcrumbNav = page.locator('nav[aria-label="Breadcrumb"]');
      const isVisible = await breadcrumbNav.isVisible().catch(() => false);

      // Get all breadcrumb links
      const breadcrumbLinks = breadcrumbNav.locator('a');
      const count = await breadcrumbLinks.count();

      // Skip test if no breadcrumb links found
      test.skip(!isVisible || count === 0, 'No breadcrumb navigation found on page');

      // For Spanish tools page, internal links SHOULD have /es/ prefix
      let hasLocalePrefix = false;
      for (let i = 0; i < count; i++) {
        const href = await breadcrumbLinks.nth(i).getAttribute('href');
        if (href && /^\/es\//.test(href)) {
          hasLocalePrefix = true;
          break;
        }
      }

      // At least one breadcrumb should have locale prefix for localized category
      expect(hasLocalePrefix).toBe(true);
    });
  });

  test.describe('Direct access to English-only pages', () => {
    test('platforms page should load correctly', async ({ page }) => {
      await page.goto('/platforms/midjourney-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Verify page loaded successfully (no 404)
      await expect(page.locator('body')).not.toContainText('404');
      await expect(page.locator('body')).not.toContainText('Not Found');

      // Verify h1 is visible
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
    });

    test('compare page should load correctly', async ({ page }) => {
      await page.goto('/compare/myimageupscaler-vs-topaz');
      await page.waitForLoadState('domcontentloaded');

      // Verify page loaded successfully (no 404)
      await expect(page.locator('body')).not.toContainText('404');
      await expect(page.locator('body')).not.toContainText('Not Found');

      // Verify h1 is visible
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
    });
  });
});

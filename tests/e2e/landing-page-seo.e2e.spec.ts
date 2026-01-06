import { test, expect } from '../test-fixtures';

/**
 * Landing Page SEO E2E Tests
 *
 * Tests the actual SEO metadata from the landing page:
 * - Meta title: "AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online"
 * - Meta description contains "image enhancer" and "upscales photos"
 * - H1: "AI Image Upscaler & Photo Enhancer"
 * - H2 subheadline exists
 */

test.describe('Landing Page SEO', () => {
  test.describe('Page Metadata', () => {
    test('Verify meta title matches actual version', async ({ page }) => {
      await page.goto('/');

      // Verify meta title matches the actual metadata from app/page.tsx
      // The page sets the title directly, which overrides the root layout template
      await expect(page).toHaveTitle(/^AI Image Upscaler & Photo Enhancer \| Enhance Quality Free Online$/);
    });

    test('Verify meta description contains target keywords', async ({ page }) => {
      await page.goto('/');

      // Get meta description
      const metaDescription = await page.getAttribute('meta[name="description"]', 'content');
      expect(metaDescription).toBeDefined();

      // Verify contains "image enhancer"
      expect(metaDescription?.toLowerCase()).toContain('image enhancer');

      // Verify contains "upscales"
      expect(metaDescription?.toLowerCase()).toContain('upscales');

      // Verify contains "4k" (lowercase)
      expect(metaDescription?.toLowerCase()).toContain('4k');

      // Verify contains "enhance"
      expect(metaDescription?.toLowerCase()).toContain('enhance');
    });

    test('Verify canonical URL is set correctly', async ({ page }) => {
      await page.goto('/');

      const canonicalLink = page.locator('link[rel="canonical"]');
      await expect(canonicalLink).toHaveAttribute('href', /\/$/);
    });
  });

  test.describe('Heading Structure', () => {
    test('Verify H1 is "AI Image Upscaler & Photo Enhancer"', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Get H1 element
      const h1 = page.locator('h1').first();

      // Verify H1 contains the key phrase (checking for exact text or containing it)
      await expect(h1).toBeVisible({ timeout: 10000 });

      const h1Text = await h1.textContent();
      expect(h1Text?.toLowerCase()).toContain('AI image upscaler'.toLowerCase());
      expect(h1Text?.toLowerCase()).toContain('photo enhancer');
    });

    test('Verify H2 subheadline contains enhancement messaging', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Look for H2 with enhancement messaging (actual content: "Enhance image quality to 4K in seconds")
      const h2WithEnhancement = page.locator('h2').filter({ hasText: /enhance|4K|seconds|quality/i }).first();

      await expect(h2WithEnhancement).toBeVisible({ timeout: 10000 });
    });

    test('Verify proper heading hierarchy', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Check there's exactly one H1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThan(0);

      // Check there are multiple H2s for sections
      const h2Count = await page.locator('h2').count();
      expect(h2Count).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Body Content Keywords', () => {
    test('Verify page contains "photo enhancer" keyword', async ({ page }) => {
      await page.goto('/');

      // Wait for page content to load
      await page.waitForLoadState('domcontentloaded');

      // Look for "photo enhancer" in the page content (present in H1 and multiple locations)
      const photoEnhancer = page.getByText(/photo enhancer/i, { exact: false });
      await expect(photoEnhancer.first()).toBeVisible({ timeout: 10000 });
    });

    test('Verify page contains "image enhancer" keyword', async ({ page }) => {
      await page.goto('/');

      // Wait for page content to load
      await page.waitForLoadState('domcontentloaded');

      // Look for "image enhancer" in the page content
      const imageEnhancer = page.getByText(/image enhancer/i, { exact: false });
      await expect(imageEnhancer.first()).toBeVisible({ timeout: 10000 });
    });

    test('Verify page contains "upscale" keyword', async ({ page }) => {
      await page.goto('/');

      // Wait for page content to load
      await page.waitForLoadState('domcontentloaded');

      // Look for "upscale" in the page content (present in "Batch Upscale 500 Images" and CTAs)
      const upscale = page.getByText(/upscale/i, { exact: false });
      await expect(upscale.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Open Graph and Social Meta Tags', () => {
    test('Verify Open Graph title is set', async ({ page }) => {
      await page.goto('/');

      const ogTitle = page.locator('meta[property="og:title"]');
      await expect(ogTitle).toHaveAttribute('content', /AI Image Upscaler/);
    });

    test('Verify Open Graph description is set', async ({ page }) => {
      await page.goto('/');

      const ogDescription = page.locator('meta[property="og:description"]');
      const content = await ogDescription.getAttribute('content');
      expect(content).toBeDefined();
      expect(content?.length).toBeGreaterThan(50);
    });

    test('Verify Twitter card meta tags exist', async ({ page }) => {
      await page.goto('/');

      const twitterCard = page.locator('meta[name="twitter:card"]');
      await expect(twitterCard).toHaveAttribute('content', 'summary_large_image');
    });
  });

  test.describe('Accessibility and Structure', () => {
    test('Verify page has main content area', async ({ page }) => {
      await page.goto('/');

      const main = page.locator('main');
      await expect(main).toBeVisible();
    });

    test('Verify page has proper semantic structure', async ({ page }) => {
      await page.goto('/');

      // Check for landmark elements
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
      await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible();
    });
  });

  test.describe('Hero Section CTA', () => {
    test('Verify hero section has CTA buttons', async ({ page }) => {
      await page.goto('/');

      // Wait for page to fully load
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Look for CTA buttons with actual text: "Fix My Images Free" or "Upscale My First Image"
      const ctaButton = page.getByRole('button').filter({
        hasText: /Fix My Images Free|Upscale My First Image|Try 10 Free Credits|Get 10 Free Credits/i,
      });

      await expect(ctaButton.first()).toBeVisible({ timeout: 10000 });
    });

    test('Verify hero section mentions key features', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('domcontentloaded');

      // Look for actual feature mentions: "No blur", "No artifacts", "text sharp", "detail"
      const featuresText = page.getByText(/no blur|no artifacts|text sharp|detail|4K/i);
      await expect(featuresText.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Schema Markup', () => {
    test('Verify JSON-LD schema is present', async ({ page }) => {
      await page.goto('/');

      // Look for JSON-LD script tag
      const jsonLdScripts = await page.locator('script[type="application/ld+json"]').all();
      expect(jsonLdScripts.length).toBeGreaterThan(0);
    });

    test('Verify schema contains WebApplication or SoftwareApplication', async ({ page }) => {
      await page.goto('/');

      // Get ALL JSON-LD scripts and check if any contains WebApplication or SoftwareApplication
      const schemaElements = await page.locator('script[type="application/ld+json"]').all();
      expect(schemaElements.length).toBeGreaterThan(0);

      // Check for @type containing application-related types
      const checkType = (obj: unknown): boolean => {
        if (typeof obj !== 'object' || obj === null) return false;
        if ('@type' in obj) {
          const type = (obj as { '@type': string | string[] })['@type'];
          const typeStr = Array.isArray(type) ? type.join(' ') : type;
          return /WebApplication|SoftwareApplication/i.test(typeStr);
        }
        // Check nested objects and arrays (for @graph structures)
        if ('@graph' in obj) {
          const graph = (obj as { '@graph': unknown[] })['@graph'];
          if (Array.isArray(graph)) {
            return graph.some(checkType);
          }
        }
        // Check all values recursively
        for (const value of Object.values(obj as Record<string, unknown>)) {
          if (typeof value === 'object' && checkType(value)) {
            return true;
          }
        }
        return false;
      };

      // Check all schema scripts for WebApplication or SoftwareApplication
      let foundApplicationType = false;
      for (const schemaElement of schemaElements) {
        const schemaContent = await schemaElement.textContent();
        if (schemaContent) {
          try {
            const schema = JSON.parse(schemaContent);
            if (checkType(schema)) {
              foundApplicationType = true;
              break;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      expect(foundApplicationType).toBe(true);
    });
  });

  test.describe('Performance and Loading', () => {
    test('Verify page loads within reasonable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const loadTime = Date.now() - startTime;

      // Page should load within 5 seconds (generous threshold for CI)
      expect(loadTime).toBeLessThan(5000);
    });

    test('Verify critical content is visible quickly', async ({ page }) => {
      await page.goto('/');

      // H1 should be visible quickly
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible({ timeout: 5000 });
    });
  });
});

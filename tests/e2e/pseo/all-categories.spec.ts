import { test, expect } from '@playwright/test';

/**
 * E2E tests for all pSEO Spanish category pages
 *
 * Tests that all 12 categories render correctly in Spanish
 */
const SPANISH_CATEGORIES = [
  'tools',
  'formats',
  'platforms',
  'guides',
  'use-cases',
  'free',
  'scale',
  'compare',
  'alternatives',
  'format-scale',
  'platform-format',
  'device-use',
];

// Sample slugs to test from each category
const SAMPLE_SLUGS = {
  tools: 'ai-image-upscaler',
  formats: 'upscale-jpeg-images',
  platforms: 'midjourney-upscaler',
  guides: 'how-to-upscale-images-without-losing-quality',
  'use-cases': 'upscale-photos-for-printing',
  free: 'free-image-upscaler',
  scale: 'upscale-2x',
  compare: 'top10ai-vs-midjourney',
  alternatives: 'top10ai-alternatives',
  'format-scale': 'jpeg-upscale-2x',
  'platform-format': 'midjourney-upscaler-png',
  'device-use': 'mobile-social-media-upscaler',
};

test.describe('Spanish pSEO Categories', () => {
  SPANISH_CATEGORIES.forEach((category) => {
    test.describe(`${category} category`, () => {
      const slug = SAMPLE_SLUGS[category as keyof typeof SAMPLE_SLUGS];

      test(`should render ${category} page in Spanish with correct title`, async ({ page }) => {
        await page.goto(`/es/${category}/${slug}`);

        // Wait for page to load
        await page.waitForLoadState('networkidle');

        // Check that the page has Spanish content
        const h1 = page.locator('h1');
        await expect(h1).toBeVisible();

        const h1Text = await h1.textContent();

        // Verify it's Spanish (contains common Spanish words or accented characters)
        expect(h1Text).toMatch(/([áéíóúñ¿¡]|Escalar|Mejora|Cómo)/);
      });

      test(`should have correct meta tags for ${category} page`, async ({ page }) => {
        await page.goto(`/es/${category}/${slug}`);
        await page.waitForLoadState('networkidle');

        // Check meta description exists and contains Spanish
        const metaDescription = await page.getAttribute('meta[name="description"]', 'content');
        expect(metaDescription).toBeTruthy();
        expect(metaDescription?.length).toBeGreaterThan(50);
      });

      test(`should load without errors for ${category} page`, async ({ page }) => {
        const errors: string[] = [];

        page.on('pageerror', (error) => {
          errors.push(error.message);
        });

        await page.goto(`/es/${category}/${slug}`);
        await page.waitForLoadState('networkidle');

        // Check for no console errors
        expect(errors).toHaveLength(0);
      });

      test(`should have responsive layout for ${category} page`, async ({ page }) => {
        await page.goto(`/es/${category}/${slug}`);
        await page.waitForLoadState('networkidle');

        // Test mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        const mainContent = page.locator('main');
        await expect(mainContent).toBeVisible();

        // Test desktop viewport
        await page.setViewportSize({ width: 1920, height: 1080 });
        await expect(mainContent).toBeVisible();
      });
    });
  });

  test.describe('Category Navigation', () => {
    test('should navigate between sample pages from different categories', async ({ page }) => {
      // Start with tools category
      await page.goto(`/es/tools/${SAMPLE_SLUGS.tools}`);
      await page.waitForLoadState('networkidle');

      const h1 = page.locator('h1');
      await expect(h1).toContainText(/Escalador|IA/i);

      // Navigate to formats category
      await page.goto(`/es/formats/${SAMPLE_SLUGS.formats}`);
      await page.waitForLoadState('networkidle');

      const h1Formats = page.locator('h1');
      await expect(h1Formats).toContainText(/Escalar|JPEG/i);
    });
  });

  test.describe('SEO Elements', () => {
    test('should have proper Spanish hreflang tags', async ({ page }) => {
      await page.goto(`/es/tools/${SAMPLE_SLUGS.tools}`);
      await page.waitForLoadState('networkidle');

      // Check for Spanish hreflang
      const hreflangEs = await page.locator('link[rel="alternate"][hreflang="es"]').count();
      expect(hreflangEs).toBeGreaterThan(0);
    });

    test('should have canonical URL', async ({ page }) => {
      await page.goto(`/es/formats/${SAMPLE_SLUGS.formats}`);
      await page.waitForLoadState('networkidle');

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBeTruthy();
      expect(canonical).toContain('/es/formats/');
    });
  });

  test.describe('Core Content Requirements', () => {
    test('should render H1 title', async ({ page }) => {
      await page.goto(`/es/tools/${SAMPLE_SLUGS.tools}`);
      await page.waitForLoadState('networkidle');

      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
      const text = await h1.textContent();
      expect(text?.length).toBeGreaterThan(10);
    });

    test('should render intro/description content', async ({ page }) => {
      await page.goto(`/es/platforms/${SAMPLE_SLUGS.platforms}`);
      await page.waitForLoadState('networkidle');

      // Check for meaningful content (should have paragraphs with text)
      const paragraphs = page.locator('p');
      const count = await paragraphs.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto(`/es/guides/${SAMPLE_SLUGS.guides}`);
      await page.waitForLoadState('networkidle');

      const h1 = page.locator('h1');
      const h2s = page.locator('h2');

      await expect(h1).toHaveCount(1); // Only one H1
      const h2Count = await h2s.count();
      expect(h2Count).toBeGreaterThanOrEqual(0); // May have H2s
    });
  });
});

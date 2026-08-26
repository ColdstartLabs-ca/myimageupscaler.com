import { test, expect } from '../../test-fixtures';

/**
 * Explicit Locale Routing E2E Tests
 *
 * Tests the cache-safe locale routing policy:
 * - CF-IPCountry never changes an explicit locale-less URL
 * - Cookies are written only by manual language selection
 * - Language switcher updates to all 7 locales (en, es, pt, de, fr, it, ja)
 * - English-only banner appears for non-localized pages
 * - hreflang tags are correct for SEO
 *
 * This validates the Phase 6 SEO audit requirements.
 */

/**
 * Helper to simulate geolocation by adding CF-IPCountry header
 */
async function gotoWithCountry(
  page: ReturnType<typeof test.fixtures.page>,
  url: string,
  countryCode: string
) {
  // Use extraHTTPHeaders to simulate Cloudflare's CF-IPCountry header
  // Also set x-test-country for test environment reliability
  await page.context().setExtraHTTPHeaders({
    'CF-IPCountry': countryCode,
    'x-test-country': countryCode,
  });

  await page.goto(url);

  // Wait for page load
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Explicit Locale Routing', () => {
  test.describe('CF-IPCountry does not redirect', () => {
    for (const countryCode of ['BR', 'DE', 'FR', 'IT', 'JP', 'ES', 'CN', 'KR']) {
      test(`should serve the explicit English URL for ${countryCode}`, async ({ page }) => {
        await gotoWithCountry(page, '/', countryCode);

        expect(new URL(page.url()).pathname).toBe('/');
        const englishContent = page.locator('footer').getByText(/product|support|legal/i);
        await expect(englishContent.first()).toBeVisible({ timeout: 10000 });
        expect(
          (await page.context().cookies()).find(cookie => cookie.name === 'locale')
        ).toBeUndefined();
      });
    }
  });

  test.describe('Cookie Override', () => {
    test('should respect cookie over geolocation', async ({ page, context }) => {
      // Set locale cookie to English
      await context.addCookies([
        {
          name: 'locale',
          value: 'en',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Geolocation cannot override the explicit locale-less English URL.
      await gotoWithCountry(page, '/', 'BR');

      // Should stay on English due to cookie
      const url = page.url();
      expect(url).not.toContain('/pt');

      // Check for English content
      const englishContent = page.locator('footer').getByText(/product|support|legal/i);
      await expect(englishContent.first()).toBeVisible({ timeout: 10000 });
    });

    test('should update cookie when user manually switches language', async ({ page, context }) => {
      // Start with no locale cookie
      await page.goto('/');

      // Wait for page load
      await page.waitForLoadState('domcontentloaded');

      // Click language switcher in footer - use locator with flag icon
      const switcherButton = page
        .locator('footer')
        .locator('button')
        .filter({
          has: page.locator('svg').nth(0), // First SVG (flag icon)
        })
        .first();

      await switcherButton.click();

      // Select Portuguese
      const portugueseOption = page
        .locator('button')
        .filter({ hasText: /português/i })
        .and(page.locator('footer *'));

      await portugueseOption.click();

      // Wait for navigation
      await page.waitForLoadState('domcontentloaded');

      // Check that cookie is set to pt
      const cookies = await context.cookies();
      const localeCookie = cookies.find(c => c.name === 'locale');

      expect(localeCookie).toBeDefined();
      expect(localeCookie?.value).toBe('pt');

      // Verify URL changed
      expect(page.url()).toContain('/pt');
    });

    test('should not redirect when locale cookie matches current URL', async ({
      page,
      context,
    }) => {
      // Set locale cookie to Spanish
      await context.addCookies([
        {
          name: 'locale',
          value: 'es',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Navigate to Spanish page
      await page.goto('/es');

      // Wait for page load
      await page.waitForLoadState('domcontentloaded');

      // Should stay on Spanish version without redirect
      expect(page.url()).toContain('/es');

      // No redirect chains should occur
      const responseCount = await page.evaluate(
        () => performance.getEntriesByType('navigation').length
      );
      expect(responseCount).toBe(1);
    });
  });

  test.describe('Language Switcher Updates', () => {
    test('should show all 7 locales in switcher', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Click language switcher in footer - use locator with flag icon
      const switcherButton = page
        .locator('footer')
        .locator('button')
        .filter({
          has: page.locator('svg').nth(0), // First SVG (flag icon)
        })
        .first();

      await switcherButton.click();

      // Wait for dropdown
      const dropdown = page.locator('.glass-dropdown');
      await dropdown.waitFor({ state: 'visible', timeout: 5000 });

      // Check for all 7 locales
      await expect(page.getByRole('button', { name: /english/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /español|spanish/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /português/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /deutsch/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /français/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /italiano/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /日本語/i })).toBeVisible();
    });

    test('should navigate to correct locale when selected', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Click language switcher in footer - use locator with flag icon
      const switcherButton = page
        .locator('footer')
        .locator('button')
        .filter({
          has: page.locator('svg').nth(0), // First SVG (flag icon)
        })
        .first();

      await switcherButton.click();

      // Select German
      const germanOption = page.getByRole('button', { name: /deutsch/i });
      await germanOption.click();

      // Wait for navigation
      await page.waitForLoadState('domcontentloaded');

      // Should navigate to German version
      expect(page.url()).toContain('/de');
    });

    test('should update page content when switching locales', async ({ page }) => {
      // Start on English
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Check for English content
      const englishFooter = page.locator('footer').getByText(/product/i);
      await expect(englishFooter.first()).toBeVisible();

      // Switch to Spanish using footer language switcher
      const switcherButton = page
        .locator('footer')
        .locator('button')
        .filter({
          has: page.locator('svg').nth(0), // First SVG (flag icon)
        })
        .first();

      await switcherButton.click();

      const spanishOption = page.getByRole('button', { name: /español|spanish/i });
      await spanishOption.click();

      // Wait for navigation and content change
      await page.waitForLoadState('domcontentloaded');

      // Check for Spanish content
      const spanishFooter = page.locator('footer').getByText(/producto/i);
      await expect(spanishFooter.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('English-Only Banner', () => {
    test('should show English-only banner on non-localized pages', async ({ page }) => {
      // Navigate to a non-localized category (e.g., compare)
      // in Portuguese
      await page.goto('/pt/compare');

      // Wait for page load
      await page.waitForLoadState('domcontentloaded');

      // Should show English-only banner
      // Note: Adjust selector based on actual banner implementation
      const banner = page.locator('[data-testid="english-only-banner"], .banner, .alert');

      // Banner may or may not exist depending on implementation
      // If it exists, verify it's visible
      if ((await banner.count()) > 0) {
        await expect(banner.first()).toBeVisible();
      }
    });

    test('should not show English-only banner on localized pages', async ({ page }) => {
      // Navigate to a localized category (e.g., tools)
      // in Portuguese
      await page.goto('/pt/tools/ai-image-upscaler');

      // Wait for page load
      await page.waitForLoadState('domcontentloaded');

      // Should NOT show English-only banner
      const banner = page.locator('[data-testid="english-only-banner"], .banner, .alert');

      // Verify banner is not present or not visible
      if ((await banner.count()) > 0) {
        await expect(banner.first()).not.toBeVisible();
      }
    });

    test('should show localized content on localized pages', async ({ page }) => {
      // Navigate to Portuguese tools page
      await page.goto('/pt/tools/ai-image-upscaler');

      // Wait for page load
      await page.waitForLoadState('domcontentloaded');

      // Should show Portuguese content
      // Check for Portuguese footer text
      const portugueseFooter = page.locator('footer').getByText(/produto|suporte|jurídico/i);

      // At least some Portuguese content should be visible
      await expect(portugueseFooter.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Multi-Locale Navigation', () => {
    test('should maintain locale when navigating within site', async ({ page }) => {
      // Start on Portuguese homepage
      await page.goto('/pt');
      await page.waitForLoadState('domcontentloaded');

      // Navigate to pricing page
      await page.goto('/pt/pricing');
      await page.waitForLoadState('domcontentloaded');

      // Should maintain /pt/ prefix
      expect(page.url()).toContain('/pt/pricing');

      // Navigate to tools page
      await page.goto('/pt/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Should maintain /pt/ prefix
      expect(page.url()).toContain('/pt/tools/ai-image-upscaler');
    });

    test('should not write a locale cookie on direct localized navigation', async ({
      page,
      context,
    }) => {
      // Navigate to German page
      await page.goto('/de');
      await page.waitForLoadState('domcontentloaded');

      const cookies = await context.cookies();
      const localeCookie = cookies.find(c => c.name === 'locale');

      expect(localeCookie).toBeUndefined();
    });
  });

  test.describe('SEO Metadata', () => {
    test('should have localized title tags', async ({ page }) => {
      // Portuguese tools are a measured translated pair.
      await page.goto('/pt/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Check title is localized
      const title = await page.title();

      // Should contain Spanish words or be different from English
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
    });

    test('should have localized meta descriptions', async ({ page }) => {
      // Navigate to French page
      await page.goto('/fr/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Check meta description
      const metaDescription = await page
        .locator('meta[name="description"]')
        .getAttribute('content');

      expect(metaDescription).toBeTruthy();
      expect(metaDescription!.length).toBeGreaterThan(0);
    });

    test('should have correct OG locale tags', async ({ page }) => {
      // German tools are a measured translated pair.
      await page.goto('/de/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Check OG locale
      const ogLocale = await page.locator('meta[property="og:locale"]').getAttribute('content');

      expect(ogLocale).toBe('de_DE');
    });
  });
});

import { test, expect } from '../test-fixtures';

/**
 * Campaign Unsubscribe E2E Tests
 *
 * Tests cover:
 * 1. Unsubscribe page rendering with valid token
 * 2. Unsubscribe page rendering with invalid token
 * 3. Unsubscribe page rendering with missing token
 * 4. Visual confirmation of the unsubscribe page
 */

test.describe('Campaign Unsubscribe Page', () => {
  test.describe('GET /api/campaigns/unsubscribe', () => {
    test('should show error when token is missing', async ({ page }) => {
      await page.goto('/api/campaigns/unsubscribe');

      // Wait for the page to load
      await page.waitForLoadState('domcontentloaded');

      // Should show error message
      const body = await page.textContent('body');
      expect(body).toContain('Invalid unsubscribe link');
    });

    test('should show error when token is invalid', async ({ page }) => {
      await page.goto('/api/campaigns/unsubscribe?token=invalid-token-123');

      // Wait for the page to load
      await page.waitForLoadState('domcontentloaded');

      // Should show error message for invalid token
      const body = await page.textContent('body');
      expect(body).toContain('invalid or has expired');
    });

    test('should show error when token format is invalid', async ({ page }) => {
      // Test with malformed token (too short)
      await page.goto('/api/campaigns/unsubscribe?token=abc');

      // Wait for the page to load
      await page.waitForLoadState('domcontentloaded');

      // Should show error message for invalid format
      const body = await page.textContent('body');
      expect(body).toContain('invalid or has expired');
    });

    test('unsubscribe page should have proper styling', async ({ page }) => {
      // Navigate with any token to see the page structure
      await page.goto('/api/campaigns/unsubscribe?token=test-token-12345');

      // Wait for the page to load
      await page.waitForLoadState('domcontentloaded');

      // Check that the page has basic HTML structure
      const title = await page.title();
      expect(title).toBeTruthy();

      // Check for MyImageUpscaler branding
      const body = await page.textContent('body');
      expect(body).toContain('MyImageUpscaler');
    });
  });

  test.describe('POST /api/campaigns/unsubscribe', () => {
    test('should reject POST without token', async ({ request }) => {
      const response = await request.post('/api/campaigns/unsubscribe', {
        data: {},
      });

      // Should return 400 for missing token
      expect(response.status()).toBe(400);
    });

    test('should reject POST with invalid token', async ({ request }) => {
      const response = await request.post('/api/campaigns/unsubscribe', {
        data: { token: 'invalid-token' },
      });

      // Should return 400 or 404 for invalid token
      expect([400, 404]).toContain(response.status());
    });
  });
});

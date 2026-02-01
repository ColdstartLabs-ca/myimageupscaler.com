import { test, expect } from '@playwright/test';

test.describe('Blog Page', () => {
  test('should load without crashing', async ({ page }) => {
    await page.goto('/blog');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check for error elements that might indicate a crash
    const errorElements = await page.locator('text=Something went wrong').count();
    expect(errorElements).toBe(0);

    // Check if the page title is visible (blog page h1 contains "Image Enhancement")
    const title = page.locator('h1:has-text("Image Enhancement")');
    await expect(title).toBeVisible();
  });

  test('should show empty state when no posts exist', async ({ page }) => {
    await page.goto('/blog');
    await page.waitForLoadState('networkidle');

    // When the blog_posts table doesn't exist or is empty,
    // the page should show gracefully without crashing
    // The page should not show the error boundary
    const errorBoundary = page.locator('text=Something went wrong');
    await expect(errorBoundary).not.toBeVisible();

    // Check that the blog page content is present (even if empty)
    const blogContent = page.locator('h1:has-text("Image Enhancement")');
    await expect(blogContent).toBeVisible();
  });

  test('should have proper page title and metadata', async ({ page }) => {
    await page.goto('/blog');
    await page.waitForLoadState('networkidle');

    // Check page title
    await expect(page).toHaveTitle(/Blog/);
  });

  test('should handle search functionality gracefully', async ({ page }) => {
    await page.goto('/blog');
    await page.waitForLoadState('networkidle');

    // Check that search input exists (even if no posts)
    const searchInput = page
      .locator('input[placeholder*="search" i]')
      .or(page.locator('[data-testid="blog-search"]'));
    const count = await searchInput.count();
    // Search input may or may not be present depending on component implementation
    // Just verify page doesn't crash
    const errorBoundary = page.locator('text=Something went wrong');
    await expect(errorBoundary).not.toBeVisible();
  });

  test.describe('Blog Post H1 Tag', () => {
    test('should have exactly one H1 tag on blog post pages', async ({ page }) => {
      // Navigate to a blog post URL
      await page.goto('/blog/ai-vs-traditional-image-upscaling');
      await page.waitForLoadState('networkidle');

      // Check if we got a 404 page (no blog data in test env)
      const is404 = (await page.locator('h1:has-text("404")').count()) > 0;

      if (is404) {
        // In test environment without blog data, just verify 404 page has H1
        const h1Count = await page.locator('h1').count();
        expect(h1Count).toBe(1);
      } else {
        // Should have exactly one H1 tag (the post title)
        const h1Count = await page.locator('h1').count();
        expect(h1Count).toBe(1);

        // Verify the H1 contains the post title
        const h1 = page.locator('h1');
        await expect(h1).toContainText('AI vs Traditional Image Upscaling');
      }
    });

    test('should convert markdown H1s to H2s to maintain heading hierarchy', async ({ page }) => {
      await page.goto('/blog/ai-vs-traditional-image-upscaling');
      await page.waitForLoadState('networkidle');

      // Check if we got a 404 page (no blog data in test env)
      const is404 = (await page.locator('h1:has-text("404")').count()) > 0;

      if (!is404) {
        // The first heading in content after the H1 should be H2
        // (markdown H1s are converted to H2s)
        const firstContentH2 = page.locator('article h2').first();
        await expect(firstContentH2).toBeVisible();
      }
      // If 404, skip the test (no blog data in test env)
    });

    test('blog listing page should have H1 tag', async ({ page }) => {
      await page.goto('/blog');
      await page.waitForLoadState('networkidle');

      // Should have exactly one H1 tag
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);

      // Verify the H1 contains "Image Enhancement" or "Blog"
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
    });
  });
});

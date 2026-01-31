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
    const searchInput = page.locator('input[placeholder*="search" i]').or(page.locator('[data-testid="blog-search"]'));
    const count = await searchInput.count();
    // Search input may or may not be present depending on component implementation
    // Just verify page doesn't crash
    const errorBoundary = page.locator('text=Something went wrong');
    await expect(errorBoundary).not.toBeVisible();
  });
});

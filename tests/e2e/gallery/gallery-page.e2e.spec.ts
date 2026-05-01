import { test, expect, Locator } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';

/**
 * Gallery Page Object
 * Provides methods for interacting with the gallery page
 */
class GalleryPage extends BasePage {
  readonly path = '/dashboard/gallery';

  /**
   * Navigates to the gallery page
   */
  async goto(): Promise<void> {
    await super.goto(this.path);
  }

  /**
   * Gets the page title
   */
  get pageTitle(): Locator {
    return this.page.locator('h1').first();
  }

  /**
   * Gets the empty state message
   */
  get emptyState(): Locator {
    return this.page.locator('text=No saved images yet');
  }

  /**
   * Gets the image grid container
   */
  get imageGrid(): Locator {
    return this.page.locator('[class*="grid"]');
  }

  /**
   * Gets all image cards
   */
  get imageCards(): Locator {
    return this.page.locator('[class*="group"][class*="relative"]');
  }

  /**
   * Gets the load more button
   */
  get loadMoreButton(): Locator {
    return this.page.getByRole('button', { name: 'Load More' });
  }

  /**
   * Gets the refresh button
   */
  get refreshButton(): Locator {
    return this.page.getByRole('button', { name: 'Refresh' });
  }

  /**
   * Gets the usage bar
   */
  get usageBar(): Locator {
    return this.page.locator('[class*="bg-surface"]').filter({ hasText: 'images' });
  }

  /**
   * Gets the upgrade banner
   */
  get upgradeBanner(): Locator {
    return this.page.locator('[class*="gradient"]').filter({ hasText: 'Gallery full' });
  }

  /**
   * Gets the upgrade modal
   */
  get upgradeModal(): Locator {
    return this.page.locator('[data-testid="purchase-modal"]');
  }

  /**
   * Gets a specific image card by filename
   */
  getImageCard(filename: string): Locator {
    return this.page.locator(`text=${filename}`).locator('..').locator('..');
  }

  /**
   * Opens the delete confirmation modal for an image
   */
  async openDeleteConfirm(filename: string): Promise<void> {
    const card = this.getImageCard(filename);
    await card.hover();
    await card.getByTitle('Delete').click();
  }

  /**
   * Opens the image preview modal
   */
  async openPreview(filename: string): Promise<void> {
    const card = this.getImageCard(filename);
    await card.hover();
    await card.getByTitle('View full size').click();
  }

  /**
   * Closes the image preview modal
   */
  async closePreview(): Promise<void> {
    await this.page.getByLabel('Close preview').click();
  }

  /**
   * Downloads an image
   */
  async downloadImage(filename: string): Promise<void> {
    const card = this.getImageCard(filename);
    await card.hover();
    await card.getByTitle('Download').click();
  }

  /**
   * Checks if the gallery is empty
   */
  async isEmpty(): Promise<boolean> {
    return this.emptyState.isVisible();
  }

  /**
   * Gets the number of visible image cards
   */
  async getImageCount(): Promise<number> {
    return this.imageCards.count();
  }

  /**
   * Waits for images to load
   */
  async waitForImages(): Promise<void> {
    await this.page.waitForSelector('[class*="group"][class*="relative"]', {
      timeout: 10000,
    });
  }

  /**
   * Checks if load more button is visible
   */
  async hasMoreImages(): Promise<boolean> {
    return this.loadMoreButton.isVisible();
  }

  /**
   * Clicks the upgrade button in the banner
   */
  async clickUpgradeInBanner(): Promise<void> {
    await this.upgradeBanner.getByRole('button', { name: 'Upgrade Now' }).click();
  }

  /**
   * Checks if the upgrade modal is visible
   */
  async isUpgradeModalVisible(): Promise<boolean> {
    return this.upgradeModal.isVisible();
  }

  /**
   * Confirms deletion in modal
   */
  async confirmDelete(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete' }).last().click();
  }

  /**
   * Cancels deletion in modal
   */
  async cancelDelete(): Promise<void> {
    await this.page.getByRole('button', { name: 'Cancel' }).click();
  }
}

/**
 * Gallery Page E2E Tests
 *
 * Tests for the gallery page UI including:
 * - Empty state display
 * - Image grid display
 * - Image actions (view, download, delete)
 * - Usage bar and upgrade prompts
 * - Pagination
 */
test.describe('Gallery Page', () => {
  let galleryPage: GalleryPage;

  test.beforeEach(async ({ page }) => {
    galleryPage = new GalleryPage(page);
  });

  test.describe('Page Navigation', () => {
    test('should navigate to gallery page from sidebar', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API to return empty state
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [],
              total: 0,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 0,
              max_allowed: 10,
            },
          }),
        });
      });

      await page.goto('/en/dashboard');
      await page.waitForLoadState('networkidle');

      // Click on Gallery in sidebar
      const galleryLink = page.getByRole('button', { name: 'Gallery' });
      await expect(galleryLink).toBeVisible();
      await galleryLink.click();

      // Should be on gallery page
      await page.waitForURL('/en/dashboard/gallery');
      await expect(galleryPage.pageTitle).toBeVisible();
    });

    test('should load gallery page directly', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [],
              total: 0,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 0,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await expect(galleryPage.pageTitle).toBeVisible();
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no images', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API to return empty state
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [],
              total: 0,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 0,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await expect(galleryPage.emptyState).toBeVisible();
      await expect(page.getByText('Save your first image')).toBeVisible();
    });
  });

  test.describe('Image Grid', () => {
    test('should display images in grid', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API with images
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [
                {
                  id: 'img-1',
                  user_id: 'user-1',
                  original_filename: 'test-image-1.jpg',
                  storage_path: 'gallery/user-1/test-1.jpg',
                  signed_url: 'https://example.com/image1.jpg',
                  width: 1024,
                  height: 1024,
                  model_used: 'Real-ESRGAN',
                  created_at: new Date().toISOString(),
                },
                {
                  id: 'img-2',
                  user_id: 'user-1',
                  original_filename: 'test-image-2.jpg',
                  storage_path: 'gallery/user-1/test-2.jpg',
                  signed_url: 'https://example.com/image2.jpg',
                  width: 2048,
                  height: 2048,
                  model_used: 'Real-ESRGAN',
                  created_at: new Date().toISOString(),
                },
              ],
              total: 2,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 2,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await galleryPage.waitForImages();

      const imageCount = await galleryPage.getImageCount();
      expect(imageCount).toBe(2);
    });

    test('should show image metadata', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API with an image
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [
                {
                  id: 'img-1',
                  user_id: 'user-1',
                  original_filename: 'test-image.jpg',
                  storage_path: 'gallery/user-1/test.jpg',
                  signed_url: 'https://example.com/image.jpg',
                  width: 1024,
                  height: 1024,
                  model_used: 'Real-ESRGAN',
                  created_at: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 1,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await galleryPage.waitForImages();

      // Check for filename and model
      await expect(page.getByText('test-image.jpg')).toBeVisible();
      await expect(page.getByText('Real-ESRGAN')).toBeVisible();
    });
  });

  test.describe('Image Actions', () => {
    test('should open preview modal on view click', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [
                {
                  id: 'img-1',
                  user_id: 'user-1',
                  original_filename: 'test-image.jpg',
                  storage_path: 'gallery/user-1/test.jpg',
                  signed_url: 'https://example.com/image.jpg',
                  width: 1024,
                  height: 1024,
                  model_used: 'Real-ESRGAN',
                  created_at: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 1,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await galleryPage.waitForImages();

      // Open preview
      await galleryPage.openPreview('test-image.jpg');

      // Preview modal should be visible
      await expect(page.getByLabel('Close preview')).toBeVisible();
    });

    test('should open delete confirmation modal', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [
                {
                  id: 'img-1',
                  user_id: 'user-1',
                  original_filename: 'test-image.jpg',
                  storage_path: 'gallery/user-1/test.jpg',
                  signed_url: 'https://example.com/image.jpg',
                  width: 1024,
                  height: 1024,
                  model_used: 'Real-ESRGAN',
                  created_at: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 1,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await galleryPage.waitForImages();

      // Open delete confirmation
      await galleryPage.openDeleteConfirm('test-image.jpg');

      // Delete modal should be visible
      await expect(page.getByText('Delete Image')).toBeVisible();
      await expect(page.getByText('Are you sure you want to delete this image?')).toBeVisible();
    });

    test('should cancel delete', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [
                {
                  id: 'img-1',
                  user_id: 'user-1',
                  original_filename: 'test-image.jpg',
                  storage_path: 'gallery/user-1/test.jpg',
                  signed_url: 'https://example.com/image.jpg',
                  width: 1024,
                  height: 1024,
                  model_used: 'Real-ESRGAN',
                  created_at: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 1,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await galleryPage.waitForImages();

      // Open delete confirmation
      await galleryPage.openDeleteConfirm('test-image.jpg');

      // Cancel delete
      await galleryPage.cancelDelete();

      // Modal should be closed
      await expect(page.getByText('Delete Image')).not.toBeVisible();

      // Image should still be there
      const imageCount = await galleryPage.getImageCount();
      expect(imageCount).toBe(1);
    });
  });

  test.describe('Usage Bar', () => {
    test('should display usage bar with correct count', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [],
              total: 0,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 5,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await expect(page.getByText('5 / 10 images')).toBeVisible();
    });
  });

  test.describe('Refresh', () => {
    test('should refresh gallery on button click', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      let callCount = 0;

      // Mock the gallery API
      await page.route('/api/gallery*', route => {
        callCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [],
              total: 0,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: callCount,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      expect(callCount).toBeGreaterThanOrEqual(1);

      await galleryPage.refreshButton.click();
      await page.waitForLoadState('networkidle');

      // Should have made additional API calls
      expect(callCount).toBeGreaterThan(1);
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper heading structure', async ({ page }) => {
      // Mock authenticated state
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: 'mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Mock the gallery API
      await page.route('/api/gallery*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              images: [],
              total: 0,
              page: 1,
              page_size: 12,
              has_more: false,
            },
            usage: {
              current_count: 0,
              max_allowed: 10,
            },
          }),
        });
      });

      await galleryPage.goto();
      await galleryPage.checkBasicAccessibility();
    });
  });
});

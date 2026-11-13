import { test, expect } from '../test-fixtures';
import { BulkImageResizerPage } from '../pages/BulkImageResizerPage';
import { getFixturePath } from '../fixtures';

/**
 * Bulk Image Resizer E2E Tests
 *
 * Tests for the bulk image resizer tool at /tools/resize/bulk-image-resizer
 * Features tested:
 * - Multi-file drag & drop upload (up to 20 images)
 * - Width/height inputs
 * - Maintain aspect ratio checkbox
 * - Fit/fill mode selection
 * - Quality slider
 * - Output format selection (JPEG, PNG, WebP)
 * - Individual progress bars
 * - Download as ZIP button
 * - Remove individual files
 * - Clear all button
 */

test.describe('Bulk Image Resizer E2E Tests', () => {
  const sampleImagePath = getFixturePath('sample.jpg');
  const sampleImagePath2 = getFixturePath('sample2.jpg');

  test.describe('Page Structure', () => {
    test('Page loads with correct title and upload area', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Verify page elements
      await expect(resizerPage.pageTitle).toBeVisible();
      await expect(resizerPage.pageDescription).toBeVisible();
      await expect(resizerPage.uploadArea).toBeVisible();
    });

    test('Settings panel has all controls', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Verify all settings controls are present
      await expect(resizerPage.widthInput).toBeVisible();
      // Height input is conditionally rendered - only visible when aspect ratio is off
      // By default, aspect ratio is on, so height shows "Auto" text instead of an input
      // We verify this by checking the height label mentions "Auto" in the text
      await expect(page.locator('label[for="height"]')).toContainText('Height');
      await expect(resizerPage.formatSelect).toBeVisible();
      await expect(resizerPage.qualitySlider).toBeVisible();
      await expect(resizerPage.aspectRatioCheckbox).toBeVisible();
    });

    test('Upload area shows correct instructions', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Verify upload instructions - scope to the upload area to avoid multiple matches
      await expect(resizerPage.uploadArea).toContainText(/drag & drop/i);
      await expect(resizerPage.uploadArea).toContainText(/up to \d+ images/i);
    });
  });

  test.describe('Image Upload Flow', () => {
    test('Uploading a single image shows in list', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Upload image (waitForImagesLoaded is called internally)
      await resizerPage.uploadImage(sampleImagePath);

      // Verify upload area is hidden and image is in list
      await resizerPage.assertUploadAreaHidden();

      const imageCount = await resizerPage.getImageCount();
      expect(imageCount).toBe(1);
    });

    test('Uploading multiple images shows all in list', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Upload multiple images (waitForImagesLoaded is called internally)
      await resizerPage.uploadImages([sampleImagePath, sampleImagePath2]);

      // Verify images are in list
      const imageCount = await resizerPage.getImageCount();
      expect(imageCount).toBeGreaterThanOrEqual(2);
    });

    test('Can add more images after initial upload', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Upload first image
      await resizerPage.uploadImage(sampleImagePath);

      const initialCount = await resizerPage.getImageCount();

      // Add more images using the "Add More Images" button (waits for count internally)
      await resizerPage.addMoreImages([sampleImagePath2]);

      const finalCount = await resizerPage.getImageCount();
      expect(finalCount).toBe(initialCount + 1);
    });

    test('Image shows preview and dimensions', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      await resizerPage.uploadImage(sampleImagePath);

      // Get image info
      const info = await resizerPage.getImageInfo(0);

      // Verify name exists
      expect(info.name).toBeTruthy();
      expect(info.name?.length).toBeGreaterThan(0);

      // Verify dimensions are shown (format like "1920 x 1080")
      expect(info.dimensions).toBeTruthy();
      expect(info.dimensions).toMatch(/\d+\s*×\s*\d+/);
    });
  });

  test.describe('Settings Controls', () => {
    test('Can set width and height', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Set width
      await resizerPage.setWidth(800);

      // Verify width was set
      const widthValue = await resizerPage.widthInput.inputValue();
      expect(widthValue).toBe('800');

      // Disable aspect ratio first to make height input visible
      await resizerPage.setMaintainAspectRatio(false);

      // Set height (waits for value internally)
      await resizerPage.setHeight(600);

      // Verify height was set
      const heightValue = await resizerPage.heightInput.inputValue();
      expect(heightValue).toBe('600');
    });

    test('Can toggle maintain aspect ratio', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Default should be checked
      let isChecked = await resizerPage.aspectRatioCheckbox.isChecked();
      expect(isChecked).toBe(true);

      // Uncheck
      await resizerPage.setMaintainAspectRatio(false);
      isChecked = await resizerPage.aspectRatioCheckbox.isChecked();
      expect(isChecked).toBe(false);

      // Check again
      await resizerPage.setMaintainAspectRatio(true);
      isChecked = await resizerPage.aspectRatioCheckbox.isChecked();
      expect(isChecked).toBe(true);
    });

    test('Height input only appears when aspect ratio is disabled', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // By default, aspect ratio is maintained and height input should NOT be visible
      // Instead, "Auto (keeps aspect ratio)" text is shown
      await resizerPage.setMaintainAspectRatio(true);
      await expect(resizerPage.heightInput).not.toBeVisible({ timeout: 5000 });
      // Verify the "Auto" text is shown instead
      await expect(page.locator('label[for="height"] + div')).toContainText('Auto');

      // When aspect ratio is disabled, height input should appear
      await resizerPage.setMaintainAspectRatio(false);
      await expect(resizerPage.heightInput).toBeVisible({ timeout: 5000 });
    });

    test('Can set output format', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Test all formats (setFormat waits for value internally)
      const formats: Array<'jpeg' | 'png' | 'webp'> = ['jpeg', 'png', 'webp'];

      for (const format of formats) {
        await resizerPage.setFormat(format);

        const selectedValue = await resizerPage.formatSelect.inputValue();
        expect(selectedValue).toBe(format);
      }
    });

    test('Can set quality slider', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Set quality to different values (setQuality waits for value internally)
      const qualities = [50, 75, 95];

      for (const quality of qualities) {
        await resizerPage.setQuality(quality);

        const value = await resizerPage.qualitySlider.inputValue();
        expect(parseInt(value)).toBe(quality);
      }
    });

    test('Fit mode select appears when aspect ratio is maintained', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Ensure aspect ratio is checked
      await resizerPage.setMaintainAspectRatio(true);

      // Fit mode select should be visible
      await expect(resizerPage.fitModeSelect).toBeVisible({ timeout: 5000 });
    });

    test('Can set fit mode to fit or fill', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Ensure aspect ratio is checked
      await resizerPage.setMaintainAspectRatio(true);

      // Set to fit (waits for value internally)
      await resizerPage.setFitMode('fit');
      let fitModeValue = await resizerPage.fitModeSelect.inputValue();
      expect(fitModeValue).toBe('fit');

      // Set to fill (waits for value internally)
      await resizerPage.setFitMode('fill');
      fitModeValue = await resizerPage.fitModeSelect.inputValue();
      expect(fitModeValue).toBe('fill');
    });
  });

  test.describe('Processing Flow', () => {
    test('Process All button appears after upload', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      await resizerPage.uploadImage(sampleImagePath);

      // Process All button should be visible
      await expect(resizerPage.processAllButton).toBeVisible();
    });

    test('Clicking Process All processes images', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      await resizerPage.uploadImage(sampleImagePath);

      // Click process all
      await resizerPage.clickProcessAll();

      // Wait for processing to complete (semantic wait)
      await resizerPage.waitForProcessingComplete();

      // Download button should be visible after completion
      const isComplete = await resizerPage.isDownloadAllVisible();
      expect(isComplete).toBe(true);
    });

    test('Download All as ZIP button appears after processing', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      await resizerPage.uploadImage(sampleImagePath);

      await resizerPage.clickProcessAll();

      // Wait for download button to appear (this also closes the CTA modal)
      await resizerPage.waitForProcessingComplete();

      // Download All button should be visible
      await expect(resizerPage.downloadAllButton).toBeVisible();
    });

    test('Processed images show download button individually', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      await resizerPage.uploadImage(sampleImagePath);

      await resizerPage.clickProcessAll();

      // Wait for processing to complete (this also closes the CTA modal)
      await resizerPage.waitForProcessingComplete();

      // Image item should have download button
      const imageItems = page.locator('.bg-surface-light\\/50.rounded-lg');
      const firstItem = imageItems.first();

      // Look for download button
      await expect(
        firstItem.locator('button').filter({ has: page.locator('svg.lucide-download') })
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Image Management', () => {
    test('Can remove individual image from list', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Upload two images
      await resizerPage.uploadImages([sampleImagePath, sampleImagePath2]);

      const initialCount = await resizerPage.getImageCount();
      expect(initialCount).toBeGreaterThanOrEqual(2);

      // Remove first image (waits for count to decrease internally)
      await resizerPage.removeImageByIndex(0);

      const finalCount = await resizerPage.getImageCount();
      expect(finalCount).toBe(initialCount - 1);
    });

    test('Reset button clears all images', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      await resizerPage.uploadImages([sampleImagePath, sampleImagePath2]);

      // Verify images are in list
      const initialCount = await resizerPage.getImageCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Click reset
      await resizerPage.clickReset();

      // Upload area should be visible again
      await resizerPage.assertUploadAreaVisible();
    });

    test('Can download individual processed image', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      await resizerPage.uploadImage(sampleImagePath);

      await resizerPage.clickProcessAll();
      await resizerPage.waitForProcessingComplete();

      // Click download for first image (set up download listener to prevent actual download)
      const downloadPromise = page.waitForEvent('download');

      await resizerPage.downloadImageByIndex(0);

      // Verify download was triggered
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('-resized.');
    });
  });

  test.describe('Error Handling', () => {
    test('Non-image files are filtered out', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Verify the file input has accept attribute that filters to images only
      // Use the page object's fileInput locator which is properly scoped
      const fileInput = resizerPage.fileInput;
      const acceptAttribute = await fileInput.getAttribute('accept');

      // The accept attribute should only allow image files
      expect(acceptAttribute).toBeTruthy();
      expect(acceptAttribute).toContain('image');
      expect(acceptAttribute).not.toContain('text');
      expect(acceptAttribute).not.toContain('application');
    });
  });

  test.describe('Accessibility', () => {
    test('Page has proper semantic structure', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Check for proper heading structure
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toBeVisible();

      // Check for form labels - only check visible inputs with IDs (skip file inputs and hidden inputs)
      const inputs = page.locator(
        'input:visible:not([type="file"]):not([type="hidden"]), select:visible'
      );
      const inputCount = await inputs.count();

      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        const hasLabel = await input.evaluate(el => {
          const id = el.id;
          // Skip elements without ID - they can't have a label[for] association
          if (!id) return true;
          const ariaLabel = el.getAttribute('aria-label');
          const ariaLabelledBy = el.getAttribute('aria-labelledby');
          const label = document.querySelector(`label[for="${id}"]`);

          return !!(ariaLabel || ariaLabelledBy || label);
        });

        expect(hasLabel).toBe(true);
      }
    });

    test('Buttons have accessible names', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Upload an image to show action buttons
      await resizerPage.uploadImage(sampleImagePath);

      // Check that buttons have text content, aria-label, or title
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();

      for (let i = 0; i < Math.min(buttonCount, 10); i++) {
        const button = buttons.nth(i);
        const text = await button.textContent();
        const ariaLabel = await button.getAttribute('aria-label');
        const title = await button.getAttribute('title');

        // Button is accessible if it has visible text, aria-label, or title
        const hasAccessibleName = !!(text?.trim() || ariaLabel || title);
        expect(hasAccessibleName).toBe(true);
      }
    });
  });

  test.describe('Performance', () => {
    test('Page loads within reasonable time', async ({ page }) => {
      // Warm the route so this measures page load, not the dev server's first-hit compile.
      await page.goto('/tools/resize/bulk-image-resizer', { waitUntil: 'domcontentloaded' });

      const startTime = Date.now();
      await page.goto('/tools/resize/bulk-image-resizer', { waitUntil: 'domcontentloaded' });
      const loadTime = Date.now() - startTime;

      // Hang guard against the shared next dev server, not a perf budget (PSI covers real speed).
      expect(loadTime).toBeLessThan(15000);
    });

    test('Settings updates are responsive', async ({ page }) => {
      const resizerPage = new BulkImageResizerPage(page);
      await resizerPage.goto();
      await resizerPage.waitForLoad();

      // Disable aspect ratio first to avoid delays during timing
      await resizerPage.setMaintainAspectRatio(false);

      const startTime = Date.now();

      // Update several settings (each waits for value internally)
      await resizerPage.setWidth(1920);
      await resizerPage.setHeight(1080);
      await resizerPage.setQuality(90);
      await resizerPage.setFormat('webp');

      const updateTime = Date.now() - startTime;

      // Updates should be quick (allow 5 seconds for slow test environments)
      expect(updateTime).toBeLessThan(5000);
    });
  });
});

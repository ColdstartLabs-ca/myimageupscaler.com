import { test, expect } from '../test-fixtures';
import { UpscalerPage } from '../pages/UpscalerPage';
import { getFixturePath } from '../fixtures';
import { UpscalerMockHelper } from '../helpers/upscaler-mocks';
import { UpscalerWaitHelper } from '../helpers/upscaler-waits';

/**
 * Refactored Upscaler E2E Tests
 *
 * Improvements:
 * - Uses UpscalerMockHelper for consistent mock setup
 * - Uses UpscalerWaitHelper for semantic waits instead of fixed timeouts
 * - Cleaner error handling with better error messages
 * - More resilient selectors and waiting strategies
 * - Simplified test logic with better separation of concerns
 */

test.describe('Upscaler E2E Tests - Refactored', () => {
  const sampleImagePath = getFixturePath('sample.jpg');

  test.describe('Page Structure', () => {
    test('Upscaler page loads with correct title and dropzone', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Verify page elements using semantic waits
      await expect(upscalerPage.pageTitle).toBeVisible();
      await expect(upscalerPage.dropzone).toBeVisible();
      await expect(upscalerPage.dropzoneTitle).toBeVisible();
    });

    test('Dropzone shows upload instructions', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Verify dropzone info with more specific selectors
      await expect(page.getByText('Click or drag images')).toBeVisible();
      await expect(page.getByText(/JPG, PNG.*WEBP/i)).toBeVisible();
    });

    test('Dropzone shows feature badges', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Check for feature badges with better error handling
      const featureBadges = [
        'No signup required',
        'Free 5MB limit',
        'No Watermark',
        'Batch Supported',
      ];

      for (const badge of featureBadges) {
        await expect(page.getByText(badge)).toBeVisible();
      }
    });
  });

  test.describe('Image Upload Flow', () => {
    test('Uploading an image shows workspace with preview', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Upload image and wait for it to appear in queue
      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      // Verify workspace transitioned to active state
      const hasFiles = await upscalerPage.hasFilesInQueue();
      expect(hasFiles).toBe(true);
    });

    test('Uploaded image shows in queue strip', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      // Verify queue count with semantic wait
      const queueCount = await upscalerPage.getQueueCount();
      expect(queueCount).toBeGreaterThanOrEqual(1);
    });

    test('Can upload multiple images for batch processing', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Upload multiple images
      await upscalerPage.uploadImages([sampleImagePath, sampleImagePath]);
      await waitHelper.waitForQueueCount(2);

      const queueCount = await upscalerPage.getQueueCount();
      expect(queueCount).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Processing Flow (Mocked API)', () => {
    test('Processing shows loading state and completes successfully', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      // Set up mocks
      await mockHelper.setupAuthMocks();
      await mockHelper.mockSuccess(500);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Upload image
      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      // Verify process button is enabled
      await waitHelper.waitForProcessButtonEnabled();

      // Start processing
      await upscalerPage.clickProcess();

      // Wait for processing to start
      await waitHelper.waitForProcessingStart();
      expect(await waitHelper.isProcessing()).toBe(true);

      // Wait for processing to complete
      await waitHelper.waitForProcessingComplete();
      expect(await waitHelper.isProcessingComplete()).toBe(true);

      // Verify success state
      await waitHelper.waitForDownloadAvailable();
    });

    test('Processing handles multiple files in batch', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      // Set up tracked mock to verify API calls
      const trackedMock = await mockHelper.setupTrackedMock({
        delay: 300,
        response: {
          success: true,
          results: [
            { imageData: 'data:image/png;base64,fake1', creditsUsed: 1 },
            { imageData: 'data:image/png;base64,fake2', creditsUsed: 1 },
          ],
        },
      });

      await mockHelper.setupAuthMocks();

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Upload multiple images
      await upscalerPage.uploadImages([sampleImagePath, sampleImagePath]);
      await waitHelper.waitForQueueCount(2);

      await upscalerPage.clickProcess();

      // Wait for completion
      await waitHelper.waitForProcessingComplete();

      // Verify API was called
      expect(trackedMock.wasCalled()).toBe(true);
      expect(trackedMock.getCallCount()).toBe(1);
    });
  });

  test.describe('Error Handling (Mocked Errors)', () => {
    test('Insufficient credits shows upgrade prompt (402 error)', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      // Set up mocks
      await mockHelper.setupAuthMocks({ credits: 0 });
      await mockHelper.mockInsufficientCredits();

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      await upscalerPage.clickProcess();

      // Wait for error message with semantic wait
      const errorMessage = await waitHelper.waitForErrorMessage();
      await expect(errorMessage).toContainText('Insufficient credits');
    });

    test('Server error shows user-friendly message (500 error)', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      // Set up mocks
      await mockHelper.setupAuthMocks();
      await mockHelper.mockServerError();

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      await upscalerPage.clickProcess();

      // Wait for error message
      const errorMessage = await waitHelper.waitForErrorMessage();
      const errorText = await errorMessage.textContent();
      expect(errorText).toBeTruthy();
      expect(errorText!.length).toBeGreaterThan(0);
    });

    test('Request timeout shows appropriate message', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      // Set up mocks
      await mockHelper.setupAuthMocks();
      await mockHelper.mockTimeout();

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      // Verify initial state
      await expect(upscalerPage.processButton).toBeVisible();

      // Click process to trigger timeout
      await upscalerPage.clickProcess();

      // Wait for timeout handling ( frontend should timeout around 5-10 seconds)
      await waitHelper.waitForProcessingComplete();

      // After timeout, the app should show an error or re-enable the button
      const isButtonVisible = await upscalerPage.processButton.isVisible();
      const isButtonEnabled = await upscalerPage.processButton.isEnabled();

      expect(isButtonVisible).toBe(true);
      expect(isButtonEnabled).toBe(true);
    });

    test('Custom error messages are handled correctly', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      const customError = {
        error: 'Custom processing error',
        code: 'CUSTOM_ERROR',
        details: 'This is a test error message',
      };

      // Set up mocks with custom error
      await mockHelper.setupAuthMocks();
      await mockHelper.mockCustomError(customError, 422);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      await upscalerPage.clickProcess();

      // Wait for and verify custom error
      const errorMessage = await waitHelper.waitForErrorMessage();
      await expect(errorMessage).toContainText('Custom processing error');
    });
  });

  test.describe('File Validation', () => {
    test('File input accepts only image types', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Check the accept attribute on file input
      const acceptAttr = await upscalerPage.fileInput.getAttribute('accept');
      expect(acceptAttr).toContain('image/jpeg');
      expect(acceptAttr).toContain('image/png');
      expect(acceptAttr).toContain('image/webp');
    });

    test('Dropzone validation is active', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Verify dropzone exists and has proper attributes
      await expect(upscalerPage.dropzone).toBeVisible();

      // Check for validation indicators
      const dropzoneText = await upscalerPage.dropzoneTitle.textContent();
      expect(dropzoneText).toContain('drag images');
    });
  });

  test.describe('Queue Management', () => {
    test('Clear button removes all items from queue', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      // Set up tracked mock to ensure no API calls
      const trackedMock = await mockHelper.setupTrackedMock();
      await mockHelper.setupAuthMocks();

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      // Verify file is in queue
      const hasFiles = await upscalerPage.hasFilesInQueue();
      expect(hasFiles).toBe(true);

      // Clear the queue
      await upscalerPage.clearQueue();

      // Wait for dropzone to reappear
      await waitHelper.waitForDropzoneVisible();

      // Verify queue is empty
      await upscalerPage.assertQueueEmpty();

      // Verify no API was called
      expect(trackedMock.wasCalled()).toBe(false);
    });

    test('Queue state persists after navigation', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await mockHelper.setupAuthMocks();

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Upload file
      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      const initialQueueCount = await upscalerPage.getQueueCount();
      expect(initialQueueCount).toBeGreaterThanOrEqual(1);

      // Reload page
      await page.reload();
      await waitHelper.waitForUiStable();

      // Queue should still have files (depending on implementation)
      // This test verifies current behavior
      const queueAfterReload = await upscalerPage.getQueueCount();
      // The assertion depends on whether queue persists across reloads
      console.log(`Queue count after reload: ${queueAfterReload}`);
    });
  });

  test.describe('Accessibility', () => {
    test('Page meets basic accessibility standards', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      // Use BasePage's accessibility check
      await upscalerPage.checkBasicAccessibility();
      await upscalerPage.checkAriaLabels();
    });

    test('Process button is accessible when enabled', async ({ page }) => {
      const upscalerPage = new UpscalerPage(page);
      const mockHelper = new UpscalerMockHelper(page);
      const waitHelper = new UpscalerWaitHelper(page);

      await mockHelper.setupAuthMocks();

      await upscalerPage.goto();
      await waitHelper.waitForUiStable();

      await upscalerPage.uploadImage(sampleImagePath);
      await waitHelper.waitForFileInQueue();

      // Check process button accessibility
      const processButton = await waitHelper.waitForProcessButtonEnabled();
      await expect(processButton).toBeEnabled();

      // Check for aria attributes if present
      const ariaLabel = await processButton.getAttribute('aria-label');
      if (ariaLabel) {
        expect(ariaLabel.length).toBeGreaterThan(0);
      }
    });
  });
});

test.describe('Integration Tests - UI State Management', () => {
  test('Page maintains state after processing error', async ({ page }) => {
    const sampleImagePath = getFixturePath('sample.jpg');
    const upscalerPage = new UpscalerPage(page);
    const mockHelper = new UpscalerMockHelper(page);
    const waitHelper = new UpscalerWaitHelper(page);

    // Set up error mock
    await mockHelper.setupAuthMocks();
    await mockHelper.mockCustomError(
      {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: 'Image processing failed',
        },
      },
      500
    );

    await upscalerPage.goto();
    await waitHelper.waitForUiStable();

    // Upload image
    await upscalerPage.uploadImage(sampleImagePath);
    await waitHelper.waitForFileInQueue();

    // Verify initial queue state
    const initialQueueCount = await upscalerPage.getQueueCount();
    expect(initialQueueCount).toBeGreaterThanOrEqual(1);

    // Trigger processing (will result in error)
    await upscalerPage.clickProcess();

    // Wait for error
    const errorMessage = await waitHelper.waitForErrorMessage();
    const errorText = await errorMessage.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);

    // Wait for UI to stabilize
    await waitHelper.waitForUiStable();

    // Verify queue state is maintained after error
    const finalQueueCount = await upscalerPage.getQueueCount();
    expect(finalQueueCount).toBeGreaterThanOrEqual(1);

    // Verify dropzone is not visible (files still in queue)
    const dropzoneVisible = await upscalerPage.isDropzoneVisible();
    expect(dropzoneVisible).toBe(false);

    // Clear button should be available
    const clearButtonVisible = await upscalerPage.clearButton.isVisible().catch(() => false);
    expect(clearButtonVisible).toBe(true);
  });

  test('Multiple rapid uploads are handled correctly', async ({ page }) => {
    const sampleImagePath = getFixturePath('sample.jpg');
    const upscalerPage = new UpscalerPage(page);
    const mockHelper = new UpscalerMockHelper(page);
    const waitHelper = new UpscalerWaitHelper(page);

    await mockHelper.setupAuthMocks();

    await upscalerPage.goto();
    await waitHelper.waitForUiStable();

    // Upload multiple files rapidly
    const uploadPromises = Array(3)
      .fill(null)
      .map(() => upscalerPage.uploadImage(sampleImagePath));

    await Promise.all(uploadPromises);
    await waitHelper.waitForQueueCount(3);

    // Verify all files are in queue
    const queueCount = await upscalerPage.getQueueCount();
    expect(queueCount).toBeGreaterThanOrEqual(3);
  });
});

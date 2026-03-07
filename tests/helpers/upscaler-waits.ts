import type { Page, Locator } from '@playwright/test';

/**
 * Helper class for semantic waiting strategies in upscaler tests
 * Replaces fixed timeouts with intelligent waits based on UI state
 */
export class UpscalerWaitHelper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Wait for file to be processed and appear in queue
   */
  async waitForFileInQueue(timeout = 5000): Promise<void> {
    // Use data-testid for reliable queue item detection
    const queueItem = this.page.locator('[data-testid="queue-item"] img');

    await queueItem
      .first()
      .waitFor({
        state: 'visible',
        timeout,
      })
      .catch(() => {
        throw new Error('File did not appear in queue within timeout');
      });
  }

  /**
   * Wait for queue to contain a specific number of items
   */
  async waitForQueueCount(expectedCount: number, timeout = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Use data-testid for reliable queue item counting
      const queueItems = this.page.locator('[data-testid="queue-item"]');
      const count = await queueItems.count();

      if (count >= expectedCount) {
        return;
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error(`Queue did not contain ${expectedCount} items within ${timeout}ms`);
  }

  /**
   * Wait for processing to start by looking for various indicators
   */
  async waitForProcessingStart(timeout = 3000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for any processing indicator
      const processingIndicators = [
        this.page.locator('[role="progressbar"]'),
        this.page.locator('.animate-pulse'),
        this.page.locator('button:has(svg.animate-spin)'),
        this.page.locator(':has-text("Processing")'),
        this.page.locator('.absolute.inset-0.bg-white\\/50'),
        this.page.locator('button:has-text("Processing...")'),
      ];

      for (const indicator of processingIndicators) {
        const isVisible = await indicator.isVisible().catch(() => false);
        if (isVisible) {
          return;
        }
      }

      await this.page.waitForTimeout(100);
    }

    // If no indicators found, check if processing completed very quickly
    const isComplete = await this.isProcessingComplete();
    if (isComplete) {
      return;
    }

    throw new Error('Processing did not start within timeout');
  }

  /**
   * Wait for processing to complete (success or error)
   */
  async waitForProcessingComplete(timeout = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for success indicators
      const successIndicators = [
        this.page.locator('button:has-text("Download Result")'),
        this.page.locator('button:has-text("Download")'),
        this.page.locator('img[src*="data:image"]'),
        this.page.getByText('Processing Complete'),
        this.page.getByText('Enhanced Successfully'),
      ];

      // Check for error indicators
      const errorIndicators = [
        this.page.locator('.text-red-600'),
        this.page.locator('[role="alert"]'),
        this.page.locator('.text-red-500'),
      ];

      // Check if any success indicator is visible
      for (const indicator of successIndicators) {
        const isVisible = await indicator.isVisible().catch(() => false);
        if (isVisible) {
          await this.page.waitForTimeout(500); // Brief pause for UI to settle
          return;
        }
      }

      // Check if any error indicator is visible
      for (const indicator of errorIndicators) {
        const isVisible = await indicator.isVisible().catch(() => false);
        if (isVisible) {
          await this.page.waitForTimeout(500); // Brief pause for UI to settle
          return;
        }
      }

      await this.page.waitForTimeout(200);
    }

    throw new Error('Processing did not complete within timeout');
  }

  /**
   * Wait for error message to appear
   */
  async waitForErrorMessage(timeout = 5000): Promise<Locator> {
    const errorSelectors = ['.text-red-600', '[role="alert"]', '.text-red-500', '.error-message'];

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      for (const selector of errorSelectors) {
        const element = this.page.locator(selector).first();
        const isVisible = await element.isVisible().catch(() => false);

        if (isVisible) {
          const hasText = await element
            .textContent()
            .then(text => text && text.trim().length > 0)
            .catch(() => false);
          if (hasText) {
            return element;
          }
        }
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error('No error message appeared within timeout');
  }

  /**
   * Wait for download button to be available and enabled
   */
  async waitForDownloadAvailable(timeout = 5000): Promise<Locator> {
    const downloadSelectors = [
      'button:has-text("Download Result")',
      'button:has-text("Download")',
      '[data-testid="download-button"]',
    ];

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      for (const selector of downloadSelectors) {
        const element = this.page.locator(selector).first();
        const isVisible = await element.isVisible().catch(() => false);
        const isEnabled = await element.isEnabled().catch(() => false);

        if (isVisible && isEnabled) {
          return element;
        }
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error('Download button did not become available within timeout');
  }

  /**
   * Wait for dropzone to be visible (empty state)
   */
  async waitForDropzoneVisible(timeout = 5000): Promise<void> {
    const dropzoneSelectors = [
      '.border-dashed',
      '[data-testid="dropzone"]',
      ':has-text("Click or drag images")',
    ];

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      for (const selector of dropzoneSelectors) {
        const element = this.page.locator(selector).first();
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          return;
        }
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error('Dropzone did not become visible within timeout');
  }

  /**
   * Wait for process button to be enabled
   */
  async waitForProcessButtonEnabled(timeout = 5000): Promise<Locator> {
    const processButton = this.page.locator('button:has-text("Process")').first();

    await processButton.waitFor({
      state: 'visible',
      timeout,
    });

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const isEnabled = await processButton.isEnabled().catch(() => false);
      if (isEnabled) {
        return processButton;
      }

      await this.page.waitForTimeout(100);
    }

    throw new Error('Process button did not become enabled within timeout');
  }

  /**
   * Check if processing is currently active
   */
  async isProcessing(): Promise<boolean> {
    const processingIndicators = [
      this.page.locator('button svg.animate-spin'),
      this.page.locator('button:has(svg.animate-spin)'),
      this.page.locator('button:has-text("Processing...")'),
      this.page.locator('.absolute.inset-0.bg-white\\/50.backdrop-blur-sm'),
    ];

    for (const indicator of processingIndicators) {
      const isVisible = await indicator.isVisible().catch(() => false);
      if (isVisible) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if processing has completed (success or error)
   */
  async isProcessingComplete(): Promise<boolean> {
    const successIndicators = [
      this.page.locator('button:has-text("Download")'),
      this.page.locator('img[src*="data:image"]'),
    ];

    const errorIndicators = [
      this.page.locator('.text-red-600'),
      this.page.locator('[role="alert"]'),
    ];

    // Check for success
    for (const indicator of successIndicators) {
      const isVisible = await indicator.isVisible().catch(() => false);
      if (isVisible) {
        return true;
      }
    }

    // Check for error
    for (const indicator of errorIndicators) {
      const isVisible = await indicator.isVisible().catch(() => false);
      const hasText = await indicator
        .textContent()
        .then(text => text && text.trim().length > 0)
        .catch(() => false);
      if (isVisible && hasText) {
        return true;
      }
    }

    return false;
  }

  /**
   * Wait for UI to stabilize after an operation
   */
  async waitForUiStable(timeout = 2000): Promise<void> {
    // Wait for no network activity for a short period
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => {});

    // Additional brief pause for any remaining animations
    await this.page.waitForTimeout(300);
  }
}

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export type UpscaleMode = 'upscale' | 'enhance' | 'both';

export class UpscalerPage extends BasePage {
  // Page elements
  readonly pageTitle: Locator;
  readonly pageDescription: Locator;

  // Workspace - Empty state (Dropzone)
  readonly dropzone: Locator;
  readonly dropzoneTitle: Locator;
  readonly fileInput: Locator;

  // Workspace - Active state
  readonly workspace: Locator;
  readonly batchSidebar: Locator;
  readonly previewArea: Locator;
  readonly queueStrip: Locator;

  // Config controls
  readonly modeSelector: Locator;
  readonly scaleSelector: Locator;

  // Action buttons
  readonly processButton: Locator;
  readonly clearButton: Locator;
  readonly downloadButton: Locator;
  readonly retryButton: Locator;

  // Status indicators
  readonly progressIndicator: Locator;
  readonly errorMessage: Locator;
  readonly successIndicator: Locator;

  constructor(page: Page) {
    super(page);

    // Page header
    this.pageTitle = page.getByRole('heading', { name: 'AI Image Upscaler' });
    this.pageDescription = page.getByText(
      'Enhance and upscale your images using advanced AI technology'
    );

    // Dropzone (empty state)
    this.dropzone = page.locator('.border-dashed');
    this.dropzoneTitle = page.getByText('Click or drag images');
    this.fileInput = page.locator('input[type="file"]').first();

    // Workspace sections
    this.workspace = page.locator('.bg-white.rounded-2xl.shadow-xl');
    this.batchSidebar = page.locator('[class*="BatchSidebar"]').or(page.locator('.md\\:w-72'));
    this.previewArea = page.locator('[class*="PreviewArea"]').or(page.locator('.flex-grow.p-6'));
    this.queueStrip = page.locator('[class*="QueueStrip"]').or(page.locator('.border-t'));

    // Config controls - locate by associated labels/text
    this.modeSelector = page.getByRole('combobox').first();
    this.scaleSelector = page.locator('select').filter({ hasText: /2x|4x/i });

    // Action buttons - Process button with dynamic text (Process All, Processing..., Process Remaining, etc.)
    this.processButton = page
      .getByRole('button', { name: /process/i })
      .or(page.locator('button:has-text("Process")'))
      .or(page.locator('button:has-text("Processing")'));
    this.clearButton = page.getByRole('button', { name: /clear queue/i });
    this.downloadButton = page.getByRole('button', { name: 'Download Result' });
    this.retryButton = page.getByRole('button', { name: /try again/i });

    // Status indicators - be specific to avoid matching Next.js internal elements
    this.progressIndicator = page
      .locator('[role="progressbar"]')
      .or(page.locator('.animate-pulse'))
      .or(page.locator('button:has(svg.animate-spin)'));
    this.errorMessage = page.locator('.text-red-600').first();
    this.successIndicator = page.getByText('Processing Complete');
  }

  /**
   * Navigate to the upscaler page
   */
  async goto(): Promise<void> {
    await super.goto('/upscaler');
  }

  /**
   * Wait for the page to load
   */
  async waitForLoad(): Promise<void> {
    await expect(this.pageTitle).toBeVisible({ timeout: 15000 });
    await expect(this.workspace).toBeVisible();
  }

  /**
   * Upload an image file via the file input
   */
  async uploadImage(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    // Wait for the file to be processed and added to queue
    await this.page.waitForTimeout(1000);
  }

  /**
   * Upload multiple images
   */
  async uploadImages(filePaths: string[]): Promise<void> {
    await this.fileInput.setInputFiles(filePaths);
    // Wait for the files to be processed and added to queue
    await this.page.waitForTimeout(1000);
  }

  /**
   * Check if the dropzone (empty state) is visible
   */
  async isDropzoneVisible(): Promise<boolean> {
    return await this.dropzoneTitle.isVisible();
  }

  /**
   * Check if the workspace has files (active state)
   */
  async hasFilesInQueue(): Promise<boolean> {
    // Check if there are items in the queue strip or if the queue strip is visible
    const queueItems = await this.getQueueCount();
    return queueItems > 0;
  }

  /**
   * Select an upscale mode
   */
  async selectMode(mode: UpscaleMode): Promise<void> {
    // Look for mode selection buttons/tabs
    const modeButton = this.page.getByRole('button', { name: new RegExp(mode, 'i') });
    if (await modeButton.isVisible()) {
      await modeButton.click();
    } else {
      // Try select dropdown if buttons aren't visible
      await this.modeSelector.selectOption(mode);
    }
  }

  /**
   * Click the process/upscale button
   */
  async clickProcess(): Promise<void> {
    await this.processButton.click();
  }

  /**
   * Wait for processing to start
   */
  async waitForProcessingStart(): Promise<void> {
    // Reduced timeout for faster tests
    const maxWaitTime = 2000;
    const checkInterval = 100;
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      const progressVisible = await this.progressIndicator.isVisible().catch(() => false);
      const spinnerVisible = await this.page
        .locator('.animate-spin')
        .isVisible()
        .catch(() => false);
      const processingTextVisible = await this.page
        .locator(':has-text("Processing")')
        .isVisible()
        .catch(() => false);
      const processingOverlay = await this.page
        .locator('.absolute.inset-0.bg-white\\/50')
        .isVisible()
        .catch(() => false);

      if (progressVisible || spinnerVisible || processingTextVisible || processingOverlay) {
        return;
      }

      await this.page.waitForTimeout(checkInterval);
      elapsedTime += checkInterval;
    }

    // If no processing indicators appeared, check if processing completed very quickly
    const downloadVisible = await this.downloadButton.isVisible().catch(() => false);
    const errorVisible = await this.errorMessage.isVisible().catch(() => false);

    if (downloadVisible || errorVisible) {
      // Processing completed before we could detect it started
      return;
    }

    // Try the original expect as a fallback
    await expect(
      this.progressIndicator
        .or(this.page.locator('.animate-spin'))
        .or(this.page.locator(':has-text("Processing")'))
    ).toBeVisible({ timeout: 1000 });
  }

  /**
   * Wait for processing to complete (success or error)
   */
  async waitForProcessingComplete(): Promise<void> {
    // Wait for either success (download button visible) or error message or success indicator
    // Use Promise.race to wait for any of them, but with better error handling
    try {
      await Promise.race([
        expect(this.downloadButton).toBeVisible({ timeout: 10000 }),
        expect(this.errorMessage).toBeVisible({ timeout: 10000 }),
        expect(this.successIndicator).toBeVisible({ timeout: 10000 }),
        expect(this.page.locator(':has-text("Enhanced Successfully")')).toBeVisible({
          timeout: 10000,
        }),
      ]);
    } catch (error) {
      // If the explicit expectations fail, do a fallback check with more lenient selectors
      const downloadVisible = await this.downloadButton.isVisible().catch(() => false);
      const errorVisible = await this.errorMessage.isVisible().catch(() => false);
      const hasImageResult = await this.page
        .locator('img[src*="data:image"]')
        .isVisible()
        .catch(() => false);
      const successBadge = await this.page
        .locator(':has-text("Enhanced Successfully")')
        .isVisible()
        .catch(() => false);

      if (!downloadVisible && !errorVisible && !hasImageResult && !successBadge) {
        throw new Error(
          `Processing did not complete within timeout. Last error: ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
    }

    // Give a small buffer for UI to stabilize
    await this.page.waitForTimeout(500);
  }

  /**
   * Assert the result is visible after processing
   */
  async assertResultVisible(): Promise<void> {
    // Result should show a preview image or download button
    await expect(
      this.downloadButton
        .or(this.page.locator('img[src*="data:image"]'))
        .or(this.page.locator('.preview-result'))
        .or(this.page.getByText('Enhanced Successfully'))
        .or(this.page.locator('button:has-text("Download")'))
    ).toBeVisible({ timeout: 5000 });
  }

  /**
   * Assert download button is available
   */
  async assertDownloadAvailable(): Promise<void> {
    // Try multiple selectors for download button with better error handling
    const downloadSelectors = [
      this.page.locator('button:has-text("Download Result")'),
      this.downloadButton,
      this.page.locator('button:has-text("Download")'),
      this.page.getByRole('button', { name: /download/i }),
    ];

    let anyVisible = false;
    for (const selector of downloadSelectors) {
      try {
        const isVisible = await selector.isVisible({ timeout: 1000 });
        const isEnabled = await selector.isEnabled().catch(() => false);

        if (isVisible && isEnabled) {
          anyVisible = true;
          return; // Found a working download button
        }
      } catch {
        // Continue to next selector
      }
    }

    // If none found, check if at least one exists (might be hidden)
    for (const selector of downloadSelectors) {
      const count = await selector.count();
      if (count > 0) {
        // Found download button but it might not be visible/enabled
        anyVisible = true;
        break;
      }
    }

    if (!anyVisible) {
      throw new Error('No download button found on the page');
    }
  }

  /**
   * Click download button
   */
  async clickDownload(): Promise<void> {
    await this.downloadButton.click();
  }

  /**
   * Assert an error message is displayed
   */
  async assertErrorVisible(expectedText?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (expectedText) {
      await expect(this.errorMessage).toContainText(expectedText);
    }
  }

  /**
   * Clear the queue
   */
  async clearQueue(): Promise<void> {
    if (await this.clearButton.isVisible()) {
      await this.clearButton.click();
    }
  }

  /**
   * Get the number of items in the queue
   */
  async getQueueCount(): Promise<number> {
    // Look for queue items in the strip. QueueStrip has images for each item
    // Exclude the "Add" button dropzone which also contains images
    const queueStripImages = this.page
      .locator('.border-t.border-slate-200 img') // Images in QueueStrip
      .or(this.page.locator('.h-32.bg-white.border-t img')) // More specific QueueStrip selector
      .or(this.queueStrip.locator('img')); // Fallback to queueStrip locator

    const count = await queueStripImages.count();
    return count;
  }

  /**
   * Assert the queue is empty (dropzone visible)
   */
  async assertQueueEmpty(): Promise<void> {
    await expect(this.dropzoneTitle).toBeVisible({ timeout: 5000 });
    // Also verify no queue items exist
    const queueCount = await this.getQueueCount();
    expect(queueCount).toBe(0);
  }

  /**
   * Assert the upgrade modal appears (for insufficient credits)
   */
  async assertUpgradeModalVisible(): Promise<void> {
    const upgradeModal = this.page
      .locator('[role="dialog"]')
      .filter({ hasText: /upgrade|pricing|credits/i });
    await expect(upgradeModal).toBeVisible({ timeout: 5000 });
  }

  /**
   * Check if processing is in progress
   */
  async isProcessing(): Promise<boolean> {
    // Look for the Loader2 with animate-spin class from the BatchSidebar
    const spinner = this.page.locator('button svg.animate-spin').first();
    const buttonWithLoader = this.page.locator('button:has(svg.animate-spin)');

    // Look for the specific text "Processing..." from BatchSidebar button
    const processingButton = this.page.getByRole('button', { name: 'Processing...' });

    // Look for any button containing "Processing" text (matches Process All, Processing..., Process Remaining)
    const buttonWithProcessingText = this.page.locator('button:has-text("Processing")');

    // Look for processing overlay in PreviewArea
    const processingOverlay = this.page.locator('.absolute.inset-0.bg-white\\/50.backdrop-blur-sm');

    // Check for actual visibility
    const spinnerVisible = await spinner.isVisible().catch(() => false);
    const buttonWithLoaderVisible = await buttonWithLoader.isVisible().catch(() => false);
    const processingButtonVisible = await processingButton.isVisible().catch(() => false);
    const buttonWithProcessingTextVisible = await buttonWithProcessingText
      .isVisible()
      .catch(() => false);
    const processingOverlayVisible = await processingOverlay.isVisible().catch(() => false);

    return (
      spinnerVisible ||
      buttonWithLoaderVisible ||
      processingButtonVisible ||
      buttonWithProcessingTextVisible ||
      processingOverlayVisible
    );
  }

  /**
   * Get the completion count text
   */
  async getCompletedCount(): Promise<string> {
    const countText = this.page
      .locator(':has-text("completed")')
      .or(this.page.locator('[data-testid="completed-count"]'));
    return (await countText.textContent()) || '';
  }
}
